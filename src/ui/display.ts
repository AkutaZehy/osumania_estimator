// ============================================================
// Display module — updates the overlay DOM
// Two-column grid layout for metrics
// ============================================================

import type { DifficultyResult } from "../types/result.js";
import type { DensityMetrics } from "../types/custom.js";
import type { PatternCluster } from "../types/patterns.js";
import type { SectionAnalysis, SegmentCategory } from "../custom/sectionAnalysis.js";
import type { GridAnalysisResult, SegmentResult, CellResult } from "../custom/gridAnalysis.js";
import { gradeJack, gradeStream } from "../custom/gridAnalysis.js";

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

/** Aggregate grid analysis segment grades into a single grade string */
function aggregateGridGrade(ga: GridAnalysisResult | null, category: "jack" | "stream"): string | null {
  if (!ga) return null;
  const relevant = ga.segments.filter((s) => s.category === category);
  if (relevant.length === 0) return null;

  // Collect weighted values for distribution
  const values: number[] = [];
  let totalWeight = 0;
  let weightedSum = 0;
  for (const seg of relevant) {
    const weight = seg.cells.length;
    const val = seg.gridTotalNotes;
    for (let i = 0; i < weight; i++) values.push(val);
    weightedSum += val * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;

  // Jack: use P75/median with gradeJack (discrete integer format)
  if (category === "jack") {
    values.sort((a, b) => a - b);
    const topIdx = Math.min(values.length - 1, Math.ceil(values.length * 0.75) - 1);
    const topVal = Math.round(values[topIdx]!);
    const medIdx = Math.floor(values.length * 0.5);
    const median = values.length > 0 ? values[medIdx]! : 0;
    return gradeJack(topVal, median);
  }

  // Stream: use mean density (total notes / total rows) for continuous value
  const meanDensity = weightedSum / (totalWeight * 4);
  let name: string;
  if (meanDensity <= 1.125) name = "Single";
  else if (meanDensity <= 1.25) name = "Light";
  else if (meanDensity <= 1.5) name = "Mid";
  else if (meanDensity < 2.0) name = "Dense";
  else if (meanDensity === 2.0) name = "Full";
  else name = "Heavy";
  return `${name} (${meanDensity.toFixed(2)})`;
}
function mrow(label: string, value: string): string {
  return `<div class="mrow"><span>${label}</span><span>${value}</span></div>`;
}
function col(head: string, ...items: string[]): string {
  return `<div class="grid-col"><div class="metric-head">${head}</div>${items.join("")}</div>`;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
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
  if (ga && ga.mainKeyType.keyType !== "Unknown") {
    const mt = ga.mainKeyType;
    const color = starColor(finalStar);
    if (j.isVibro && meta.lnRatio < 0.3) {
      setText("star-rating", "VIBRO");
      const se = el("star-rating"); if (se) se.style.color = "#ff4444";
    } else {
      setText("star-rating", `${mt.bpm} ${mt.keyType}`);
      const se = el("star-rating"); if (se) se.style.color = color;
    }
  } else {
    // Fallback to Interlude clusters if grid analysis unavailable
    if (topClusters.length > 0) {
      const top = topClusters[0]!;
      const color = starColor(finalStar);
      if (j.isVibro && meta.lnRatio < 0.3) {
        setText("star-rating", "VIBRO");
        const se = el("star-rating"); if (se) se.style.color = "#ff4444";
      } else {
        setText("star-rating", `${top.bpm || 0} ${clusterName(top)}`);
        const se = el("star-rating"); if (se) se.style.color = color;
      }
    } else {
      setText("star-rating", "\u2605 --");
    }
  }

  // Sunny star + in-game comparison
  const sunnyStar = sunny.star > 0.01 ? sunny.star : densityStar(d);
  const gs = meta.gameStar;
  let sunnyText = `Sunny: ${sunnyStar.toFixed(2)}`;
  if (gs != null && gs > 0 && sunnyStar > 0.01) {
    const diff = sunnyStar - gs;
    sunnyText += ` (${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`;
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
  setText("ln-ratio", `${(meta.lnRatio * 100).toFixed(0)}%`);

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
  if (ln.ratio > 0.01 || ln.shieldCount > 0 || ln.columnLockCount > 0 || ln.inverseCount > 0 || ln.asyncReleaseCount > 0 || ln.releaseCount > 0 || ln.tapLNCount > 0 || ln.overlayCount > 0) {
    const lnItems = [mrow("Ratio", `${(ln.ratio * 100).toFixed(0)}% (${(ln.strictLNRatio * 100).toFixed(0)}%)`)];
    if (ln.overlayCount > 0) {
      const overlayPct = ln.totalLN > 0 ? (ln.overlayCount / ln.totalLN * 100).toFixed(0) : "0";
      lnItems.push(mrow("Overlay", `${ln.overlayCount} (${overlayPct}%)`));
    }
    if (ln.tapLNCount > 0) lnItems.push(mrow("Tap LN", `${ln.tapLNCount}`));
    if (ln.shieldCount > 0 || ln.antiShieldCount > 0) lnItems.push(mrow("Shield/R", `${ln.shieldCount}/${ln.antiShieldCount}`));
    if (ln.columnLockCount > 0) lnItems.push(mrow("ColLock", `${ln.columnLockCount}`));
    if (ln.asyncReleaseCount > 0 || ln.releaseCount > 0) lnItems.push(mrow("A/R", `${ln.asyncReleaseCount}/${ln.releaseCount}`));
    if (ln.inverseCount > 0) lnItems.push(mrow("Inverse", `${ln.inverseCount}`));
    r.push(col("LONG NOTE", ...lnItems));
  }
  r.push(`</div>`);

  // Row 2: Jack + Stream
  r.push(`<div class="grid-row">`);
  const jackImbal = j.isBias ? "bias" : `${j.imbalance4r.toFixed(2)}/${j.imbalance16r.toFixed(2)}/${j.imbalanceTotal.toFixed(2)}`;
  const jackItems = [
    mrow("Grade", aggregateGridGrade(ga, "jack") ?? j.densityGrade ?? "None"),
    ...(j.anchorCount > 0 ? [mrow("Anchors", `${j.anchorCount}`)] : []),
    mrow("Finger", j.singleFingerPressure.toFixed(2)),
    mrow("Hand", j.singleHandPressure.toFixed(2)),
    mrow("Imbal 4r/16r/T", jackImbal),
    ...(j.isVibro ? [mrow("Vibro", "ETT")] : []),
  ];
  r.push(col("JACK", ...jackItems));
  const streamImbal = `${s.imbalance4r.toFixed(2)}/${s.imbalance16r.toFixed(2)}/${s.imbalanceTotal.toFixed(2)}`;
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
    mrow("Imbal 4r/16r/T", streamImbal),
    mrow("Brk2r", `${s.brokenMax.toFixed(1)}/${s.brokenMed.toFixed(1)}`),
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
    mrow("Switch", `${ga?.gridSwitch ?? st.switchFrequency}`),
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

// ---------------------------------------------------------------------------
// Section Analysis Rendering
// ---------------------------------------------------------------------------

/** Render the timeline bar with colored measure blocks */
function renderSectionBar(sa: SectionAnalysis): void {
  show("section-bar");
  const bar = el("measure-bar");
  const axis = el("time-axis");
  if (!bar || !axis) return;

  const total = sa.measures.length;
  const durationSec = sa.totalDuration / 1000;

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

  // Measure blocks — use sub-type color when available
  let blocksHtml = "";
  for (const m of sa.measures) {
    const colorClass = m.subType ? `c-${m.category}-${m.subType}` : `c-${m.category}`;
    const color = measureColor(m.category, m.subType);
    const tooltip = `M${m.index + 1}: ${m.category}${m.subType ? "/" + m.subType : ""}`;
    let dots = "";
    for (const a of m.anomalies) {
      dots += `<div class="anomaly-dot dot-${a}"></div>`;
    }
    blocksHtml += `<div class="measure-block ${colorClass}" style="background:${color}" title="${tooltip}">${dots}</div>`;
  }
  bar.innerHTML = blocksHtml;

  // Pattern labels (segments with 2+ measures)
  const wrapper = el("measure-bar-wrapper");
  if (!wrapper) return;
  // Remove old labels
  wrapper.querySelectorAll(".pattern-label").forEach((n) => n.remove());
}

/** Render structure grid cards (skip break segments) */
function renderStructureGrid(sa: SectionAnalysis): void {
  const grid = el("structure-grid");
  if (!grid) return;

  const nonBreakSegs = sa.segments.filter((s) => s.category !== "break");
  if (nonBreakSegs.length === 0) {
    hide("structure-grid");
    return;
  }
  show("structure-grid");

  let html = "";
  for (const seg of nonBreakSegs) {
    const color = measureColor(seg.category, seg.measures[0]?.subType);
    const anomCnt: Record<string, number> = { grace: 0, broken: 0, mixed: 0 };
    for (const mm of seg.measures) {
      for (const a of mm.anomalies) anomCnt[a] = (anomCnt[a] ?? 0) + 1;
    }
    const anomTags = Object.entries(anomCnt)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => {
        const labels: Record<string, string> = { grace: "G", broken: "B", mixed: "M" };
        return `<span class="tag tag-${k}">${labels[k]}${v > 1 ? "\u00d7" + v : ""}</span>`;
      })
      .join(" ");

    const bpms = [...new Set(seg.measures.map((mm) => mm.bpm))];
    const bpmStr = bpms.length === 1 ? String(bpms[0]) : bpms.join("/");

    let bodyHtml = "";
    let detailHtml = "";

    if (seg.category === "stream") {
      const bulks = seg.measures.filter((mm) => mm.subType === "bulk");
      const jss = seg.measures.filter((mm) => mm.subType === "js");
      const hss = seg.measures.filter((mm) => mm.subType === "hs");

      if (seg.subType === "brokenjs") {
        // Broken JS: show structure with 0s
        bodyHtml = `<div class="beats">`;
        for (const mm of seg.measures) {
          bodyHtml += `<div style="display:flex;gap:2px;margin-right:3px">`;
          for (const n of mm.structure ?? []) {
            const cls = n >= 2 ? "chord" : n === 0 ? "break-beat" : "single";
            bodyHtml += `<div class="beat ${cls}" style="--pc:${color}">${n}</div>`;
          }
          bodyHtml += `</div>`;
        }
        bodyHtml += `</div>`;
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">Type</span><span class="value" style="color:#f39c12">Broken JS</span></div>
          <div class="item"><span class="label">Note</span><span class="value">Has gaps (0s)</span></div>
        </div>`;
      } else if (bulks.length > 0) {
        const ns = bulks.map((mm) => mm.n!).filter((n) => n != null);
        bodyHtml = `<div class="beats"><div class="bulk-display">2+${median(ns)}</div></div>`;
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">range</span><span class="value">${Math.min(...ns)}-${Math.max(...ns)}</span></div>
        </div>`;
      } else if (jss.length > 0 || hss.length > 0) {
        // JS/HS: show structure numbers
        bodyHtml = `<div class="beats">`;
        for (const mm of seg.measures) {
          bodyHtml += `<div style="display:flex;gap:2px;margin-right:3px">`;
          for (const n of mm.structure ?? []) {
            const cls = n >= 2 ? "chord" : "single";
            bodyHtml += `<div class="beat ${cls}" style="--pc:${color}">${n}</div>`;
          }
          bodyHtml += `</div>`;
        }
        bodyHtml += `</div>`;
        const typeStr = jss.length > hss.length ? "JS" : "HS";
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">Type</span><span class="value">${typeStr}</span></div>
        </div>`;
      } else {
        bodyHtml = `<div class="beats"><div class="bulk-display" style="color:#555">Single</div></div>`;
      }
    } else if (seg.category === "jack") {
      const allAnchors = seg.measures.flatMap((mm) => mm.anchors);
      const cjs = seg.measures.filter((mm) => mm.subType === "cj-low" || mm.subType === "cj-high");
      const mjs = seg.measures.filter((mm) => mm.subType === "minijack");

      bodyHtml = `<div class="beats">`;
      for (const mm of seg.measures) {
        bodyHtml += `<div style="display:flex;gap:2px;margin-right:3px">`;
        for (const n of mm.structure ?? []) {
          const cls = n >= 2 ? "chord" : "single";
          bodyHtml += `<div class="beat ${cls}" style="--pc:${color}">${n}</div>`;
        }
        bodyHtml += `</div>`;
      }
      bodyHtml += `</div>`;

      detailHtml = `<div class="detail-list">
        <div class="item"><span class="label">CJ/MJ</span><span class="value">${cjs.length}/${mjs.length}</span></div>
        ${allAnchors.length ? `<div class="item"><span class="label">Anchor</span><span class="value">max:${Math.max(...allAnchors)} med:${median(allAnchors)}</span></div>` : ""}
      </div>`;
    } else if (seg.category === "ln") {
      // LN: colored bars per measure
      bodyHtml = `<div class="beats" style="flex-direction:column;gap:4px">`;
      for (const mm of seg.measures) {
        const lnColor = mm.lnSubtype ? LN_TYPE_COLORS[mm.lnSubtype] ?? "#6c3483" : "#6c3483";
        bodyHtml += `<div style="height:8px;border-radius:2px;background:${lnColor};width:100%"></div>`;
      }
      bodyHtml += `</div>`;

      // Triggered LN types
      if (seg.triggeredLNTypes.length > 0) {
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">LN Subtypes</span><span class="value"></span></div>
          ${seg.triggeredLNTypes.map((t) => `
            <div class="item">
              <span class="label" style="color:${LN_TYPE_COLORS[t.key] ?? "#7f8c8d"}">${t.name}</span>
              <span class="value">${t.value}</span>
            </div>
          `).join("")}
        </div>`;
      } else {
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label" style="color:#7f8c8d">Unknown</span><span class="value">-</span></div>
        </div>`;
      }
    } else if (seg.category === "tech") {
      const techSub = seg.techSubType;
      if (techSub === "speedy") {
        bodyHtml = `<div class="beats"><div class="bulk-display" style="color:#3498db;font-size:12px">Speedy Tech</div></div>`;
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">Type</span><span class="value" style="color:#3498db">Speedy</span></div>
          <div class="item"><span class="label">Note</span><span class="value">rolls/trills</span></div>
        </div>`;
      } else {
        const allAnchors = seg.measures.flatMap((mm) => mm.anchors);
        bodyHtml = `<div class="beats">`;
        for (const mm of seg.measures) {
          bodyHtml += `<div style="display:flex;gap:2px;margin-right:3px">`;
          for (const n of mm.structure ?? []) {
            const cls = n >= 2 ? "chord" : "single";
            bodyHtml += `<div class="beat ${cls}" style="--pc:${color}">${n}</div>`;
          }
          bodyHtml += `</div>`;
        }
        bodyHtml += `</div>`;
        detailHtml = `<div class="detail-list">
          <div class="item"><span class="label">Type</span><span class="value" style="color:#e74c3c">Jacky</span></div>
          ${allAnchors.length ? `<div class="item"><span class="label">Anchor</span><span class="value">max:${Math.max(...allAnchors)} med:${median(allAnchors)}</span></div>` : ""}
        </div>`;
      }
    }

    html += `<div class="struct-card">
      <div class="head">
        <div class="dot" style="background:${color}"></div>
        M${seg.startMeasure + 1}-${seg.endMeasure}
        <span class="bpm-badge">${bpmStr} BPM</span>
        ${anomTags}
      </div>
      ${bodyHtml}
      ${detailHtml}
    </div>`;
  }

  grid.innerHTML = html;
}

/** Render segment table (skip break segments) */
function renderSegmentTable(sa: SectionAnalysis): void {
  const body = el("segment-body");
  if (!body) return;

  const nonBreakSegs = sa.segments.filter((s) => s.category !== "break");
  if (nonBreakSegs.length === 0) {
    hide("segment-table");
    return;
  }
  show("segment-table");

  const beatLength = sa.measures.length > 0
    ? (sa.measures[0]!.endTime - sa.measures[0]!.startTime) / 4
    : 500;

  let html = "";
  for (const seg of nonBreakSegs) {
    const color = measureColor(seg.category, seg.measures[0]?.subType);
    const catName = { stream: "Stream", jack: "Jack", ln: "LN", tech: "Tech", break: "Break" }[seg.category];

    const startSec = (seg.startMeasure * 4 * beatLength) / 1000;
    const endSec = (seg.endMeasure * 4 * beatLength) / 1000;
    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    const allAnchors = seg.measures.flatMap((mm) => mm.anchors);
    const anchorStr = allAnchors.length > 0
      ? `max:${Math.max(...allAnchors)} med:${median(allAnchors)}`
      : "-";

    const anomCnt: Record<string, number> = { grace: 0, broken: 0, mixed: 0 };
    for (const mm of seg.measures) {
      for (const a of mm.anomalies) anomCnt[a] = (anomCnt[a] ?? 0) + 1;
    }
    const anomStr = Object.entries(anomCnt)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "-";

    html += `<div class="seg-row">
      <span class="seg-time">${fmtTime(startSec)}-${fmtTime(endSec)}</span>
      <span class="seg-measures">M${seg.startMeasure + 1}-${seg.endMeasure}</span>
      <span class="seg-bpm">${seg.bpm}</span>
      <span class="seg-category" style="background:${color}">${catName}</span>
      <span class="seg-pattern">${seg.patternStr}</span>
      <span class="seg-anchor">${anchorStr}</span>
      <span class="seg-anomaly">${anomStr}</span>
    </div>`;
  }

  body.innerHTML = html;
}

/** LN subtype color mapping */
const LN_TYPE_COLORS: Record<string, string> = {
  reverse: "#9b59b6",
  releasehell: "#e74c3c",
  density: "#3498db",
  ouroboros: "#1abc9c",
  unknown: "#7f8c8d",
};

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
let lastSectionAnalysis: SectionAnalysis | null = null;
let lastResult: DifficultyResult | null = null;

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
let lastGridCells: CellResult[] | null = null;
let lastGridDuration: number = 0;

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

/** Update in-game bar with current playback position (0-1 progress) */
export function updateInGameBar(progress: number): void {
  // ---- Playhead cursor on section bar ----
  const playhead = document.getElementById("playhead");
  if (playhead) playhead.style.left = `${progress * 100}%`;

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
  lastSectionAnalysis = sa;
  lastTotalDuration = sa?.totalDuration
    ?? (ga && ga.cells.length > 0 ? ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime : 0);

  debugLog("renderSectionAnalysisPatched: sa=%s, grid=%s", sa ? "yes" : "null", ga ? "yes" : "null");

  // Use grid analysis if available
  if (ga && ga.segments.length > 0) {
    lastGridCells = ga.cells;
    lastGridDuration = ga.cells.length > 0
      ? ga.cells[ga.cells.length - 1]!.endTime - ga.cells[0]!.startTime
      : 0;
    renderGridSectionBar(ga.cells, ga.bpmRange);
    applySectionVisibility();
    resizeCard();
    return;
  }

  // Fallback: no grid or section analysis
  lastGridCells = null;
  hide("section-bar");
  resizeCard();
}

// ---------------------------------------------------------------------------
// Grid-based Section Bar (timeline from grid cells)
// ---------------------------------------------------------------------------

const GRID_CAT_COLORS: Record<string, string> = {
  stream: "#2980b9",
  jack: "#c0392b",
  ln: "#8e44ad",
  tech: "#27ae60",
  break: "#2c2c2c",
};

function renderGridSectionBar(cells: CellResult[], bpmRange: { min: number; max: number }): void {
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
    const color = GRID_CAT_COLORS[winner] ?? "#444";
    blocksHtml += `<div class="measure-block" style="background:${color}"></div>`;
  }
  bar.innerHTML = blocksHtml;
}

// ---------------------------------------------------------------------------
// Grid-based Structure Grid (4×4 structure cards)
// ---------------------------------------------------------------------------

function renderGridStructure(segments: SegmentResult[]): void {
  const grid = el("structure-grid");
  if (!grid) return;

  const nonBreak = segments.filter((s) => s.category !== "break");
  if (nonBreak.length === 0) {
    hide("structure-grid");
    return;
  }
  show("structure-grid");

  let html = "";
  for (const seg of nonBreak) {
    const color = GRID_CAT_COLORS[seg.category] ?? "#666";
    const catName = seg.category.charAt(0).toUpperCase() + seg.category.slice(1);

    // Build row note display
    let rowDisplay = "";
    for (let i = 0; i < 4; i++) {
      const n = seg.rowNotes[i] ?? 0;
      rowDisplay += `<div class="beat" style="--pc:${color};background:${n > 0 ? color : '#333'};width:20px;height:20px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin:1px">${n || " "}</div>`;
    }

    // LN subtypes
    let lnDetail = "";
    if (seg.category === "ln" && seg.lnSubtypes.length > 0) {
      lnDetail = `<div class="detail-list">${seg.lnSubtypes.map((t) =>
        `<div class="item"><span class="label" style="color:${t.key === "reverse" ? "#9b59b6" : t.key === "releasehell" ? "#e74c3c" : t.key === "density" ? "#3498db" : "#1abc9c"}">${t.name}</span><span class="value">${t.value}</span></div>`
      ).join("")}</div>`;
    }

    const mPerBeat = seg.avgPerRow.toFixed(1);
    html += `<div class="struct-card">
      <div class="head">
        <div class="dot" style="background:${color}"></div>
        ${abbrevKeyType(seg.keyType)}
        <span class="bpm-badge">${seg.effectiveBPM} BPM</span>
      </div>
      <div class="stat-line">
        <span class="stat-val">${seg.grade}</span>
        <span style="margin-left:8px">avg:${mPerBeat} max:${seg.maxBeat}</span>
      </div>
      <div class="beats" style="display:flex;gap:2px;margin:4px 0">${rowDisplay}</div>
      ${lnDetail}
    </div>`;
  }

  grid.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Grid-based Segment Table
// ---------------------------------------------------------------------------

function renderGridSegmentTable(segments: SegmentResult[]): void {
  const body = el("segment-body");
  if (!body) return;

  const nonBreak = segments.filter((s) => s.category !== "break");
  if (nonBreak.length === 0) {
    hide("segment-table");
    return;
  }
  show("segment-table");

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  let html = "";
  for (const seg of nonBreak) {
    const color = GRID_CAT_COLORS[seg.category] ?? "#666";
    const startSec = seg.startTime / 1000;
    const endSec = seg.endTime / 1000;

    html += `<div class="seg-row">
      <span class="seg-time">${fmtTime(startSec)}-${fmtTime(endSec)}</span>
      <span class="seg-measures">B${seg.startBeat + 1}-${seg.endBeat}</span>
      <span class="seg-bpm">${seg.effectiveBPM}</span>
      <span class="seg-category" style="background:${color}">${abbrevKeyType(seg.keyType)}</span>
      <span class="seg-pattern">${seg.grade}</span>
      <span class="seg-anchor">avg:${seg.avgPerRow.toFixed(1)}</span>
      <span class="seg-anomaly">max:${seg.maxBeat}</span>
    </div>`;
  }

  body.innerHTML = html;
}
