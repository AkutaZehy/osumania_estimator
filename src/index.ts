// ============================================================
// osumania-estimator — Main entry point
// Auto-executes when bundled and loaded by tosu overlay
// ============================================================

import { WebSocketManager } from "./tosu/websocket.js";
import TosuSocketManager from "./tosu/socket.js";
import { parseModsFromData } from "./tosu/mods.js";
import { analyzeBeatmap } from "./integration/analyzer.js";
import { createResultCache } from "./utils/resultCache.js";
import { countHitObjects } from "./utils/countNotes.js";
import { timed, makeTicker, DEBUG_TIMING } from "./utils/timing.js";
import { showLoading, showResult, showError, showWaiting, updateGameState, updateInGameBar, onSettingsUpdate } from "./ui/display.js";
import type { DifficultyResult } from "./types/result.js";
import type { TosuStateMessage } from "./types/tosu.js";

// ---- Config ----
const WS_ENDPOINT = "ws://localhost:24050/websocket/v2";
const FETCH_ENDPOINT = "http://localhost:24050/files/beatmap/file";
const SETTINGS_ENDPOINT = "http://localhost:24050/api/counters/settings/osumania-estimator%20by%20Akuta%20Zehy";

// ---- State ----
let lastMd5 = "";
let lastModSig = "";
let analysisId = 0;
let totalDurationMs = 0;
let gridStartTimeMs = 0;
let abortController: AbortController | null = null;

// ---- Result cache ----
// Key = md5 | modSignature. Re-entry on a previously-seen (map, mod) pair
// skips the HTTP fetch and the full pipeline. Memory-only: clears on reload.
// maxSize 50 covers typical play-session map switching (LRU evicts the rest).
const resultCache = createResultCache<DifficultyResult>({ maxSize: 50 });

