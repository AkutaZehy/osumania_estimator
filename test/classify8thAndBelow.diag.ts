import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");

function getShortName(filename: string): string {
  const m = filename.match(/\[(.+?)\]/);
  return m ? m[1] : filename;
}
function getDiffLevel(filename: string): number {
  const m = filename.match(/(\d+)(st|nd|rd|th)/);
  return m ? parseInt(m[1]) : 0;
}
function getStage(filename: string): number {
  const m = filename.match(/Stage (\d)/);
  return m ? parseInt(m[1]) : 0;
}

async function main() {
  const parserMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`);
  const summaryMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`);
  const primMod = await import(`file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/primitives.js`);
  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;
  const { calculatePrimitives } = primMod;

  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { analyzeSections } = await import("../src/custom/sectionAnalysis.js");

  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter(f => f.endsWith(".osu"));
  const filtered = allFiles.filter(f => getDiffLevel(f) <= 8);
  filtered.sort((a, b) => getStage(a) - getStage(b) || getDiffLevel(a) - getDiffLevel(b));

  interface ClusterInfo { pattern: string; specific: string; amount: number; bpm: number; ratio: number }
  const results: Array<{
    file: string; stage: number; diff: number; shortName: string; bpm: number;
    refClusters: ClusterInfo[]; refTotal: number;
    ourSubtypes: Record<string, number>; ourTotal: number;
    avgInv: number; avgOvl: number; avgAr: number; avgOuro: number;
  }> = [];

  for (const file of filtered) {
    const short = getShortName(file).replace(/\s*\(Marathon\)\s*$/, "");
    const diff = getDiffLevel(file);
    const stage = getStage(file);
    const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");

    const chart = parseOsuManiaFromText(osuText);
    const report = fromChart(chart);
    const totalAmount = report.Clusters.reduce((s: number, c: any) => s + c.Amount, 0) || 1;

    const refClusters: ClusterInfo[] = report.Clusters.map((c: any) => {
      const st = c.SpecificTypes?.[0];
      return {
        pattern: c.Pattern,
        specific: st ? st[0] : "(none)",
        amount: Math.round(c.Amount),
        bpm: c.BPM ? Math.round(c.BPM) : 0,
        ratio: Math.round((c.Amount / totalAmount) * 100),
      };
    }).sort((a: ClusterInfo, b: ClusterInfo) => b.amount - a.amount);

    // Our system
    const parser = new OsuFileParser(osuText);
    parser.process();
    const beatmap = parser.getParsedData();
    const bpm = beatmap.timingPoints.find((tp: any) => tp.uninherited)
      ? Math.round(60000 / beatmap.timingPoints.find((tp: any) => tp.uninherited)!.beatLength) : 0;
    const section = analyzeSections(beatmap);
    const lnMeasures = section.measures.filter((m: any) => m.category === "ln" && m.lnSubtype);
    const subtypeCount: Record<string, number> = {};
    for (const m of lnMeasures) {
      subtypeCount[m.lnSubtype] = (subtypeCount[m.lnSubtype] || 0) + 1;
    }
    const withM = lnMeasures.filter((m: any) => m.lnMetrics);
    const avg = (k: string) => withM.length > 0
      ? withM.reduce((s: number, m: any) => s + (m.lnMetrics as any)[k], 0) / withM.length : 0;

    results.push({
      file, stage, diff, shortName: short, bpm,
      refClusters, refTotal: totalAmount,
      ourSubtypes: subtypeCount, ourTotal: lnMeasures.length,
      avgInv: avg("inverse"), avgOvl: avg("overlay"), avgAr: avg("ar"), avgOuro: avg("ouroboros"),
    });
  }

  const stageNames: Record<number, string> = { 1: "CO/Basic", 2: "Release/Technical", 3: "Inverse/Wall", 4: "Speed/WC" };

  for (const r of results) {
    console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  S${r.stage} ${r.diff}th | ${r.shortName}  @ ${r.bpm}BPM  [${stageNames[r.stage]}]`);
    console.log(`────────────────────────────────────────────────────────────────────────────────`);

    // Ref
    console.log(`  [ref] 总 ${(r.refTotal / 1000).toFixed(1)}s`);
    for (const c of r.refClusters.slice(0, 5)) {
      console.log(`   ${c.ratio}%  ${c.pattern}/${c.specific}  ${(c.amount / 1000).toFixed(1)}s @ ${c.bpm}BPM`);
    }
    if (r.refClusters.length > 5) {
      const rest = r.refClusters.slice(5).reduce((s, c) => s + c.amount, 0);
      console.log(`   ... +${r.refClusters.length - 5} cls (${(rest / 1000).toFixed(1)}s)`);
    }

    // Our system
    const sortSub = Object.entries(r.ourSubtypes).sort((a, b) => b[1] - a[1]);
    console.log(`  [us]  ${r.ourTotal} LN measures`);
    for (const [st, cnt] of sortSub) {
      console.log(`   ${Math.round((cnt / r.ourTotal) * 100)}%  ${st}  (${cnt})`);
    }
    console.log(`  [metric] inv=${r.avgInv.toFixed(1)}% ovl=${r.avgOvl.toFixed(1)}% ar=${r.avgAr.toFixed(1)}% ouro=${r.avgOuro.toFixed(1)}%`);

    // Inference
    const inf = infer(r);
    console.log(`  → ${inf.main}/${inf.secondary}  — ${inf.reason}`);
  }

  // ── Summary table ──
  console.log(`\n\n${"═".repeat(135)}`);
  console.log("  SUMMARY: Stage | # | Map | BPM | ref主导 | ref Inverse% | 我们dominant | avg指标 | → 推测分类");
  console.log(`  ${"═".repeat(135)}`);
  for (const r of results) {
    const top = r.refClusters[0];
    const topStr = top ? `${top.pattern}/${top.specific} ${top.ratio}%` : "?";
    const refInvAmt = r.refClusters.filter(c => c.specific === "Inverse").reduce((s, c) => s + c.amount, 0);
    const refInvPct = r.refTotal > 0 ? Math.round((refInvAmt / r.refTotal) * 100) : 0;
    const sortSub = Object.entries(r.ourSubtypes).sort((a, b) => b[1] - a[1]);
    const ourDom = sortSub.length > 0 ? `${sortSub[0][0]} ${Math.round((sortSub[0][1] / r.ourTotal) * 100)}%` : "?";
    const inf = infer(r);
    const avg = `inv${r.avgInv.toFixed(0)}/ovl${r.avgOvl.toFixed(0)}/ar${r.avgAr.toFixed(0)}/ou${r.avgOuro.toFixed(0)}`;
    console.log(`  S${r.stage} | ${r.diff}th | ${r.shortName.slice(0, 30).padEnd(30)} | ${r.bpm}BPM | ${topStr.padEnd(22)} | inv${refInvPct}% | ${(ourDom + "  ").slice(0, 18)} | ${avg} | ${inf.main}/${inf.secondary}`);
  }
}

function infer(r: {
  stage: number; diff: number; bpm: number; refClusters: any[]; refTotal: number;
  ourSubtypes: Record<string, number>; ourTotal: number;
  avgInv: number; avgOvl: number; avgAr: number; avgOuro: number;
}): { main: string; secondary: string; reason: string } {
  const sig: string[] = [];
  const refByPat: Record<string, number> = {};
  for (const c of r.refClusters) refByPat[c.pattern] = (refByPat[c.pattern] || 0) + c.amount;
  const total = r.refTotal;
  const dRat = (refByPat["Density"] || 0) / total;
  const cRat = (refByPat["Coordination"] || 0) / total;
  const wRat = (refByPat["Wildcard"] || 0) / total;

  const revPct = r.ourTotal > 0 ? (r.ourSubtypes["LN Reverse"] || 0) / r.ourTotal : 0;
  const covPct = r.ourTotal > 0 ? (r.ourSubtypes["LN Cover"] || 0) / r.ourTotal : 0;
  const relPct = r.ourTotal > 0 ? (r.ourSubtypes["LN Release"] || 0) / r.ourTotal : 0;
  const ourPct = r.ourTotal > 0 ? (r.ourSubtypes["Ouroboros"] || 0) / r.ourTotal : 0;

  const hasRefInv = r.refClusters.some(c => c.specific === "Inverse");
  const refInvAmt = r.refClusters.filter(c => c.specific === "Inverse").reduce((s, c) => s + c.amount, 0);
  const refInvPct = total > 0 ? refInvAmt / total : 0;

  // Coordination patterns
  const hasRefRelease = r.refClusters.some(c => c.specific === "Release");
  const hasRefShield = r.refClusters.some(c => c.specific === "Shield");
  const hasRefColLock = r.refClusters.some(c => c.specific === "Column Lock");

  // Wildcard patterns
  const hasSpeedyWC = r.refClusters.some(c => c.specific === "Speedy WC");
  const hasJackyWC = r.refClusters.some(c => c.specific === "Jacky WC");

  // Stage-specific inference
  if (r.stage === 1) {
    // Stage 1: CO/Basic. Low difficulty, basic LN patterns.
    if (hasRefShield) {
      sig.push(`ref Shield`);
      if (hasRefColLock) sig.push(`+ColLock`);
      if (relPct > 0.2) {
        return { main: "TE", secondary: r.avgAr > 25 ? "RS" : "RR", reason: `Stage1: ref Coordination/Shield+Release, rel=${(relPct * 100).toFixed(0)}% → TE` };
      }
      return { main: "CO", secondary: "Shield", reason: `Stage1: ref Coordination/Shield主导, rev=${(revPct * 100).toFixed(0)}%` };
    }
    if (hasRefRelease) {
      return { main: "TE", secondary: r.avgAr > 25 ? "RS" : "RR", reason: `Stage1: ref Coordination/Release, ar=${r.avgAr.toFixed(1)}%` };
    }
    if (hasRefColLock) {
      return { main: "CO", secondary: "ColLock", reason: `Stage1: ref ColumnLock` };
    }
    if (revPct > 0.5 || r.avgInv > 20) {
      return { main: "DE", secondary: r.avgOuro > 80 ? "OC" : "Inverse", reason: `Stage1: rev=${(revPct * 100).toFixed(0)}% inverse=${r.avgInv.toFixed(1)}% → DE` };
    }
    if (covPct > 0.2) {
      return { main: "CO", secondary: "Shield", reason: `Stage1: cover=${(covPct * 100).toFixed(0)}% → CO/Shield` };
    }
    return { main: "CO", secondary: "ColLock", reason: `Stage1: 分散型LN默认ColLock` };
  }

  if (r.stage === 2) {
    // Stage 2: Release/Technical
    if (hasRefRelease && cRat >= 0.3) {
      // ref says Coordination/Release → TE
      return { main: "TE", secondary: r.avgAr > 25 ? "RS" : "RR", reason: `Stage2: ref Coord/Release ${(cRat * 100).toFixed(0)}%, ar=${r.avgAr.toFixed(1)}%` };
    }
    if (hasRefShield && cRat >= 0.3) {
      return { main: "CO", secondary: "Shield", reason: `Stage2: ref Coord/Shield ${(cRat * 100).toFixed(0)}%` };
    }
    if (hasRefInv && dRat >= 0.2) {
      return { main: "DE", secondary: "Inverse", reason: `Stage2: ref Density/Inverse ${(dRat * 100).toFixed(0)}%` };
    }
    if (dRat >= 0.3) {
      // Density without Inverse → either DE/Inverse (ref miss) or DE/Wall
      if (r.avgInv >= 20 || revPct >= 0.5) {
        return { main: "DE", secondary: r.avgOuro > 80 ? "OC" : "Inverse", reason: `Stage2: ref Density(no Inv), us inv=${r.avgInv.toFixed(1)}% rev=${(revPct * 100).toFixed(0)}%` };
      }
      return { main: "DE", secondary: "Wall", reason: `Stage2: ref Density(no Inv) + low inverse` };
    }
    if (revPct >= 0.7) {
      return { main: "DE", secondary: r.avgOuro > 100 ? "OC" : "Inverse", reason: `Stage2: rev=${(revPct * 100).toFixed(0)}%主导` };
    }
    if (relPct >= 0.2) {
      return { main: "TE", secondary: r.avgAr > 25 ? "RS" : "RR", reason: `Stage2: rel=${(relPct * 100).toFixed(0)}%` };
    }
    // Mixed
    if (hasRefColLock) {
      return { main: "CO", secondary: "ColLock", reason: `Stage2: mixed, ref ColLock present` };
    }
    return { main: "CO", secondary: "Shield", reason: `Stage2: mixed default CO/Shield` };
  }

  if (r.stage === 3) {
    // Stage 3: Inverse/Wall
    if (refInvPct >= 0.15) {
      if (hasRefInv && r.avgInv >= 20) {
        return { main: "DE", secondary: "Inverse", reason: `Stage3: ref Inverse ${(refInvPct * 100).toFixed(0)}%, us inv=${r.avgInv.toFixed(1)}%` };
      }
      // ref has some Inverse but our system doesn't agree → Wall variant
      return { main: "DE", secondary: "Wall", reason: `Stage3: ref Inverse ${(refInvPct * 100).toFixed(0)}%但us inv仅${r.avgInv.toFixed(1)}%` };
    }
    if (r.avgInv >= 25 || revPct >= 0.7) {
      return { main: "DE", secondary: "Inverse", reason: `Stage3: 系统判Inverse强烈(rev=${(revPct * 100).toFixed(0)}% inv=${r.avgInv.toFixed(1)}%) ref未确认` };
    }
    // Check if ref Density but not Inverse
    if (dRat >= 0.4) {
      const jsHsPresent = r.refClusters.some(c => c.specific === "JS Density" || c.specific === "HS Density");
      if (jsHsPresent && r.avgInv >= 15) {
        return { main: "DE", secondary: "Inverse", reason: `Stage3: ref Density/JS, LN头JS=Inverse` };
      }
      if (r.avgOuro >= 120) {
        return { main: "WC", secondary: "OC", reason: `Stage3: ouro=${r.avgOuro.toFixed(0)}%极高, ref Density` };
      }
      return { main: "DE", secondary: "Wall", reason: `Stage3: ref Density/${jsHsPresent ? "JS" : "(none)"}` };
    }
    if (r.avgOuro >= 150) {
      return { main: "WC", secondary: "OC", reason: `Stage3: ouro=${r.avgOuro.toFixed(0)}%极高高频OC` };
    }
    return { main: "DE", secondary: "Wall", reason: `Stage3: 低逆袭低ouro默认Wall` };
  }

  if (r.stage === 4) {
    // Stage 4: Speed/Wildcard
    if (hasSpeedyWC) {
      return { main: "WC", secondary: "SL", reason: `Stage4: ref Speedy WC ${(wRat * 100).toFixed(0)}%` };
    }
    if (hasJackyWC) {
      return { main: "WC", secondary: "JL", reason: `Stage4: ref Jacky WC` };
    }
    if (r.avgOuro >= 150) {
      return { main: "WC", secondary: "OC", reason: `Stage4: ouro=${r.avgOuro.toFixed(0)}%极高OC` };
    }
    if (dRat >= 0.4) {
      if (r.avgInv >= 20) {
        return { main: "DE", secondary: "Inverse", reason: `Stage4: ref Density + inv=${r.avgInv.toFixed(1)}%` };
      }
      return { main: "DE", secondary: "Wall", reason: `Stage4: ref Density ${(dRat * 100).toFixed(0)}%` };
    }
    if (r.avgOuro >= 100 || revPct >= 0.6) {
      return { main: "WC", secondary: "OC", reason: `Stage4: ouro=${r.avgOuro.toFixed(0)}% rev=${(revPct * 100).toFixed(0)}%` };
    }
    if (r.bpm >= 220) {
      return { main: "WC", secondary: "SL", reason: `Stage4: ${r.bpm}BPM高速默认SL` };
    }
    return { main: "DE", secondary: "Wall", reason: `Stage4: 低速混合默认Wall` };
  }

  return { main: "?", secondary: "?", reason: "unknown stage" };
}

main();
