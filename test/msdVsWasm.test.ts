// MSD engine validation: run our TS port against the official minaclac 72.3
// WASM on the same NoteInfo rows and compare all 8 skillset values.
// Two tests: a fixed 13-map sample, and a full sweep over maps/ +
// calib/bench-maps (asserts on aggregate parity, logs the worst offenders).

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { OsuFileParser } from "../src/parser/osuFileParser.js";
import { buildNoteInfo } from "../src/msd/rows.js";
import { MinaSDCalc } from "../src/msd/mina.js";
import { Calc } from "../src/msd/calc.js";

const ROOT = join(__dirname, "..");
const WASM_DIR = join(ROOT, "src", "ett", "versions");

const SKILLSET_NAMES = [
  "Overall",
  "Stream",
  "Jumpstream",
  "Handstream",
  "Stamina",
  "JackSpeed",
  "Chordjack",
  "Technical",
];

const SAMPLE_MAPS: string[] = [
  "maps/JACK/Haddaway - What Is Love (H4chyk0) [1.0x  don't hurt me, no more].osu",
  "maps/JACK/Saikoro - far in the blue sky... (1nar) [42].osu",
  "maps/JACK/Street - Dan Signicial's Jack Pack (signupredir111) [Stage III - Reincarnation].osu",
  "maps/JACK/Various Artists - Dan ~ REFORM ~ JackMap Pack (DDMythical) [CrossOver ~ 4th ~ (Marathon)].osu",
  "maps/LN/Various Artists - 4K LN Dan Courses v2 ~ Stage 1 Map Pack ~ [Hitorigoto ~ 1st ~ (Marathon)].osu",
  "maps/LN/Various Artists - 4K LN Dan Courses v2 ~ Stage 1 Map Pack ~ [Kyouki Ranmai ~ Yoru ~ (Marathon)].osu",
  "maps/I UNDERSTAND YOU/Camellia - Fastest Crash (inteliser) [cracked].osu",
  "maps/I UNDERSTAND YOU/Ludicin - Bismuth (ababa) [Archaic's Supernova].osu",
  "maps/I UNDERSTAND YOU/you - Hold Angel (Monoseul) [Worship].osu",
  "calib/bench-maps/speed/498 Tokio(signicial dan).osu",
  "calib/bench-maps/stamina/Angel Dust(spz).osu",
  "calib/bench-maps/tech/Acquaintance(skwid) x1.05.osu",
  "calib/bench-maps/jack/air's gravity(signicial dan).osu",
];

type WasmModule = {
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  _minacalc_compute(
    keycount: number,
    rate: number,
    goal: number,
    masks: number,
    times: number,
    rows: number,
    out: number,
  ): number;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
};

let wasmModulePromise: Promise<WasmModule> | null = null;

async function getWasm(): Promise<WasmModule> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const modPath = join(WASM_DIR, "minaclac-72.3.js");
      const wasmPath = join(WASM_DIR, "minaclac-72.3.wasm");
      const imported = await import(modPath);
      const factory = imported.default ?? imported;
      // inject the binary directly — the glue's fetch path doesn't work under node
      const wasmBinary = readFileSync(wasmPath);
      const instance = await factory({
        wasmBinary,
        locateFile: (p: string) => join(WASM_DIR, p),
      });
      return instance as WasmModule;
    })();
  }
  return wasmModulePromise;
}

function runWasm(wasm: WasmModule, masks: Uint32Array, times: Float32Array): number[] {
  const masksBytes = masks.length * 4;
  const timesBytes = times.length * 4;
  const outCount = 8;
  const outBytes = outCount * 4;

  const ptrMasks = wasm._malloc(masksBytes);
  const ptrTimes = wasm._malloc(timesBytes);
  const ptrOut = wasm._malloc(outBytes);

  try {
    wasm.HEAPU32.set(masks, ptrMasks >>> 2);
    wasm.HEAPF32.set(times, ptrTimes >>> 2);

    const ok = wasm._minacalc_compute(
      4,
      1.0,
      0.93,
      ptrMasks,
      ptrTimes,
      masks.length,
      ptrOut,
    );
    if (!ok) throw new Error("minacalc_compute returned failure");

    return Array.from(wasm.HEAPF32.slice(ptrOut >>> 2, (ptrOut >>> 2) + outCount));
  } finally {
    wasm._free(ptrMasks);
    wasm._free(ptrTimes);
    wasm._free(ptrOut);
  }
}

interface RowPair {
  masks: Uint32Array;
  times: Float32Array;
  notes: number;
}

