// ============================================================
// osumania-estimator — Main entry point
// Auto-executes when bundled and loaded by tosu overlay
// ============================================================

import { WebSocketManager } from "./tosu/websocket.js";
import TosuSocketManager from "./tosu/socket.js";
import { analyzeBeatmap } from "./integration/analyzer.js";
import { showLoading, showResult, showError, showWaiting, showCountdown, updateGameState, updateInGameBar, onSettingsUpdate } from "./ui/display.js";
import { isVibroMap } from "./ett/vibro.js";
import type { TosuStateMessage } from "./types/tosu.js";

// ---- Config ----
const WS_ENDPOINT = "ws://localhost:24050/websocket/v2";
const FETCH_ENDPOINT = "http://localhost:24050/files/beatmap/file";
const SETTINGS_ENDPOINT = "http://localhost:24050/api/counters/settings/osumania-estimator%20by%20Akuta%20Zehy";

// ---- State ----
let lastMd5 = "";
let lastModSig = "";
let isAnalyzing = false;
let analysisId = 0;
let totalDurationMs = 0;
let abortController: AbortController | null = null;

// ---- Fetch .osu file from tosu ----
async function fetchBeatmap(): Promise<string> {
  const res = await fetch(FETCH_ENDPOINT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---- Parse mod flags from tosu mod data (based on map analyser's getModData) ----
function parseModsFromData(data: Record<string, unknown> | undefined): {
  speedRate: number;
  odFlag: string | null;
  modSignature: string;
} {
  // Collect mods from all possible locations (play, menu, resultsScreen, tourney)
  const candidates: unknown[] = [];
  const play = data?.play as Record<string, unknown> | undefined;
  const menu = data?.menu as Record<string, unknown> | undefined;
  const results = data?.resultsScreen as Record<string, unknown> | undefined;

  if (play?.mods != null) candidates.push(play.mods);
  if (menu?.mods != null) candidates.push(menu.mods);
  if (results?.mods != null) candidates.push(results.mods);

  // Also check tourney clients
  const tourney = data?.tourney as Record<string, unknown> | undefined;
  if (tourney) {
    for (const v of Object.values(tourney.clients as Record<string, unknown> ?? {})) {
      const c = v as Record<string, unknown>;
      if (c?.play?.mods != null) candidates.push(c.play.mods);
    }
  }

  // Build mod codes set
  const codes = new Set<string>();
  const modArrays: unknown[][] = [];
  let lazerRate: number | undefined;

  for (const mods of candidates) {
    const m = mods as Record<string, unknown>;
    // Collect from name/str/acronym
    for (const key of ["name", "str", "acronym"]) {
      const val = String(m[key] ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      if (val) codes.add(val);
    }
    // Collect from number/num bitfield
    for (const key of ["number", "num"]) {
      const n = Number(m[key]);
      if (Number.isFinite(n) && n > 0) {
        if ((n & 64) !== 0 || (n & 512) !== 0) codes.add("DT");
        if ((n & 256) !== 0 || (n & 1024) !== 0) codes.add("HT");
        if ((n & 16) !== 0) codes.add("HR");
        if ((n & 2) !== 0) codes.add("EZ");
      }
    }
    // Collect array sub-mods
    if (Array.isArray(m.array)) modArrays.push(m.array as unknown[]);
    if (Array.isArray(mods)) modArrays.push(mods as unknown[]);
  }

  // Process sub-arrays for lazer speed_change
  for (const arr of modArrays) {
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const im = item as Record<string, unknown>;
      const acr = String(im.acronym ?? "").toUpperCase();
      if (acr) codes.add(acr);
      const sc = Number((im.settings as Record<string, unknown>)?.speed_change);
      if (Number.isFinite(sc) && sc > 0) lazerRate = sc;
    }
  }

  // Determine speed rate
  let speedRate = lazerRate ?? 1.0;
  if (!lazerRate) {
    if (codes.has("NC") || codes.has("DT")) speedRate = 1.5;
    else if (codes.has("HT") || codes.has("DC")) speedRate = 0.75;
  }

  // Determine OD flag
  let odFlag: string | null = null;
  if (codes.has("HR")) odFlag = "HR";
  else if (codes.has("EZ")) odFlag = "EZ";

  // Build clean mod signature (only calculation-relevant)
  const modSignature = `${speedRate.toFixed(5)}|${odFlag ?? "none"}`;

  return { speedRate, odFlag, modSignature };
}

// ---- Main beatmap change handler ----
async function onBeatmapChange(msg: TosuStateMessage): Promise<void> {
  const beatmap = msg.beatmap;
  if (!beatmap) return;

  const md5 = (beatmap.md5 ?? beatmap.checksum ?? "").toLowerCase();
  // Parse mods from all tosu data locations (play/menu/resultsScreen/tourney)
  const modData = parseModsFromData(msg as Record<string, unknown>);
  const modSig = modData.modSignature;
  // Log for debugging
  if (modSig !== lastModSig || md5 !== lastMd5) {
  }
  // Re-analyze on beatmap change OR mod signature change
  if ((!md5 || md5 === lastMd5) && modSig === lastModSig) return;
  lastMd5 = md5;
  lastModSig = modSig;

  const gameStar = (msg as any)?.beatmap?.stats?.stars?.total as number | undefined;

  showLoading();

  // Cancel previous analysis immediately
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  // Cancel previous analysis if still running
  const myId = ++analysisId;
  isAnalyzing = true;

  try {
    const osuText = await fetchBeatmap();
    if (myId !== analysisId) return;

    // Quick note count from osu text (count lines after [HitObjects])
    let noteCount = 0;
    const hoIdx = osuText.indexOf("[HitObjects]");
    if (hoIdx >= 0) {
      for (const line of osuText.slice(hoIdx + 12).split("\n")) {
        const t = line.trim();
        if (t && !t.startsWith("//")) noteCount++;
      }
    }
    // Show countdown for heavy maps (>5000 notes): N/1000 seconds
    // Extra 5s delay for user to read the warning
    const baseSec = Math.ceil(noteCount / 1000);
    const countdownSec = baseSec + 5;
    if (baseSec > 5) {
      for (let s = countdownSec; s > 0; s--) {
        if (myId !== analysisId) return;
        showCountdown(`${s}s remaining (switch map to cancel)`);
        await new Promise(r => setTimeout(r, 1000));
      }
      if (myId !== analysisId) return;
    }

    // Run Etterna vibro check in parallel
    const vibroPromise = isVibroMap(osuText);

    const result = analyzeBeatmap(osuText, {
      speedRate: modData.speedRate,
      modFlags: {
        dt: modData.speedRate > 1.0,
        ht: modData.speedRate < 1.0,
        hr: modData.odFlag === "HR",
        ez: modData.odFlag === "EZ",
        da: false,
        in: false,
        ho: false,
      },
    }, signal);

    // Check again after analysis (which can be slow)
    if (myId !== analysisId) return;

    // Apply Etterna vibro result
    const isVibro = await vibroPromise;
    if (isVibro) result.custom.jack.isVibro = true;
    if (gameStar != null) result.meta.gameStar = gameStar;

    showResult(result);
    // Determine total duration from section analysis or grid cells
    const sa = result.sectionAnalysis;
    const ga2 = result.gridAnalysis;
    totalDurationMs = sa?.totalDuration
      ?? (ga2 && ga2.cells.length > 0 ? ga2.cells[ga2.cells.length - 1]!.endTime - ga2.cells[0]!.startTime : 0);
  } catch (err) {
    if (myId !== analysisId) return;
    const message = err instanceof Error ? err.message : "Unknown error";
    showError(`Analysis failed: ${message}`);
  } finally {
    if (myId === analysisId) isAnalyzing = false;
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
    const progress = Math.max(0, Math.min(1, liveTime / totalDurationMs));
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

  // Poll settings periodically (catches dashboard changes)
  pollSettings();
  setInterval(pollSettings, 30000);

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
