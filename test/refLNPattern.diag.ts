// ============================================================
// 使用 Reference 工具 (osumania_map_analyser) 分析 stg1-4
// 输出: 每个stage的Pattern结构 + 每类LN子类型下的键型分布
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Paths ──
const REF_DIR = path.resolve(__dirname, "../References/osumania_map_analyser/ManiaMapAnalyser by Leo_Black");
const LN_MAPS_DIR = path.resolve(__dirname, "../maps/LN");
const OUT_DIR = path.resolve(__dirname, "../ref-output");

// ── Helpers ──
function getShortName(filename: string): string {
  const m = filename.match(/\[(.+?)\]/);
  return m ? m[1] : filename;
}

interface ClusterInfo {
  pattern: string;
  specificType: string | null;
  bpm: number;
  amount: number;
  importance: number;
  mixed: boolean;
}

interface StageSummary {
  stage: number;
  maps: number;
  clusters: ClusterInfo[];
}

// ── Main ──
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Dynamically import the ref tool's modules
  const parserMod = await import(
    /* @vite-ignore */ `file:///${REF_DIR.replace(/\\/g, "/")}/js/parser/patternOsuParser.js`
  );
  const summaryMod = await import(
    /* @vite-ignore */ `file:///${REF_DIR.replace(/\\/g, "/")}/js/patterns/summary.js`
  );

  const { parseOsuManiaFromText } = parserMod;
  const { fromChart } = summaryMod;

  const allFiles = fs.readdirSync(LN_MAPS_DIR).filter((f) => f.endsWith(".osu"));

  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter((f) => f.includes(`Stage ${stage}`));
    const allClusters: ClusterInfo[] = [];
    const perMapResults: Array<{
      file: string;
      short: string;
      bpm: number;
      modeTag: string;
      mainCategory: string;
      clusters: ClusterInfo[];
    }> = [];

    console.log(`\n${"█".repeat(130)}`);
    console.log(`  STAGE ${stage} — ${stageFiles.length} maps  |  REF TOOL (osumania_map_analyser)`);
    console.log(`  Stage ${stage}: ${
      stage === 1 ? "All-round/hybrid" :
      stage === 2 ? "Release/technical" :
      stage === 3 ? "Inverse/wall" : "Speed/density"
    }`);
    console.log(`${"█".repeat(130)}`);

    // ═══ Phase 1: Run analysis on each map ═══
    for (const file of stageFiles) {
      const short = getShortName(file);
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");

      try {
        const chart = parseOsuManiaFromText(osuText);
        const report = fromChart(chart);

        // Extract BPM from first timing point
        const bpmMatch = osuText.match(/\[TimingPoints\][\s\S]*?(\d+),(\d+)/);
        const mapBPM = bpmMatch
          ? Math.round(60000 / parseInt(bpmMatch[2]!))
          : 0;

        const clusters: ClusterInfo[] = report.Clusters.map((c: any) => ({
          pattern: c.Pattern,
          specificType: c.SpecificTypes?.[0]?.[0] ?? null,
          bpm: c.BPM,
          amount: c.Amount,
          importance: c.Importance ?? 0,
          mixed: c.Mixed ?? false,
        }));

        allClusters.push(...clusters);
        perMapResults.push({
          file,
          short,
          bpm: mapBPM,
          modeTag: report.ModeTag,
          mainCategory: report.Category,
          clusters,
        });

        // Map-level summary
        const sortedClusters = [...clusters].sort((a, b) => b.importance - a.importance);
        const top3 = sortedClusters.slice(0, 3)
          .map((c) => {
            const name = c.specificType ? `${c.specificType}` : c.pattern;
            return `${Math.round(c.bpm)}BPM ${name} (${(c.amount / 1000).toFixed(1)}s)`;
          })
          .join(" | ");

        console.log(`\n  ${String(mapBPM).padStart(3)}BPM ${short.padEnd(26)} [${report.ModeTag}] ${report.Category}`);
        console.log(`    ${top3}`);

        // Per-pattern detail
        const lnClusters = clusters.filter((c) =>
          ["Coordination", "Density", "Wildcard"].includes(c.pattern)
        );
        const rcClusters = clusters.filter((c) =>
          ["Stream", "Chordstream", "Jacks"].includes(c.pattern)
        );

        if (lnClusters.length > 0) {
          const lnDetail = lnClusters
            .sort((a, b) => b.importance - a.importance)
            .map((c) => {
              const name = c.specificType || c.pattern;
              return `LN:${name} @ ${Math.round(c.bpm)}BPM ${(c.amount / 1000).toFixed(1)}s`;
            })
            .join("  ");
          console.log(`    ${lnDetail}`);
        }
        if (rcClusters.length > 0) {
          const rcDetail = rcClusters
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 3)
            .map((c) => {
              const name = c.specificType || c.pattern;
              return `${name} @ ${Math.round(c.bpm)}BPM ${(c.amount / 1000).toFixed(1)}s`;
            })
            .join("  ");
          console.log(`    ${rcDetail}`);
        }
      } catch (e: any) {
        console.log(`\n  ❌ ${short}: ${e.message}`);
      }
    }

    // ═══ Phase 2: Aggregate per-stage ═══
    console.log(`\n\n  ${"─".repeat(80)}`);
    console.log(`  📊 全Stage聚合: 6大Core Pattern分布 (按Importance合计)`);
    console.log(`  ${"─".repeat(80)}`);

    // Group by (pattern + specificType)
    const patternGroups = new Map<string, {
      pattern: string;
      specificType: string | null;
      totalAmount: number;
      totalImportance: number;
      bpmSum: number;
      count: number;
      maps: Set<string>;
    }>();

    for (const c of allClusters) {
      const key = c.specificType ? `${c.pattern}::${c.specificType}` : c.pattern;
      if (!patternGroups.has(key)) {
        patternGroups.set(key, {
          pattern: c.pattern,
          specificType: c.specificType,
          totalAmount: 0,
          totalImportance: 0,
          bpmSum: 0,
          count: 0,
          maps: new Set(),
        });
      }
      const g = patternGroups.get(key)!;
      g.totalAmount += c.amount;
      g.totalImportance += c.importance;
      g.bpmSum += c.bpm;
      g.count++;
      // track which maps — use short name from perMapResults
      for (const pm of perMapResults) {
        const cMap = pm.clusters.find(
          (cc) => (cc.specificType ? `${cc.pattern}::${cc.specificType}` : cc.pattern) === key
        );
        if (cMap) g.maps.add(pm.short);
      }
    }

    // Sort by total importance
    const sortedGroups = [...patternGroups.entries()]
      .sort((a, b) => b[1].totalImportance - a[1].totalImportance);

    const totalImportance = sortedGroups.reduce((s, [, v]) => s + v.totalImportance, 0);

    // Show per core pattern breakdown
    const corePatterns = ["Coordination", "Density", "Wildcard", "Stream", "Chordstream", "Jacks"];
    for (const corePat of corePatterns) {
      const matches = sortedGroups.filter(([, v]) => v.pattern === corePat);
      if (matches.length === 0) continue;

      const patTotalImp = matches.reduce((s, [, v]) => s + v.totalImportance, 0);
      const patTotalAmt = matches.reduce((s, [, v]) => s + v.totalAmount, 0);
      const impPct = totalImportance > 0 ? (patTotalImp / totalImportance * 100).toFixed(0) : "0";
      const amtS = (patTotalAmt / 1000).toFixed(1);

      console.log(`\n  🔷 ${corePat}  (Importance ${impPct}% · ${amtS}s total)`);

      for (const [key, val] of matches) {
        const avgBPM = val.count > 0 ? Math.round(val.bpmSum / val.count) : 0;
        const impPct2 = totalImportance > 0 ? (val.totalImportance / totalImportance * 100).toFixed(1) : "0";
        const name = val.specificType || corePat;
        const bar = "█".repeat(Math.round(parseFloat(impPct2) / 1.5));
        console.log(`    ${(name as string).padEnd(18)}  ${bar}  ${impPct2}%  avg ${avgBPM}BPM  ${(val.totalAmount / 1000).toFixed(1)}s  (${val.maps.size}/${stageFiles.length} maps)`);
      }
    }

    // ═══ Phase 3: LN Core → RC coexistence analysis ═══
    console.log(`\n\n  ${"─".repeat(80)}`);
    console.log(`  🔗 LN ↔ RC 共存分析 (同map内LN Core与RC Core的共现)`);
    console.log(`  ${"─".repeat(80)}`);

    // For each map, find which LN core types and RC core types coexist
    const lnRcCoexist: Record<string, { rcPatterns: Map<string, number>; lnBPM: number[] }> = {};
    const rcLnCoexist: Record<string, { lnPatterns: Map<string, number>; rcBPM: number[] }> = {};

    for (const pm of perMapResults) {
      const lnCores = pm.clusters.filter((c) =>
        ["Coordination", "Density", "Wildcard"].includes(c.pattern)
      );
      const rcCores = pm.clusters.filter((c) =>
        ["Stream", "Chordstream", "Jacks"].includes(c.pattern)
      );

      // LN → RC: for each LN type, what RC patterns appear in same map?
      for (const ln of lnCores) {
        const lnName = ln.specificType || ln.pattern;
        if (!lnRcCoexist[lnName]) lnRcCoexist[lnName] = { rcPatterns: new Map(), lnBPM: [] };
        lnRcCoexist[lnName].lnBPM.push(ln.bpm);
        for (const rc of rcCores) {
          const rcName = rc.specificType || rc.pattern;
          lnRcCoexist[lnName].rcPatterns.set(
            rcName,
            (lnRcCoexist[lnName].rcPatterns.get(rcName) ?? 0) + rc.amount
          );
        }
      }

      // RC → LN: reverse
      for (const rc of rcCores) {
        const rcName = rc.specificType || rc.pattern;
        if (!rcLnCoexist[rcName]) rcLnCoexist[rcName] = { lnPatterns: new Map(), rcBPM: [] };
        rcLnCoexist[rcName].rcBPM.push(rc.bpm);
        for (const ln of lnCores) {
          const lnName = ln.specificType || ln.pattern;
          rcLnCoexist[rcName].lnPatterns.set(
            lnName,
            (rcLnCoexist[rcName].lnPatterns.get(lnName) ?? 0) + ln.amount
          );
        }
      }
    }

    // Show LN → RC
    const sortedLnNames = Object.entries(lnRcCoexist)
      .sort((a, b) => {
        const aAmt = [...a[1].rcPatterns.values()].reduce((s, v) => s + v, 0);
        const bAmt = [...b[1].rcPatterns.values()].reduce((s, v) => s + v, 0);
        return bAmt - aAmt;
      });

    for (const [lnName, data] of sortedLnNames) {
      const totalRc = [...data.rcPatterns.values()].reduce((s, v) => s + v, 0);
      const avgBPM = data.lnBPM.length > 0
        ? Math.round(data.lnBPM.reduce((s, v) => s + v, 0) / data.lnBPM.length)
        : 0;

      console.log(`\n  【${lnName}】@ ~${avgBPM}BPM:`);
      const sortedRc = [...data.rcPatterns.entries()].sort((a, b) => b[1] - a[1]);
      for (const [rcName, amount] of sortedRc) {
        const pct = totalRc > 0 ? (amount / totalRc * 100).toFixed(0) : "0";
        const bar = "█".repeat(Math.round(parseInt(pct) / 3));
        console.log(`    → ${(rcName as string).padEnd(18)} ${bar} ${pct}% (${(amount / 1000).toFixed(1)}s)`);
      }
    }

    // ═══ Phase 4: Save output ═══
    const outLines: string[] = [];
    outLines.push(`# Stage ${stage} — Ref Tool Pattern Analysis`);
    outLines.push(``);
    outLines.push(`## Per-Map Summary`);
    outLines.push(``);
    outLines.push(`| Map | BPM | Mode | Category | Top 3 Clusters |`);
    outLines.push(`|---|---|---|---|---|`);

    for (const pm of perMapResults) {
      const top3 = pm.clusters
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3)
        .map((c) => {
          const name = c.specificType || c.pattern;
          return `${Math.round(c.bpm)}BPM ${name}`;
        })
        .join(", ");
      outLines.push(`| ${pm.short} | ${pm.bpm} | ${pm.modeTag} | ${pm.mainCategory} | ${top3} |`);
    }

    outLines.push(``);
    outLines.push(`## Aggregate Pattern Distribution`);
    outLines.push(``);
    outLines.push(`| Pattern | Specific Type | Avg BPM | Total Time (s) | Importance % | Maps |`);
    outLines.push(`|---|---|---|---|---|---|`);

    for (const [key, val] of sortedGroups) {
      const avgBPM = val.count > 0 ? Math.round(val.bpmSum / val.count) : 0;
      const impPct = totalImportance > 0 ? (val.totalImportance / totalImportance * 100).toFixed(1) : "0";
      outLines.push(`| ${val.pattern} | ${val.specificType || "-"} | ${avgBPM} | ${(val.totalAmount / 1000).toFixed(1)} | ${impPct}% | ${val.maps.size}/${stageFiles.length} |`);
    }

    const outFile = path.join(OUT_DIR, `stage${stage}-ref-pattern.md`);
    fs.writeFileSync(outFile, outLines.join("\n"), "utf-8");
    console.log(`\n  💾 已保存: ${outFile}`);
  }

  // ═══ Cross-stage comparison ═══
  console.log(`\n\n${"█".repeat(130)}`);
  console.log(`  跨Stage对比: LN Core Pattern dominance`);
  console.log(`${"█".repeat(130)}`);

  // Just print the LN core distribution per stage
  for (const stage of [1, 2, 3, 4]) {
    const stageFiles = allFiles.filter((f) => f.includes(`Stage ${stage}`));
    const lnCoreCounts: Record<string, { total: number; count: number }> = {};

    for (const file of stageFiles) {
      const short = getShortName(file);
      const osuText = fs.readFileSync(path.join(LN_MAPS_DIR, file), "utf-8");
      try {
        const chart = parseOsuManiaFromText(osuText);
        const report = fromChart(chart);

        // Scan clusters: which LN core types are present in this map?
        const lnCores = new Set<string>();
        for (const c of report.Clusters) {
          if (["Coordination", "Density", "Wildcard"].includes(c.Pattern)) {
            const name = c.SpecificTypes?.[0]?.[0] || c.Pattern;
            lnCores.add(name);
          }
        }

        for (const lc of lnCores) {
          if (!lnCoreCounts[lc]) lnCoreCounts[lc] = { total: 0, count: 0 };
          lnCoreCounts[lc].count++;
        }
      } catch { /* skip */ }
    }

    console.log(`\n  Stage ${stage} — LN子类型出现次数 (map粒度)：`);
    const sortedLC = Object.entries(lnCoreCounts).sort((a, b) => b[1].count - a[1].count);
    for (const [type, info] of sortedLC) {
      console.log(`    ${type.padEnd(18)}: ${String(info.count).padStart(2)}/${stageFiles.length} maps`);
    }
  }
}

main();