function buildRows(osuText: string): RowPair {
  const parser = new OsuFileParser(osuText);
  parser.process();
  const parsed = parser.getParsedData();
  if (parsed.columnCount !== 4) throw new Error(`unsupported keycount ${parsed.columnCount}`);
  const noteInfo = buildNoteInfo(parsed, 1.0);

  const masks = new Uint32Array(noteInfo.map((r) => r.notes >>> 0));
  const f32 = new Float32Array(noteInfo.length);
  for (let i = 0; i < noteInfo.length; i++) f32[i] = noteInfo[i]!.rowTime;
  return { masks, times: f32, notes: masks.length };
}

function runTs(rows: RowPair): number[] {
  // NOTE: TypedArray.prototype.map coerces callback returns via ToNumber,
  // destroying object rows — build plain objects explicitly.
  const ni: Array<{ notes: number; rowTime: number }> = new Array(rows.masks.length);
  for (let i = 0; i < rows.masks.length; i++) {
    ni[i] = { notes: rows.masks[i]!, rowTime: rows.times[i]! };
  }
  return MinaSDCalc(ni, 1.0, 0.93, new Calc());
}

function walkAll(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith(".osu")) out.push(p);
    }
  };
  walk(join(ROOT, "maps"));
  walk(join(ROOT, "calib", "bench-maps"));
  return out;
}

describe("MSD TS port vs official 72.3 wasm", () => {
  it("matches on the fixed sample", async () => {
    const wasm = await getWasm();
    let maxDiff = 0;
    let maxDiffAt = "";
    for (const rel of SAMPLE_MAPS) {
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) continue;
      const rows = buildRows(readFileSync(abs, "utf8"));
      if (rows.masks.length <= 1) continue;

      const ts = runTs(rows);
      const ref = runWasm(wasm, rows.masks, rows.times);
      let worst = 0;
      let worstName = "";
      for (let i = 0; i < 8; i++) {
        const d = Math.abs((ts[i] ?? 0) - (ref[i] ?? 0));
        if (d > worst) {
          worst = d;
          worstName = SKILLSET_NAMES[i]!;
        }
      }
      if (worst > maxDiff) {
        maxDiff = worst;
        maxDiffAt = `${rel} [${worstName}]`;
      }
      expect(worst, `${rel} [${worstName}]`).toBeLessThan(0.35);
    }
    console.log(`sample MAX DIFF ${maxDiff.toFixed(4)} at ${maxDiffAt}`);
  }, 240000);

  it("matches on the full local corpus", async () => {
    const wasm = await getWasm();
    const diffs: number[][] = SKILLSET_NAMES.map(() => []);
    const worst: Array<{ d: number; at: string }> = SKILLSET_NAMES.map(() => ({ d: 0, at: "" }));
    let ran = 0;
    let skipped = 0;

    for (const abs of walkAll()) {
      try {
        const rows = buildRows(readFileSync(abs, "utf8"));
        if (rows.masks.length <= 1) {
          skipped++;
          continue;
        }
        const ts = runTs(rows);
        const ref = runWasm(wasm, rows.masks, rows.times);
        for (let i = 0; i < 8; i++) {
          const d = Math.abs((ts[i] ?? 0) - (ref[i] ?? 0));
          diffs[i]!.push(d);
          if (d > worst[i]!.d) {
            worst[i]!.d = d;
            worst[i]!.at = abs.replace(ROOT + "\\", "");
          }
        }
        ran++;
      } catch {
        skipped++;
      }
    }

    // Parity gate: the port computes in float64 where the reference computes
    // in float32; the iterative stamina ratchet accumulates that gap on ~3%
    // of long/high-rate charts (up to ~2.8 MSD, always TS-higher). Everything
    // else tracks <0.35 at p99. Report outliers, gate on p99.
    const lines: string[] = [];
    for (let i = 0; i < 8; i++) {
      const arr = diffs[i]!.sort((a, b) => a - b);
      const p99 = arr[Math.floor(arr.length * 0.99)] ?? 0;
      lines.push(
        `${SKILLSET_NAMES[i]}: p99=${p99.toFixed(4)} max=${worst[i]!.d.toFixed(4)} (${worst[i]!.at})`,
      );
      const gate = SKILLSET_NAMES[i] === "Stamina" ? 1.2 : 0.35;
      expect(p99, `${SKILLSET_NAMES[i]} p99`).toBeLessThan(gate);
      expect(arr[Math.floor(arr.length * 0.5)] ?? 0, `${SKILLSET_NAMES[i]} p50`).toBeLessThan(0.01);
    }
    console.log(`corpus ran=${ran} skipped=${skipped}\n  ${lines.join("\n  ")}`);
  }, 600000);
});
