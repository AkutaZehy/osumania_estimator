// ============================================================
// Display module — updates the overlay DOM
// Two-column grid layout for metrics
// ============================================================

import type { DifficultyResult } from "../types/result.js";
import type { DensityMetrics, AnchorTier, LNMetrics } from "../types/custom.js";
import type { PatternCluster } from "../types/patterns.js";
import type { SectionAnalysis, SegmentCategory } from "../custom/sectionAnalysis.js";
import type { GridAnalysisResult, CellResult } from "../custom/gridAnalysis.js";
import { jackBothHandsRatio } from "../custom/gridAnalysis.js";

const DEBUG = true;
function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log("[display]", ...args);
}

/** Get display name for a cluster — use dominant specific type if available */
function clusterName(c: PatternCluster): string {
  if (c.specificTypes.length > 0 && c.specificTypes[0]![1] >= 0.05) {
    return c.specificTypes[0]![0]!;
  }
  return c.pattern;
}

function starColor(star: number): string {
  if (star < 0) return "#aaaaaa";
  if (star < 2) return "#66ccff";
  if (star < 3) return "#66ffcc";
  if (star < 4) return "#66ff66";
  if (star < 5) return "#ccff66";
  if (star < 6) return "#ffcc66";
  if (star < 7) return "#ff8844";
  if (star < 8) return "#ff4444";
  if (star < 9) return "#cc44ff";
  return "#444444";
}

function densityStar(d: DensityMetrics): number {
  return (d.bothHands.maxDensity * 0.6 + d.bothHands.medianDensity * 0.4) / 5;
}

function el(id: string): HTMLElement | null { return document.getElementById(id); }
function setText(id: string, text: string): void { const e = el(id); if (e) e.textContent = text; }
function setHtml(id: string, html: string): void { const e = el(id); if (e) e.innerHTML = html; }
function show(id: string): void { const e = el(id); if (e) { e.style.display = ""; } }
function hide(id: string): void { const e = el(id); if (e) { e.style.display = "none"; } }

function resizeCard(): void {
  const card = document.getElementById("card");
  if (!card) return;
  // Let the card size to its content; body follows via min-height
  const h = Math.max(400, card.scrollHeight + 2);
  document.body.style.minHeight = h + "px";
  debugLog("resizeCard: scrollHeight=%d → body.minHeight=%dpx", card.scrollHeight, h);
}

/** Abbreviate key type names for bars/table: Chordjack→CJ, Jumpstream→JS, Handstream→HS */
function abbrevKeyType(kt: string): string {
  return kt
    .replace(/Chordjack/g, "CJ")
    .replace(/Jumpstream/g, "JS")
    .replace(/Handstream/g, "HS");
}

/** Determine dominant LN pool (CO/DE/WC/TE) from pool scores, returns full name or null */
function dominantLNPool(ln: LNMetrics): string | null {
  const FULL_NAMES: Record<string, string> = { CO: "Coordination", DE: "Density", WC: "Wildcard", TE: "Technical" };
  const pools: Array<[string, number]> = [
    ["CO", ln.coordinationPoolScore],
    ["DE", ln.densityPoolScore],
    ["WC", ln.wildcardPoolScore],
    ["TE", ln.technicalPoolScore],
  ];
  if (pools.every(([, s]) => s <= 0)) return null;
  const maxPool = pools.reduce((a, b) => a[1] > b[1] ? a : b);
  return maxPool[1] > 0 ? FULL_NAMES[maxPool[0]!] ?? maxPool[0]! : null;
}

