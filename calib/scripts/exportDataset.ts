// ============================================================
// exportDataset.ts — Scan maps/ → run full pipeline → emit
//   calib/dataset.csv          (feature table, one row per map)
//   calib/labels/<md5>.yaml    (empty calibration template)
//
// Run: npm run calib:export
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { analyzeBeatmap } from "../../src/integration/analyzer.js";
import type { DifficultyResult } from "../../src/types/result.js";

const MAPS_DIR = resolve("maps");
const CALIB_DIR = resolve("calib");
const LABELS_DIR = join(CALIB_DIR, "labels");
const CSV_PATH = join(CALIB_DIR, "dataset.csv");

function collectOsuFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectOsuFiles(full));
    else if (entry.toLowerCase().endsWith(".osu")) out.push(full);
  }
  return out;
}

function md5Of(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

// ---- Feature extraction ----
// Columns follow the AKUTA difficulty model:
//   RC:  sunny star / jack(grade,anchor,sfp,shp,switch,bpm) / stream(grade,hs,bpm)
//        / tech(KPS,trills16,trills24) / stamina(medTot)
//   LN:  pools(CO/DE/WC/TE) + bpm
//   VIBRO: verdict label + bpm

interface Row {
  [k: string]: string | number;
}

function extractFeatures(file: string, text: string, r: DifficultyResult): Row {
  const c = r.custom;
  const ga = r.gridAnalysis;
  const segs = ga?.segments ?? [];
  const streamType = c.stream.streamType ?? "";
  const trills = c.tech.rollTrill.trills || "";
  const pool = c.ln;

  return {
    file: file.slice(MAPS_DIR.length + 1),
    md5: md5Of(text),
    notes: r.meta.lnRatio != null ? "" : "",
    durationSec: Math.round((ga && ga.cells.length > 0 ? ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime : 0) / 1000),
    bpm: r.meta.bpm,
    lnRatio: +(r.meta.lnRatio ?? 0).toFixed(4),
    // sunny
    sunnyStar: +(r.sunny.star ?? -1).toFixed(3),
    // effective BPM / pattern
    effBPM: c.equivalentBPM.adjustedBPM,
    effPattern: c.equivalentBPM.patternType,
    // grid
    mainKeyType: ga?.mainKeyType?.keyType ?? "",
    mainKeyBPM: ga?.mainKeyType?.bpm ?? 0,
    mainKeyPct: ga?.mainKeyType?.percentage ?? 0,
    gridSwitch: ga?.gridSwitch ?? 0,
    gridSwitchLabel: ga?.gridSwitchLabel ?? "",
    vibroLabel: ga?.vibroLabel ?? "",
    segCount: segs.length,
    // jack
    jackGrade: c.jack.densityGrade ?? "",
    anchorCount: c.jack.anchorCount,
    singleFingerPressure: +c.jack.singleFingerPressure.toFixed(3),
    singleHandPressure: +c.jack.singleHandPressure.toFixed(3),
    jackImbal: +c.jack.imbalanceTotal.toFixed(3),
    sfP90: c.anchor.sf.p90,
    sfP50: c.anchor.sf.p50,
    sfP100: c.anchor.sf.p100,
    // stream
    streamType,
    streamGrade: c.stream.densityGrade ?? "",
    isHandstream: streamType.includes("HandStream") ? 1 : 0,
    brokenMax: +c.stream.brokenMax.toFixed(2),
    // tech
    graceCount: c.tech.graceCount,
    kps1f: +c.tech.burst.singleFingerKPS.toFixed(2),
    kps1h: +c.tech.burst.oneHandKPS.toFixed(2),
    kps2h: +c.tech.burst.bothHandsKPS.toFixed(2),
    trills,
    // stamina
    staminaMedTot: Math.round(c.stamina.medTotalTime),
    staminaRatio: +c.stamina.stretchRatio.toFixed(3),
    staminaSwitch: c.stamina.switchFrequency,
    // LN
    lnStrictRatio: +(c.ln.strictLNRatio ?? 0).toFixed(4),
    lnOverlay: c.ln.overlayCount,
    lnShield: c.ln.shieldCount,
    lnInverse: c.ln.inverseCount,
    lnOuro: c.ln.ouroborosCount,
    lnPoolCO: +pool.coordinationPoolScore.toFixed(3),
    lnPoolDE: +pool.densityPoolScore.toFixed(3),
    lnPoolWC: +pool.wildcardPoolScore.toFixed(3),
    lnPoolTE: +pool.technicalPoolScore.toFixed(3),
  };
}

const CSV_COLUMNS = [
  "file", "md5", "durationSec", "bpm", "lnRatio",
  "sunnyStar", "effBPM", "effPattern", "mainKeyType", "mainKeyBPM", "mainKeyPct",
  "gridSwitch", "gridSwitchLabel", "vibroLabel", "segCount",
  "jackGrade", "anchorCount", "singleFingerPressure", "singleHandPressure", "jackImbal",
  "sfP90", "sfP50", "sfP100",
  "streamType", "streamGrade", "isHandstream", "brokenMax",
  "graceCount", "kps1f", "kps1h", "kps2h", "trills",
  "staminaMedTot", "staminaRatio", "staminaSwitch",
  "lnStrictRatio", "lnOverlay", "lnShield", "lnInverse", "lnOuro",
  "lnPoolCO", "lnPoolDE", "lnPoolWC", "lnPoolTE",
];

function emitLabelYaml(row: Row, labelPath: string): void {
  const lines = [
    `# ${row["md5"]}`,
    `map: "${(row["file"] as string).replace(/"/g, "'")}"`,
    "# 标定规则：",
    "#   isvibro: true → 无视其余字段，结果=VIBRO（类型见 vibroLabel 列）",
    "#   isLN:    true → 同时填 RC 与 LN",
    "#   否则    → 仅填 RC",
    "# RC/LN 数值 = 段位 + 子档换算：low=x-0.25 / mid=x / high=x+0.25（例：3 low → 2.75）",
    "isvibro: false",
    "isLN: false",
    "RC:",
    "LN:",
    'note: ""',
    "",
  ];
  writeFileSync(labelPath, lines.join("\n"));
}

function toCsvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main(): Promise<void> {
  mkdirSync(LABELS_DIR, { recursive: true });
  const files = collectOsuFiles(MAPS_DIR);
  console.log(`[calib] ${files.length} maps found`);

  const rows: Row[] = [];
  let failed = 0;
  let skippedHeavy = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      failed++;
      console.log(`  [skip] unreadable ${file}`);
      continue;
    }
    // quick heavy guard (mirror src/index.ts)
    const hoIdx = text.indexOf("[HitObjects]");
    let noteCount = 0;
    if (hoIdx >= 0) {
      let pos = hoIdx + 12;
      while (pos < text.length) {
        const next = text.indexOf("\n", pos);
        const lineEnd = next >= 0 ? next : text.length;
        let hasNote = false;
        for (let j = pos; j < lineEnd; j++) {
          const ch = text[j]!;
          if (ch === "/" && j + 1 < lineEnd && text[j + 1] === "/") break;
          if (ch !== " " && ch !== "\t" && ch !== "\r") { hasNote = true; break; }
        }
        if (hasNote) noteCount++;
        if (next < 0) break;
        pos = next + 1;
      }
    }
    if (noteCount > 30000) {
      skippedHeavy++;
      console.log(`  [skip] heavy ${noteCount} notes: ${file.slice(MAPS_DIR.length + 1)}`);
      continue;
    }

    let row: Row | null = null;
    try {
      const result = analyzeBeatmap(text);
      row = extractFeatures(file, text, result);
    } catch (err) {
      failed++;
      console.log(`  [fail] ${file}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    rows.push(row);
    const labelPath = join(LABELS_DIR, `${row["md5"]}.yaml`);
    if (!existsSync(labelPath)) emitLabelYaml(row, labelPath);
    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${files.length}`);
  }

  const csv = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => toCsvCell(r[c] ?? "")).join(","))].join("\n");
  writeFileSync(CSV_PATH, csv + "\n");
  console.log(`[calib] wrote ${CSV_PATH} (${rows.length} rows, ${failed} failed, ${skippedHeavy} heavy-skipped)`);
  console.log(`[calib] labels → ${LABELS_DIR}/ (${rows.length} template files)`);
}

await main();
