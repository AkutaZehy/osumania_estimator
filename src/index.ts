// ============================================================
// osumania-estimator — Main entry point
// Auto-executes when bundled and loaded by tosu overlay
// ============================================================

import { WebSocketManager } from "./tosu/websocket.js";
import { analyzeBeatmap } from "./integration/analyzer.js";
import { showLoading, showResult, showError, showWaiting } from "./ui/display.js";
import type { TosuStateMessage } from "./types/tosu.js";

// ---- Config ----
const WS_ENDPOINT = "ws://localhost:24050/websocket/v2";
const FETCH_ENDPOINT = "http://localhost:24050/files/beatmap/file";

// ---- State ----
let lastMd5 = "";
let isAnalyzing = false;

// ---- Fetch .osu file from tosu ----
async function fetchBeatmap(): Promise<string> {
  const res = await fetch(FETCH_ENDPOINT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---- Parse mod flags from mod bitfield ----
function parseMods(mods: number | undefined): { speedRate: number; dt: boolean; ht: boolean; hr: boolean; ez: boolean } {
  const bits = mods ?? 0;
  const DT = 64;
  const HT = 256;
  const HR = 16;
  const EZ = 2;
  const dt = (bits & DT) !== 0;
  const ht = (bits & HT) !== 0;
  const hr = (bits & HR) !== 0;
  const ez = (bits & EZ) !== 0;
  let speedRate = 1.0;
  if (dt) speedRate = 1.5;
  else if (ht) speedRate = 0.75;
  return { speedRate, dt, ht, hr, ez };
}

// ---- Main beatmap change handler ----
async function onBeatmapChange(msg: TosuStateMessage): Promise<void> {
  const beatmap = msg.beatmap;
  if (!beatmap) return;

  const md5 = (beatmap.md5 ?? beatmap.checksum ?? "").toLowerCase();
  if (!md5 || md5 === lastMd5) return;
  lastMd5 = md5;

  showLoading();

  if (isAnalyzing) return;
  isAnalyzing = true;

  try {
    const osuText = await fetchBeatmap();
    const mods = parseMods(msg.play?.mods);

    const result = analyzeBeatmap(osuText, {
      speedRate: mods.speedRate,
      modFlags: {
        dt: mods.dt,
        ht: mods.ht,
        hr: mods.hr,
        ez: mods.ez,
        da: false,
        in: false,
        ho: false,
      },
    });

    showResult(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    showError(`Analysis failed: ${msg}`);
  } finally {
    isAnalyzing = false;
  }
}

// ---- Boot ----
function boot(): void {
  showWaiting();

  const ws = new WebSocketManager(WS_ENDPOINT, onBeatmapChange);
  ws.connect();
}

// Auto-execute when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