/** Aggregate grid analysis segment grades into a single grade string */
function aggregateGridGrade(ga: GridAnalysisResult | null, category: "jack" | "stream"): string | null {
  if (!ga) return null;
  const relevant = ga.segments.filter((s) => s.category === category);
  if (relevant.length === 0) return null;

  // Collect weighted values for distribution
  let totalWeight = 0;
  let weightedSum = 0;
  for (const seg of relevant) {
    const weight = seg.cells.length;
    const val = seg.gridTotalNotes;
    weightedSum += val * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;

  // Jack: use P90 for grade, show P90/P50 in parens.
  // Weighted percentile over (value, weight) pairs — avoids materializing a
  // per-cell array + sort for long maps.
  if (category === "jack") {
    const pairs = relevant
      .map((seg) => ({ v: seg.gridTotalNotes, w: seg.cells.length }))
      .sort((a, b) => a.v - b.v);
    const totalW = pairs.reduce((s, p) => s + p.w, 0);
    if (totalW === 0) return null;
    const wp = (p: number): number => {
      const target = p * totalW;
      let acc = 0;
      for (const { v, w } of pairs) {
        acc += w;
        if (acc >= target) return v;
      }
      return pairs[pairs.length - 1]!.v;
    };
    const p90Val = Math.round(wp(0.9));
    const p50Val = Math.round(wp(0.5));

    let name: string;
    if (p90Val <= 4) name = "Mini";
    else if (p90Val <= 7) name = "Low";
    else if (p90Val <= 11) name = "Mid";
    else name = "Dense";
    return `${name} (${p90Val}/${p50Val})`;
  }

  // Stream: use mean density (total notes / total rows), exclude sparse cells
  // (gridTotalNotes < 4 means avg < 1 note/row — essentially break/transition, not true stream)
  const streamSegs = relevant.filter(s => s.gridTotalNotes >= 4);
  if (streamSegs.length === 0) return null;

  let streamWeight = 0, streamSum = 0;
  for (const seg of streamSegs) {
    streamSum += seg.gridTotalNotes * seg.cells.length;
    streamWeight += seg.cells.length;
  }
  if (streamWeight === 0) return null;

  const meanDensity = streamSum / (streamWeight * 4);
  let name: string;
  if (meanDensity <= 1.125) name = "Single";
  else if (meanDensity <= 1.25) name = "Light";
  else if (meanDensity <= 1.5) name = "Mid";
  else if (meanDensity < 2.0) name = "Dense";
  else if (meanDensity === 2.0) name = "Full";
  else name = "Heavy";
  return `${name} (${meanDensity.toFixed(2)})`;
}

/** Compute jack purity: percentage of jack cells with density ≥ 15% */
function aggregateJackPurity(ga: GridAnalysisResult | null): string | null {
  if (!ga) return null;
  const relevant = ga.segments.filter((s) => s.category === "jack");
  if (relevant.length === 0) return null;

  let totalCells = 0, validCells = 0;
  for (const seg of relevant) {
    totalCells += seg.cells.length;
    if ((seg.jackDensity ?? 0) >= 0.15) validCells += seg.cells.length;
  }
  if (totalCells === 0) return null;
  return `${(validCells / totalCells * 100).toFixed(0)}%`;
}

/**
 * Both-hands jack classification on the 0-4 scale (jackBothHandsRatio),
 * strictly: <2 → "Speed" (single-hand/minijack dominant), 2-2.8 → "Stream"
 * (mixed), >2.8 → "Chord" (both-hand chordjack). Appended to the purity
 * percentage as `Type(value)` with the 2-decimal value, e.g. "95% Chord(2.80)".
 */
function jackHandsLabel(ga: GridAnalysisResult | null): string {
  if (!ga) return "";
  if (!ga.segments.some((s) => s.category === "jack")) return "";
  const v = jackBothHandsRatio(ga);
  const type = v < 2 ? "Speed" : v <= 2.8 ? "Stream" : "Chord";
  return `${type}(${v.toFixed(2)})`;
}
function mrow(label: string, value: string): string {
  return `<div class="mrow"><span>${label}</span><span>${value}</span></div>`;
}
function col(head: string, ...items: string[]): string {
  return `<div class="grid-col"><div class="metric-head">${head}</div>${items.join("")}</div>`;
}

/** Format an AnchorTier for display: `P100 / P90=v×n / P50=v×n` */
function anchorCellStr(t: AnchorTier): string {
  const parts: string[] = [];
  parts.push(t.p100 > 0 ? t.p100.toFixed(2) : "—");
  parts.push(t.p90 > 0 && t.p90Count > 0 ? `${t.p90.toFixed(2)}×${t.p90Count}` : "—");
  parts.push(t.p50 > 0 && t.p50Count > 0 ? `${t.p50.toFixed(2)}×${t.p50Count}` : "—");
  return parts.join(" / ");
}

const CAT_COLORS: Record<SegmentCategory, string> = {
  stream: "#1a5276",
  jack: "#922b21",
  ln: "#6c3483",
  tech: "#27ae60",
  break: "#2c2c2c",
};

/** Sub-type color map for structure grid / segment table badges */
const SUBTYPE_COLORS: Record<string, string> = {
  // Stream sub-types
  single:   "#2980b9",  // 乱 — light blue
  bulk:     "#2980b9",  // 乱 — light blue
  js:       "#1a5276",  // JumpStream — blue
  hs:       "#1a5276",  // HandStream — blue
  brokenjs: "#1f618d",  // BrokenJS — between
  // Jack sub-types
  "cj-low":  "#d35400", // Low CJ — orange (易误判stream)
  "cj-high": "#922b21", // High CJ — red (明显jack)
  minijack:  "#27ae60", // MiniJack — green (jacky tech)
};

/** Get the display color for a measure (sub-type preferred, falls back to category) */
function measureColor(category: SegmentCategory, subType?: string): string {
  if (subType && SUBTYPE_COLORS[subType]) return SUBTYPE_COLORS[subType]!;
  return CAT_COLORS[category];
}

export function showLoading(): void {
  setText("status", "Analyzing...");
  setText("star-rating", "--"); setText("star-value", "");
  setText("bpm", "-- BPM"); setText("ln-ratio", "LN --");
  setHtml("patterns", ""); setHtml("custom-metrics", "");
}

/** Show a dismissable countdown / warning in the overlay. */
export function showCountdown(msg: string): void {
  setText("status", "⚠ Heavy map — processing will begin shortly");
  const se = el("star-rating");
  if (se) { se.textContent = "\u26A0"; se.style.color = "#ffb74d"; }
  setText("star-value", msg);
}

export function showError(message: string): void {
  setText("status", message);
  setText("star-rating", "\u26A0"); setText("star-value", "");
}

export function showResult(result: DifficultyResult): void {
  try {
  const { finalStar, meta, custom, sunny, patterns } = result;
  const d = custom.density; const j = custom.jack; const s = custom.stream;
  const t = custom.tech; const st = custom.stamina; const ln = custom.ln;
  const ga = result.gridAnalysis;
  // Keep interlude clusters for fallback display in stream type detection
  const topClusters = patterns.importantClusters ?? patterns.clusters;

  // ---- Main display: key type + BPM (from grid analysis) ----
  // When VIBRO, star-rating shows "Vibro"; otherwise normal keyType + BPM
  if (ga && ga.mainKeyType.keyType !== "Unknown") {
    const mt = ga.mainKeyType;
    const color = starColor(finalStar);
    // Check if vibro verdict is VIBRO (vibroLabel starts with type like "Hand Vibro(99%)")
    if (ga.vibroLabel?.includes("Vibro(")) {
      setText("star-rating", "Vibro");
      const se = el("star-rating"); if (se) se.style.color = "#ff4444";
    } else {
      const poolType = meta.lnRatio >= 0.15 ? dominantLNPool(ln) : null;
      const displayType = poolType ?? mt.keyType;
      setText("star-rating", `${mt.bpm} ${displayType}`);
      const se = el("star-rating"); if (se) se.style.color = color;
    }
  } else {
    // Fallback to Interlude clusters if grid analysis unavailable
    if (topClusters.length > 0) {
      const top = topClusters[0]!;
      setText("star-rating", `${top.bpm || 0} ${clusterName(top)}`);
      const se = el("star-rating"); if (se) se.style.color = starColor(finalStar);
    } else {
      setText("star-rating", "\u2605 --");
    }
  }

  // Sunny star + in-game comparison
  const sunnyStar = sunny.star > 0.01 ? sunny.star : densityStar(d);
  const gs = meta.gameStar;
  let sunnyText = `Sunny: ${sunnyStar.toFixed(2)}`;
  if (gs != null && gs > 0 && sunnyStar > 0.01) {
    const diffPct = ((sunnyStar - gs) / gs) * 100;
    sunnyText += ` (${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%)`;
  }
  setText("star-value", sunnyText);

  // Status/title
  const titleText = `${meta.artist} \u2014 ${meta.title} [${meta.version}]`;
  setText("status", titleText);
  el("status")?.setAttribute("title", titleText);

  // BPM display with range from grid analysis
  if (ga && ga.bpmRange.min !== ga.bpmRange.max) {
    setText("bpm", `${Math.round(meta.bpm)} (${ga.bpmRange.min.toFixed(0)}-${ga.bpmRange.max.toFixed(0)})`);
  } else {
    setText("bpm", `${Math.round(meta.bpm)}`);
  }
  setText("keys", `${meta.columnCount}K`);
  const lnRatioPct = meta.lnRatio * 100;
  let lnRatioText = `${lnRatioPct.toFixed(0)}%`;
  if (lnRatioPct >= 1) {
    const sa = result.sectionAnalysis;
    let jackyCnt = 0, speedyCnt = 0;
    if (sa) {
      for (const m of sa.measures) {
        if (!m.lnMetrics) continue;
        if (m.lnMetrics.jackyWC >= 20) jackyCnt++;
        if (m.lnMetrics.speedyWC >= 50) speedyCnt++;
      }
    }
    if (jackyCnt > 0 || speedyCnt > 0) {
      lnRatioText += jackyCnt >= speedyCnt ? " \u00b7 Jacky" : " \u00b7 Speedy";
    }
  }
  setText("ln-ratio", lnRatioText);

  // Key type bars (from grid analysis, replacing Interlude pattern bars)
  if (ga && ga.bpmKeyTypes.length > 0) {
    const maxPct = Math.max(...ga.bpmKeyTypes.map((k) => k.percentage), 1);
    const items = ga.bpmKeyTypes.slice(0, 8).map((k) => {
      const barWidth = Math.max(2, (k.percentage / maxPct) * 100);
      return `<div class="pattern-row">
        <span class="pattern-name">${abbrevKeyType(k.keyType)}</span>
        <div class="pattern-bar"><div class="pattern-fill" style="width:${barWidth.toFixed(0)}%"></div></div>
        <span class="pattern-bpm">${k.bpm}</span>
      </div>`;
    });
    setHtml("patterns", items.join(""));
  } else {
    // Fallback to Interlude clusters
    if (topClusters.length > 0) {
      const maxAmount = Math.max(...topClusters.map((c) => c.amount), 1);
      const items = topClusters.slice(0, 4).map((c) => {
        const pct = ((c.amount / maxAmount) * 100).toFixed(0);
        const barWidth = Math.max(2, Number(pct));
        return `<div class="pattern-row">
          <span class="pattern-name">${clusterName(c)}</span>
          <div class="pattern-bar"><div class="pattern-fill" style="width:${barWidth}%"></div></div>
          <span class="pattern-bpm">${c.bpm || 0}</span>
        </div>`;
      });
      setHtml("patterns", items.join(""));
    } else {
      setHtml("patterns", '<div class="pattern-row"><span class="pattern-name">No patterns</span></div>');
    }
  }

  // ---- Custom metrics grid ----
  const r: string[] = [];

  // Row 1: BPM+Density + LN
  r.push(`<div class="grid-row">`);
  const bpmItems = [
    mrow("BPM", `${Math.round(meta.bpm)}`),
    mrow("Both", `avg ${d.bothHands.meanDensity.toFixed(2)} / max ${d.bothHands.maxDensity.toFixed(1)}`),
    mrow("L/R", `${d.perHand.left.meanDensity.toFixed(1)} / ${d.perHand.right.meanDensity.toFixed(1)}`),
  ];
  if (d.perColumn.length === 4) bpmItems.push(mrow("Cols", d.perColumn.map((c) => `${c.meanDensity.toFixed(1)}`).join(" | ")));
  r.push(col("BPM / DENSITY", ...bpmItems));
  if (ln.ratio > 0.01 || ln.overlapCount > 0 || ln.tapLNCount > 0) {
    const lnItems = [mrow("Ratio", `${(ln.ratio * 100).toFixed(0)}% (${(ln.strictLNRatio * 100).toFixed(0)}%)`)];
    if (ln.overlapCount > 0) {
      const overlapPct = ln.totalLN > 0 ? (ln.overlapCount / ln.totalLN * 100).toFixed(0) : "0";
      lnItems.push(mrow("Overlap", `${ln.overlapCount} (${overlapPct}%)`));
    }
    if (ln.tapLNCount > 0) lnItems.push(mrow("Tap LN", `${ln.tapLNCount}`));
    if (ln.coordinationPoolScore > 0 || ln.densityPoolScore > 0 || ln.wildcardPoolScore > 0 || ln.technicalPoolScore > 0) {
      const poolStr = `CO ${ln.coordinationPoolScore.toFixed(1)} \u00b7 DE ${ln.densityPoolScore.toFixed(1)} \u00b7 WC ${ln.wildcardPoolScore.toFixed(1)} \u00b7 TE ${ln.technicalPoolScore.toFixed(1)}`;
      lnItems.push(mrow("P-Score", poolStr));
    }
    r.push(col("LONG NOTE", ...lnItems));
  }
  r.push(`</div>`);

  // Row 2: Jack + Stream
  r.push(`<div class="grid-row">`);
  const jackDir = j.handBias ? ` ${j.handBias}` : "";
  const jackImbal = j.isBias ? `bias${jackDir}` : `${j.imbalance4r.toFixed(2)}/${j.imbalance16r.toFixed(2)}${jackDir}`;
  const jackPurityStr = aggregateJackPurity(ga) ?? "—";
  const jackHandsStr = jackHandsLabel(ga);
  const jackItems = [
    mrow("Grade", aggregateGridGrade(ga, "jack") ?? j.densityGrade ?? "None"),
    mrow("Purity", jackHandsStr ? `${jackPurityStr} ${jackHandsStr}` : jackPurityStr),
    mrow("Anchor", anchorCellStr(custom.anchor.sf)),
    mrow("Finger", j.singleFingerPressure.toFixed(2)),
    mrow("Hand", j.singleHandPressure.toFixed(2)),
    mrow("Imbal 4c/16c", jackImbal),
    mrow("Vibro", ga?.vibroLabel ?? "No Vibro"),
  ];
  r.push(col("JACK", ...jackItems));
  const streamDir = s.handBias ? ` ${s.handBias}` : "";
  const streamImbal = `${s.imbalance4r.toFixed(2)}/${s.imbalance16r.toFixed(2)}${streamDir}`;
  // Determine stream type from grid analysis segments (stream run analysis)
  let streamDisplay = "Stream";
  if (ga) {
    let hasSS = false, hasJS = false, hasHS = false;
    for (const seg of ga.segments) {
      if (seg.category !== "stream") continue;
      const kt = seg.keyType;
      if (kt.includes("Handstream") || kt === "Full Handstream" || kt === "High Handstream" || kt === "Mid Handstream" || kt === "Low Handstream") hasHS = true;
      if (kt.includes("Jumpstream") || kt === "Full Jumpstream" || kt === "High Jumpstream" || kt === "Mid Jumpstream" || kt === "Low Jumpstream") hasJS = true;
      if (kt === "Single Stream" || kt === "High Stream") hasSS = true;
    }
    if (hasJS && hasHS) streamDisplay = "JumpStream / HandStream";
    else if (hasHS) streamDisplay = "HandStream";
    else if (hasJS) streamDisplay = "JumpStream";
    else if (hasSS) streamDisplay = "Stream";
  }
  const streamItems = [
    mrow("Type", streamDisplay),
    mrow("Grade", aggregateGridGrade(ga, "stream") ?? s.densityGrade ?? "Unknown"),
    mrow("Imbal 4c/16c", streamImbal),
    mrow("Brk2r", `${s.brokenMax.toFixed(1)}/${s.brokenMed.toFixed(1)}`),
    mrow("Sta L/R", anchorCellStr(custom.anchor.sh)),
    mrow("Sta Alt", anchorCellStr(custom.anchor.dh)),
  ];
  r.push(col("STREAM", ...streamItems));
  r.push(`</div>`);

  // Row 3: Tech + Stamina
  r.push(`<div class="grid-row">`);
  // Interval = same-finger spacing (true physical limit, cross-hand graces don't affect it)
  // KPS = P90 of all notes (overall density across all fingers)
  const intv = t.burst.singleFingerInterval;
  const kps = t.burst.bothHandsKPS;
  const techItems: string[] = [];
  if (intv > 0) techItems.push(mrow("Interval", `${intv}ms`));
  if (kps > 0) techItems.push(mrow("KPS (P90)", `${Math.round(kps)}`));
  if (t.graceCount > 0) techItems.push(mrow("Graces", `${t.graceCount}`));
  if (t.rollTrill.rolls) techItems.push(mrow("Rolls", t.rollTrill.rolls));
  if (t.rollTrill.trills) techItems.push(mrow("Trills", t.rollTrill.trills));
  r.push(col("TECH", ...techItems));
  const stamItems = [
    mrow("Max", `${st.maxDensity.toFixed(1)}\u00d7${(st.maxDuration / 1000).toFixed(1)}s`),
    mrow("Med", `${st.medDensity.toFixed(1)}\u00d7${(st.medDuration / 1000).toFixed(1)}s`),
    mrow("Med tot", `${(st.medTotalTime / 1000).toFixed(1)}s`),
    mrow("Ratio", `${(st.stretchRatio * 100).toFixed(0)}%`),
    mrow("Switch", `${ga?.gridSwitch ?? st.switchFrequency}${ga?.gridSwitchLabel ? ` (${ga.gridSwitchLabel})` : ""}`),
  ];
  r.push(col("STAMINA", ...stamItems));
  r.push(`</div>`);

  setHtml("custom-metrics", r.join(""));

  // ---- Section Analysis ----
  renderSectionAnalysisPatched(result.sectionAnalysis, result.gridAnalysis);
  } catch (e) {
    console.error("[showResult]", e);
    showError(`Display error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function showWaiting(): void {
  setText("status", "Connected \u2014 waiting for beatmap...");
  setText("star-rating", "--"); setText("star-value", "");
  setText("bpm", "-- BPM"); setText("ln-ratio", "LN --");
  setHtml("patterns", ""); setHtml("custom-metrics", "");
}

// ===========================================================================
// Settings — tosu dashboard settings via WebSocket commands
// ===========================================================================

const CATEGORY_NAMES: Record<string, string> = {
  stream: "Stream", jack: "Jack", ln: "LN", tech: "Tech", break: "Break",
};
let showPatterns = true;
let showCustomMetrics = true;

/** Handle settings update from tosu dashboard (object format: { uniqueID: value }) */
export function onSettingsUpdate(settings: Record<string, unknown>): void {
  debugLog("onSettingsUpdate received:", settings);
  if (typeof settings.showPatterns === "boolean") {
    showPatterns = settings.showPatterns;
    debugLog("showPatterns →", showPatterns);
  }
  if (typeof settings.showCustomMetrics === "boolean") {
    showCustomMetrics = settings.showCustomMetrics;
    debugLog("showCustomMetrics →", showCustomMetrics);
  }
  applySectionVisibility();
  resizeCard();
}

function applySectionVisibility(): void {
  debugLog("applySectionVisibility: patterns=%s customMetrics=%s", showPatterns, showCustomMetrics);
  if (showPatterns) {
    show("patterns");
  } else {
    hide("patterns");
  }
  if (showCustomMetrics) {
    show("custom-metrics");
  } else {
    hide("custom-metrics");
  }
}

// ===========================================================================
// Game state — Playing mode (in-game bar)
// ===========================================================================

let lastAnalysis: SectionAnalysis | null = null;
let lastTotalDuration: number = 0;

/** Update game state — called from index.ts when tosu state changes */
export function updateGameState(stateName: string): void {
  // tosu v2 sends lowercase "play", but check both for compatibility
  const lower = stateName.toLowerCase();
  const isPlaying = lower === "playing" || lower === "play";
  if (isPlaying) {
    document.body.classList.add("playing");
  } else {
    document.body.classList.remove("playing");
  }
}

// Cached playhead geometry: getComputedStyle/getBoundingClientRect force a
// reflow, and tosu pushes ~60Hz state messages — recomputing per message
// turns every WS tick into a layout pass (and the backlog after a blocking
// analysis into a reflow storm). Cache the (invariant) paddings and the bar
// width, invalidating only on window resize.
let playheadGeom: { pl: number; pr: number; width: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => { playheadGeom = null; });
}

/** Update in-game bar with current playback position (0-1 progress) */
export function updateInGameBar(progress: number): void {
  // ---- Playhead cursor on section bar ----
  const playhead = document.getElementById("playhead");
  if (playhead) {
    // playhead is absolutely positioned in #section-bar whose padding box
    // (containing block) includes the 14px side padding, but the measure
    // blocks and time ticks live inside the content area (no padding).
    // Compensate so the playhead tracks the content area exactly.
    const bar = playhead.parentElement;
    if (bar) {
      if (!playheadGeom) {
        const s = getComputedStyle(bar);
        playheadGeom = {
          pl: parseFloat(s.paddingLeft),
          pr: parseFloat(s.paddingRight),
          width: bar.getBoundingClientRect().width,
        };
      }
      const { pl, pr, width: bw } = playheadGeom;
      const cw = bw - pl - pr;
      playhead.style.left = `${((pl + progress * cw) / bw) * 100}%`;
    } else {
      playhead.style.left = `${progress * 100}%`;
    }
  }

  // ---- Update progress bar width ----
  const igProgress = el("ig-progress");
  if (igProgress) igProgress.style.width = `${progress * 100}%`;

  // ---- Content from section analysis (if available) ----
  if (!lastAnalysis) return;

  const measures = lastAnalysis.measures;
  if (measures.length === 0) return;

  const idx = Math.min(Math.floor(progress * measures.length), measures.length - 1);
  const m = measures[idx]!;
  const catName = CATEGORY_NAMES[m.category];

  // Sub-type display name
  let subDisplay = "";
  if (m.category === "stream") {
    if (m.subType === "single") subDisplay = "Single";
    else if (m.subType === "js") subDisplay = "Jump Stream";
    else if (m.subType === "hs") subDisplay = "Hand Stream";
    else if (m.subType === "brokenjs") subDisplay = "Broken JS";
    else if (m.subType === "bulk") subDisplay = `Stream ${m.n ?? ""}`;
    else subDisplay = "Stream";
  } else if (m.category === "jack") {
    if (m.subType === "cj-low") subDisplay = "Low CJ";
    else if (m.subType === "cj-high") subDisplay = "High CJ";
    else if (m.subType === "minijack") subDisplay = "Mini Jack";
    else subDisplay = "Jack";
  } else if (m.category === "ln") {
    subDisplay = "Long Note";
  } else if (m.category === "tech") {
    subDisplay = m.subType === "speedy" ? "Speedy Tech" : "Jacky Tech";
  } else if (m.category === "break") {
    subDisplay = "Break";
  }

  const color = measureColor(m.category, m.subType);
  const sec = (progress * lastTotalDuration) / 1000;
  const timeStr = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  const density = m.structure
    ? m.structure.reduce((a, b) => a + b, 0) / 4
    : 1;

  // Update in-game bar elements
  const igLabel = el("ig-label");
  const igSubtype = el("ig-subtype");
  const igMeasures = el("ig-measures");
  const igTime = el("ig-time");
  const igDensity = el("ig-density");

  if (igLabel) {
    igLabel.textContent = `${catName} ${m.bpm}`;
    igLabel.style.color = color;
  }
  if (igSubtype) igSubtype.textContent = subDisplay;
  if (igMeasures) igMeasures.textContent = `M${idx + 1}/${measures.length}`;
  if (igTime) igTime.textContent = timeStr;
  if (igDensity) igDensity.textContent = `${density.toFixed(1)} n/s`;
}

// ===========================================================================
// Patched renderSectionAnalysis — stores data for settings/in-game use
// Prefers grid analysis when available, falls back to section analysis.
// ===========================================================================

function renderSectionAnalysisPatched(
  sa: SectionAnalysis | null,
  ga: GridAnalysisResult | null,
): void {
  lastAnalysis = sa;
  // Prefer grid duration for consistency with section bar time axis
  lastTotalDuration = (ga && ga.cells.length > 0
    ? ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime
    : sa?.totalDuration) ?? 0;

  debugLog("renderSectionAnalysisPatched: sa=%s, grid=%s", sa ? "yes" : "null", ga ? "yes" : "null");

  // Use grid analysis if available
  if (ga && ga.segments.length > 0) {
    renderGridSectionBar(ga.cells, ga.bpmRange);
    applySectionVisibility();
    resizeCard();
    return;
  }

  // Fallback: no grid or section analysis
  hide("section-bar");
  resizeCard();
}

// ---------------------------------------------------------------------------
// Grid-based Section Bar (timeline from grid cells)
// ---------------------------------------------------------------------------

const GRID_COLORS: Record<string, string> = {
  "stream":      "#2980b9",   // mid+ stream (blue)
  "stream-low":  "#5dade2",   // low stream (light blue)
  "jack":        "#c0392b",   // mid+ jack (red)
  "jack-low":    "#e74c3c",   // low jack (light red)
  "ln":          "#27ae60",   // green
  "tech":        "#8e44ad",   // purple (mixed stream+jack)
  "break":       "#2c2c2c",
};

function renderGridSectionBar(cells: CellResult[], _bpmRange: { min: number; max: number }): void {
  show("section-bar");
  const bar = el("measure-bar");
  const axis = el("time-axis");
  if (!bar || !axis) return;

  const total = cells.length;
  if (total === 0) return;

  const totalDuration = cells[total - 1]!.endTime - cells[0]!.startTime;
  const durationSec = totalDuration / 1000;

  // Time axis ticks (8 ticks)
  let axisHtml = "";
  for (let i = 0; i <= 8; i++) {
    const pct = (i / 8) * 100;
    const sec = (i / 8) * durationSec;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    axisHtml += `<div class="time-tick" style="left:${pct}%">${m}:${String(s).padStart(2, "0")}</div>`;
  }
  axis.innerHTML = axisHtml;

  // Merge cells to keep DOM count reasonable for long maps.
  // Each merged block gets the mode category of its group; ties resolve to neighbor consistency.
  const TARGET_BLOCKS = 250;
  const mergeFactor = total > TARGET_BLOCKS ? Math.ceil(total / TARGET_BLOCKS) : 1;

  // First pass: determine winner category for each merged group
  const winners: string[] = [];
  for (let i = 0; i < total; i += mergeFactor) {
    const end = Math.min(i + mergeFactor, total);
    const freq = new Map<string, number>();
    for (let j = i; j < end; j++) {
      const cat = cells[j]!.category;
      freq.set(cat, (freq.get(cat) ?? 0) + 1);
    }

    // Find max frequency; collect tied categories
    let maxFreq = 0;
    for (const count of freq.values()) { if (count > maxFreq) maxFreq = count; }
    const tied: string[] = [];
    for (const [cat, count] of freq) { if (count === maxFreq) tied.push(cat); }

    let winner: string;
    if (tied.length === 1) {
      winner = tied[0]!;
    } else {
      // Tie: prefer previous winner, then next group's first cell, then first tied
      const prevWin = winners.length > 0 ? winners[winners.length - 1] : null;
      if (prevWin && tied.includes(prevWin)) {
        winner = prevWin;
      } else {
        const nextIdx = Math.min(end, total - 1);
        const nextCat = cells[nextIdx]?.category;
        if (nextCat && tied.includes(nextCat)) {
          winner = nextCat;
        } else {
          winner = tied[0]!;
        }
      }
    }
    winners.push(winner);
  }

  // Second pass: render merged blocks
  let blocksHtml = "";
  for (const winner of winners) {
    const color = GRID_COLORS[winner] ?? "#444";
    blocksHtml += `<div class="measure-block" style="background:${color}"></div>`;
  }
  bar.innerHTML = blocksHtml;
}