// ---- Fetch .osu file from tosu ----
async function fetchBeatmap(): Promise<string> {
  const res = await fetch(FETCH_ENDPOINT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---- Parse mod flags from tosu mod data (based on map analyser's getModData) ----
// Moved to src/tosu/mods.ts (see parseModsFromData export).

// ---- Apply a result: render + update playhead state ----
function applyResult(result: DifficultyResult): void {
  timed("render:applyResult", () => showResult(result));
  // Determine total duration from section analysis or grid cells
  const sa = result.sectionAnalysis;
  const ga2 = result.gridAnalysis;
  // Prefer grid duration (section bar uses cell range); fall back to section analysis
  gridStartTimeMs = ga2 && ga2.cells.length > 0 ? ga2.cells[0]!.startTime : 0;
  totalDurationMs = (ga2 && ga2.cells.length > 0
    ? ga2.cells[ga2.cells.length - 1]!.endTime - ga2.cells[0]!.startTime
    : sa?.totalDuration) ?? 0;
}

// ---- Main beatmap change handler ----
async function onBeatmapChange(msg: TosuStateMessage): Promise<void> {
  const beatmap = msg.beatmap;
  if (!beatmap) return;

  const md5 = (beatmap.md5 ?? beatmap.checksum ?? "").toLowerCase();
  // Parse mods from all tosu data locations (play/menu/resultsScreen/tourney)
  const modData = parseModsFromData(msg as Record<string, unknown>);
  const modSig = modData.modSignature;
  // Re-analyze on beatmap change OR mod signature change (websocket layer
  // already gate-keeps, keep the check as a cheap in-flight guard).
  if ((!md5 || md5 === lastMd5) && modSig === lastModSig) return;
  lastMd5 = md5;
  lastModSig = modSig;

  const gameStar = (msg as any)?.beatmap?.stats?.stars?.total as number | undefined;

  // ---- Cache fast path ----
  // Same (md5, mod signature) pair analyzed before → skip fetch + pipeline.
  // The WS gate above already guarantees this only runs on a REAL beatmap or
  // mod change (same map + same mod is filtered there), so realtime updates
  // for map switches / mod toggles keep working — hits just resolve instantly.
  if (md5) {
    const cached = resultCache.get(`${md5}|${modSig}`);
    if (cached) {
      // Cancel any in-flight analysis and invalidate its write-back so a
      // stale (older) result can never overwrite this cached one.
      if (abortController) abortController.abort();
      ++analysisId;
      if (gameStar != null) cached.meta.gameStar = gameStar;
      timed("cache:hit", () => applyResult(cached));
      if (DEBUG_TIMING) console.log(`[perf] cache: hit ${md5}|${modSig}`);
      return;
    }
  }

  showLoading();

  // Cancel previous analysis immediately
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  // Cancel previous analysis if still running
  const myId = ++analysisId;
  const ticker = makeTicker("total-run");

  try {
    ticker.start();
    const fetchTicker = makeTicker("fetch-beatmap");
    fetchTicker.start();
    const osuText = await fetchBeatmap();
    fetchTicker.end();
    if (myId !== analysisId) return;

    // Quick note count from osu text (shared util, no split/trim)
    const noteCount = timed("count", () => countHitObjects(osuText));
    // Heavy map guard: skip analysis for extremely long maps
    if (noteCount > 30000) {
      showError(`Heavy map (${noteCount} notes > 30000) — skipped`);
      return;
    }
    // [LOCK] Countdown for heavy maps (>5000 notes).
    // Disabled after O(n log n) indexing optimization — analysis is fast enough.
    // Keep code for future reference / safety re-enable.
    // const baseSec = Math.ceil(noteCount / 1000);
    // const countdownSec = baseSec + 5;
    // if (baseSec > 5) {
    //   for (let s = countdownSec; s > 0; s--) {
    //     if (myId !== analysisId) return;
    //     showCountdown(`${s}s remaining (switch map to cancel)`);
    //     await new Promise(r => setTimeout(r, 1000));
    //   }
    //   if (myId !== analysisId) return;
    // }

    const result = analyzeBeatmap(osuText, {
      speedRate: modData.speedRate,
      modFlags: {
        dt: modData.speedRate > 1.0,
        ht: modData.speedRate < 1.0,
        hr: modData.odFlag === "HR",
        ez: modData.odFlag === "EZ",
        da: false,
        in: modData.cvtFlag === "IN",
        ho: modData.cvtFlag === "HO",
      },
    }, signal, noteCount);

    // Check again after analysis (which can be slow)
    if (myId !== analysisId) return;

    if (gameStar != null) result.meta.gameStar = gameStar;

    applyResult(result);
    // Cache for fast re-entry on the same (map, mod) pair
    if (md5) timed("cache:put", () => resultCache.put(`${md5}|${modSig}`, result));
    ticker.end();
  } catch (err) {
    if (myId !== analysisId) return;
    const message = err instanceof Error ? err.message : "Unknown error";
    showError(`Analysis failed: ${message}`);
  }
}

// ---- State change handler (every WS message) ----
function onStateChange(msg: TosuStateMessage): void {
  const stateName = msg.state?.name ?? "";
  updateGameState(stateName);

  // No analysis data yet — nothing to highlight
  if (totalDurationMs <= 0) return;

  // Use beatmap.time.live — available during gameplay AND preview (matches PP by Belikhun / ManiaMapAnalyser)
  const liveTime = msg.beatmap?.time?.live;
  if (liveTime != null && Number.isFinite(liveTime)) {
    // Offset by grid start time so the playhead aligns with cell start
    const effectiveTime = liveTime - gridStartTimeMs;
    const progress = Math.max(0, Math.min(1, effectiveTime / totalDurationMs));
    updateInGameBar(progress);
  }
}

// ---- Boot ----
function boot(): void {
  showWaiting();

  // Fetch settings via HTTP polling (works regardless of how overlay is opened)
  let lastSettingsStr = "";
  async function pollSettings(): Promise<void> {
    try {
      const res = await fetch(SETTINGS_ENDPOINT);
      if (!res.ok) return;
      const data = await res.json() as { values?: Record<string, unknown> };
      if (data?.values) {
        const current = JSON.stringify(data.values);
        if (current !== lastSettingsStr) {
          lastSettingsStr = current;
          onSettingsUpdate(data.values);
        }
      }
    } catch { /* tosu not available */ }
  }

  // Also try WebSocket commands for real-time updates
  try {
    const tosuSocket = new TosuSocketManager("127.0.0.1:24050");
    tosuSocket.commands((data: { command: string; message: unknown }) => {
      try {
        const { command, message } = data;
        if (command === "getSettings" && typeof message === "object" && message !== null && !Array.isArray(message)) {
          onSettingsUpdate(message as Record<string, unknown>);
          lastSettingsStr = JSON.stringify(message);
        }
      } catch (err) {
        console.error("[settings] Error handling command:", err);
      }
    });
    if (typeof window !== "undefined" && window.COUNTER_PATH) {
      tosuSocket.sendCommand("getSettings", encodeURI(window.COUNTER_PATH));
    }
  } catch { /* socket.js not available */ }

  // Initial settings fetch (WebSocket commands handle real-time updates thereafter)
  pollSettings();

  // Initialize game data WebSocket
  const ws = new WebSocketManager(WS_ENDPOINT, onBeatmapChange, onStateChange);
  ws.connect();
}

// Auto-execute when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
