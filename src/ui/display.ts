// ============================================================
// Display module — updates the overlay DOM
// Two-column grid layout for metrics
// ============================================================

import type { DifficultyResult } from "../types/result.js";
import type { DensityMetrics } from "../types/custom.js";
import type { PatternCluster } from "../types/patterns.js";

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
function mrow(label: string, value: string): string {
  return `<div class="mrow"><span>${label}</span><span>${value}</span></div>`;
}
function col(head: string, ...items: string[]): string {
  return `<div class="grid-col"><div class="metric-head">${head}</div>${items.join("")}</div>`;
}

export function showLoading(): void {
  setText("status", "Analyzing...");
  setText("star-rating", "--"); setText("star-value", "");
  setText("bpm", "-- BPM"); setText("ln-ratio", "LN --");
  setHtml("patterns", ""); setHtml("custom-metrics", "");
}

export function showError(message: string): void {
  setText("status", message);
  setText("star-rating", "\u26A0"); setText("star-value", "");
}

export function showResult(result: DifficultyResult): void {
  const { finalStar, meta, custom, sunny, patterns } = result;
  const d = custom.density; const j = custom.jack; const s = custom.stream;
  const t = custom.tech; const st = custom.stamina; const ln = custom.ln;

  // ---- Main display: pattern speed + type ----
  const topClusters = patterns.importantClusters ?? patterns.clusters;
  if (topClusters.length > 0) {
    const top = topClusters[0]!;
    const effBpm = top.bpm || 0;
    const color = starColor(finalStar);
    if (j.isVibro) {
      setText("star-rating", "VIBRO");
      const se = el("star-rating"); if (se) se.style.color = "#ff4444";
    } else {
      setText("star-rating", `${effBpm} ${clusterName(top)}`);
      const se = el("star-rating"); if (se) se.style.color = color;
    }
    const se = el("star-rating"); if (se) se.style.color = color;
  } else {
    setText("star-rating", "\u2605 --");
  }

  // Sunny star
  const sunnyStar = sunny.star > 0.01 ? sunny.star : densityStar(d);
  setText("star-value", `Sunny: ${sunnyStar.toFixed(2)}`);

  setText("status", `${meta.artist} \u2014 ${meta.title} [${meta.version}]`);
  el("status")?.setAttribute("title", `${meta.artist} \u2014 ${meta.title} [${meta.version}]`);
  setText("bpm", `${Math.round(meta.bpm)} BPM`);
  setText("ln-ratio", `LN ${(meta.lnRatio * 100).toFixed(0)}%`);

  // Pattern breakdown bars
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

  // ---- Custom metrics grid ----
  const r: string[] = [];

  // Row 1: BPM+Density + LN
  r.push(`<div class="grid-row">`);
  const bpmItems = [
    mrow("BPM", `${Math.round(meta.bpm)}`),
    mrow("Both", `max ${d.bothHands.maxDensity.toFixed(1)} / med ${d.bothHands.medianDensity.toFixed(1)}`),
    mrow("L/R", `${d.perHand.left.maxDensity.toFixed(1)} / ${d.perHand.right.maxDensity.toFixed(1)}`),
  ];
  if (d.perColumn.length === 4) bpmItems.push(mrow("Cols", d.perColumn.map((c) => `${c.maxDensity.toFixed(1)}`).join(" | ")));
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
    mrow("Grade", j.densityGrade ?? "None"),
    ...(j.anchorCount > 0 ? [mrow("Anchors", `${j.anchorCount}`)] : []),
    mrow("Finger", j.singleFingerPressure.toFixed(2)),
    mrow("Hand", j.singleHandPressure.toFixed(2)),
    mrow("Imbal 4r/16r/T", jackImbal),
    ...(j.isVibro ? [mrow("Vibro", "ETT")] : []),
  ];
  r.push(col("JACK", ...jackItems));
  const streamImbal = `${s.imbalance4r.toFixed(2)}/${s.imbalance16r.toFixed(2)}/${s.imbalanceTotal.toFixed(2)}`;
  // Combine JS/HS display if both appear in clusters
  let streamDisplay = s.streamType ?? "Stream";
  const allSpecifics = new Set<string>();
  for (const c of topClusters) {
    for (const [name] of c.specificTypes) allSpecifics.add(name);
  }
  if (allSpecifics.has("JumpStream") && allSpecifics.has("HandStream")) {
    streamDisplay = "JumpStream / HandStream";
  }
  const streamItems = [
    mrow("Type", streamDisplay),
    mrow("Grade", s.densityGrade ?? "Unknown"),
    mrow("Imbal 4r/16r/T", streamImbal),
    mrow("Brk2r", `${s.brokenMax.toFixed(1)}/${s.brokenMed.toFixed(1)}`),
  ];
  r.push(col("STREAM", ...streamItems));
  r.push(`</div>`);

  // Row 3: Tech + Stamina
  r.push(`<div class="grid-row">`);
  const techItems = [
    mrow("1f KPS", t.burst.singleFingerMaxKPS.toFixed(1)),
    mrow("1h KPS", t.burst.oneHandMaxKPS.toFixed(1)),
    mrow("2h KPS", t.burst.bothHandsMaxKPS.toFixed(1)),
    ...(t.graceCount > 0 ? [mrow("Graces", `${t.graceCount}`)] : []),
  ];
  if (t.rollTrill.rolls) techItems.push(mrow("Rolls", t.rollTrill.rolls));
  if (t.rollTrill.trills) techItems.push(mrow("Trills", t.rollTrill.trills));
  r.push(col("TECH", ...techItems));
  const stamItems = [
    mrow("Max", `${st.maxDensity.toFixed(1)}\u00d7${(st.maxDuration / 1000).toFixed(1)}s`),
    mrow("Med", `${st.medDensity.toFixed(1)}\u00d7${(st.medDuration / 1000).toFixed(1)}s`),
    mrow("Med tot", `${(st.medTotalTime / 1000).toFixed(1)}s`),
    mrow("Ratio", `${(st.stretchRatio * 100).toFixed(0)}%`),
    mrow("Switch", `${st.switchFrequency}`),
  ];
  r.push(col("STAMINA", ...stamItems));
  r.push(`</div>`);

  setHtml("custom-metrics", r.join(""));
}

export function showWaiting(): void {
  setText("status", "Connected \u2014 waiting for beatmap...");
  setText("star-rating", "--"); setText("star-value", "");
  setText("bpm", "-- BPM"); setText("ln-ratio", "LN --");
  setHtml("patterns", ""); setHtml("custom-metrics", "");
}
