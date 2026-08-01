// ============================================================
// WebSocket manager — connects to tosu runtime
// ============================================================

import type { TosuStateMessage } from "../types/tosu.js";
import { parseModsFromData } from "./mods.js";

export type BeatmapChangeHandler = (msg: TosuStateMessage) => void;
export type StateChangeHandler = (msg: TosuStateMessage) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private endpoint: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onBeatmapChange: BeatmapChangeHandler;
  private onStateChange: StateChangeHandler;
  private lastBeatmapMd5 = "";
  private lastModSig = "";

  constructor(endpoint: string, onBeatmapChange: BeatmapChangeHandler, onStateChange: StateChangeHandler) {
    this.endpoint = endpoint;
    this.onBeatmapChange = onBeatmapChange;
    this.onStateChange = onStateChange;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.endpoint);
      this.ws.onopen = () => {
        this.updateStatus("connected");
      };
      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      this.ws.onclose = () => {
        this.updateStatus("disconnected");
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.updateStatus("error");
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as TosuStateMessage;
      // Ignore error messages
      if ((msg as Record<string, unknown>).error) return;

      // Always notify state changes (Playing, SongSelect, etc.)
      this.onStateChange(msg);

      const beatmap = msg.beatmap;
      if (!beatmap) return;

      // Detect beatmap change via MD5 or checksum
      const md5 = (beatmap.md5 ?? beatmap.checksum ?? "").toLowerCase();
      const beatmapChanged = !!md5 && md5 !== this.lastBeatmapMd5;

      // Detect mod change (DT/NC/HT/IN/HO/rate/...): only trust the mod
      // signature when this packet carries explicit mod info OR explicitly
      // reports "no mods" (so closing a mod back to nomod also re-triggers).
      // Partial packets without a mods payload don't spuriously re-trigger.
      const modData = parseModsFromData(msg as Record<string, unknown>);
      const modChanged =
        (modData.hasModInfo || modData.hasExplicitNoMod) &&
        modData.modSignature !== this.lastModSig;

      if (beatmapChanged || modChanged) {
        if (beatmapChanged) this.lastBeatmapMd5 = md5;
        if (modChanged) this.lastModSig = modData.modSignature;
        this.onBeatmapChange(msg);
      }
    } catch {
      // Ignore malformed messages
    }
  }

  private updateStatus(state: "connected" | "disconnected" | "error"): void {
    const el = document.getElementById("status");
    if (!el) return;
    const labels: Record<string, string> = {
      connected: "Connected — waiting for beatmap...",
      disconnected: "Disconnected — reconnecting...",
      error: "Connection error",
    };
    el.textContent = labels[state] ?? state;
  }
}
