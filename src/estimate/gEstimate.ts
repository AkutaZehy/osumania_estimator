// ============================================================
// estimate/gEstimate.ts — density-map-based type classification + dan
// ============================================================

// Greek naming above 10 dan, following the benchmark reference naming.
const GREEK_BASE: Record<number, string> = {
  11: "Alpha", 12: "Beta", 13: "Gamma", 14: "Delta", 15: "Epsilon",
  16: "Zeta", 17: "Eta", 18: "Theta", 19: "iota", 20: "kappa",
};

export interface GFeatures {
  handMed: number;
  nps: number;
  jackRatio: number;
  burstiness: number;
  fingerMed: number;
  MedTime: number;
  totalTime: number;
}

export function extractFeaturesG(osuText: string): GFeatures | null {
  const lines = osuText.split(/\r?\n/);
  const notes: Array<{ time: number; col: number }> = [];
  let inHitObjects = false;
  for (const line of lines) {
    if (line.trim() === "[HitObjects]") { inHitObjects = true; continue; }
    if (line.startsWith("[")) { inHitObjects = false; continue; }
    if (!inHitObjects || !line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const time = parseInt(parts[2]!);
    const type = parseInt(parts[3] ?? "") || 0;
    if ((type & 128) !== 0) continue;
    const col = parseInt(parts[0]!);
    if (col < 64 || col > 448) continue;
    notes.push({ time, col });
  }
  notes.sort((a, b) => a.time - b.time);
  if (notes.length < 10) return null;

  const firstNote = notes[0]!;
  const lastNote = notes[notes.length - 1]!;
  const totalTime = (lastNote.time - firstNote.time) / 1000;

  const offset = 20, tauMs = 500, decay = Math.exp(-1 / tauMs);
  let smoothed = 0, prevTime = firstNote.time;
  const sv: number[] = [];
  for (let i = 1; i < notes.length; i++) {
    const cur = notes[i]!;
    const dt = cur.time - notes[i - 1]!.time;
    const pressure = 1 / (dt + offset);
    const elapsed = cur.time - prevTime;
    smoothed = smoothed * Math.pow(decay, elapsed) + pressure;
    sv.push(smoothed);
    prevTime = cur.time;
  }
  const sorted = [...sv].sort((a, b) => a - b);
  const n = sorted.length;
  const handMed = sorted[Math.floor(n * 0.5)]!;

  let jackPairs = 0;
  for (let i = 1; i < notes.length; i++) { if (notes[i]!.col === notes[i - 1]!.col) jackPairs++; }
  const jackRatio = jackPairs / (notes.length - 1);
  const handP95 = sorted[Math.floor(n * 0.95)]!;
  const burstiness = handP95 / Math.max(handMed, 0.001);
  const nps = notes.length / totalTime;

  const fp: number[] = [];
  for (let i = 1; i < notes.length; i++) { fp.push(1 / (notes[i]!.time - notes[i - 1]!.time + offset)); }
  fp.sort((a, b) => a - b);
  const fingerMed = fp[Math.floor(fp.length * 0.5)]!;

  const dtimes: number[] = [];
  for (let i = 1; i < notes.length; i++) dtimes.push(notes[i]!.time - notes[i - 1]!.time);
  dtimes.sort((a, b) => a - b);
  const MedTime = dtimes[Math.floor(dtimes.length * 0.5)]!;

  return { handMed, nps, jackRatio, burstiness, fingerMed, MedTime, totalTime };
}

export function scoreTypeG(f: GFeatures): [string, number][] {
  const { handMed, nps, jackRatio, burstiness, fingerMed, MedTime, totalTime } = f;
  const isHighDan = nps > 15 || handMed > 0.2;

  let jack = 0, speed = 0, stamina = 0, tech = 0;

  if (isHighDan) {
    if (jackRatio > 0.05) jack += 3;
    else if (jackRatio > 0.04) jack += 2;
    else if (jackRatio > 0.03) jack += 1;
    if (fingerMed > 0.03) jack += 2;
    else if (fingerMed > 0.02) jack += 1;
    if (totalTime > 180) stamina += 3;
    else if (totalTime > 160) stamina += 2;
    else if (totalTime > 140) stamina += 1;
    if (MedTime > 55) stamina += 2;
    else if (MedTime > 50) stamina += 1;
    if (jackRatio > 0.025 && burstiness > 1.4) tech += 2;
    else if (jackRatio > 0.02 && burstiness > 1.35) tech += 1;
    speed += 1;
  } else {
    if (jackRatio > 0.06) jack += 3;
    else if (jackRatio > 0.05) jack += 2;
    else if (jackRatio > 0.04) jack += 1;
    if (fingerMed > 0.03) jack += 2;
    else if (fingerMed > 0.02) jack += 1;
    if (totalTime > 140) stamina += 2;
    else if (totalTime > 130) stamina += 1;
    if (MedTime > 95) stamina += 2;
    else if (MedTime > 90) stamina += 1;
    if (jackRatio > 0.035) tech += 2;
    else if (jackRatio > 0.025) tech += 1;
    if (burstiness > 1.7) tech += 1;
    speed += 1;
  }

  const total = jack + speed + stamina + tech;
  if (total === 0) return [["speed", 0.25], ["tech", 0.25], ["stamina", 0.25], ["jack", 0.25]];

  const scores: [string, number][] = [
    ["jack", jack / total],
    ["speed", speed / total],
    ["stamina", stamina / total],
    ["tech", tech / total],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores;
}

export function classifyTypeG(scores: [string, number][]): string {
  const [p1, c1] = scores[0]!;
  const [p2, c2] = scores[1]!;
  const diff = c1 - c2;

  if (diff < 0.1) return `${p1}·${p2}`;
  return p1;
}

export function estimateDanG(rc: number, style: string, f: GFeatures): number {
  let dan = rc;
  const mainType = style.split("·")[0];
  switch (mainType) {
    case "jack":
      if (f.handMed > 0.5) dan += 0.3;
      else if (f.handMed < 0.3) dan -= 0.3;
      break;
    case "speed":
      if (f.nps > 25) dan += 0.2;
      else if (f.nps < 15) dan -= 0.2;
      break;
    case "stamina":
      if (f.totalTime > 250) dan += 0.3;
      else if (f.totalTime < 120) dan -= 0.2;
      break;
    case "tech":
      if (f.burstiness > 1.5) dan += 0.2;
      else if (f.burstiness < 1.3) dan -= 0.2;
      break;
  }
  return Math.max(1, Math.min(20, dan));
}

export function formatGEstimate(dan: number, _type: string): string {
  const base = Math.round(dan);
  const frac = dan - base;
  const tier = frac <= -0.125 ? "low" : frac <= 0.125 ? "mid" : "high";
  const name = base >= 11 ? (GREEK_BASE[base] ?? String(base)) : String(base);
  const prefix = base <= 17 ? "Reform" : "";
  return `${prefix ? prefix + " " : ""}${name} ${tier} (${dan.toFixed(2)})`;
}
