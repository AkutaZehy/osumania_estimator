// 大勿段标记对照 — 12 表（8 dan 组 + 4 signicial 组，组内按段位排序）
//
// 这不是《大勿段游玩指南及标准规范文件》的忠实实现：我们的工作本质是"移植后调整"——
// 锚值核心（帐篷失衡 U 与多窗 min-A 扫描）来自观景台 guanjing-scene 仓库的 spike.js，
// 分带与词表取自《指南》5.4，再按本仓语料与体感标注做了本地重校准。与《指南》/站方
// suggestDetailed 的主要差异：
//   1. 锚值 = 手册 4.1.2.1 链式生长口径（t 网格 L/16..L/1024、步 {t/16,t/8,t/4}、调和权重
//      ΣC=-0.06）——站方现行实现是滑窗网格 min-A（spike.js），手册口径在站方无实现；
//      另算 spike-min 作为叠糊度的 delta 基准（聚合 A 与最难窗 A 的尺度局部性）。
//   2. 密度池按图级 family 路由（锁1≥10% = 主 jack：主 jack 图叠池=全部节、主 stream 图
//      切池=全部节）；节级叠段（同列≤2C 重复对 ≥12% 节音符数）与 Stream 段（非叠段且
//      行距中位数 ∈ [0.85,1.15]×C）只服务跨族轴——手册的"有效段"（小节验证法）未实现。
//   3. 叠糊度 = delta = 链式A − spike-min（<0.005 F / >0.01 P / 其余 R）；hand（三押≥20% 行，
//      分母=全部行）= Gults 规则 → R + -W 后缀。手册对叠的 F/R/P 是纯锚值阈值
//      （F≥1.1/R[1.09,1.1)/P<1.09）——该阈值在站方锚值算法下饱和（106 图全 F），故重标。
//   4. 切糊度 = 链式A 直套手册阈值（F≥1.11/R[1.1,1.11)/P<1.1，与站方 suggestDetailed 一致）。
//   5. 乱密度 = Stream 段 P50 ×2（32 分音口径）对照 S<8+1/256/M<8.5/L<9.5；越界 ≥9.5 →
//      密度位前缀 O（FRP 不显示）。乱糊度 = Stream 段每节弹对计数（≤1/16 F / (1/16,1] R /
//      (1,3] P / >3 P）+ 旗标 T（麻花 >3）/ W（构造 ≤1/16 且 A<1.115）——手册的"子弹密度"
//      计数单位未良定义，现行为过渡方案 B（每节原始计数），待锚图标注重标。
//   6. 密度单位 = 4 行滑窗均值（主导 cadence 归一的 16 拍节），非手册的"键密度/规范密度"
//      原文口径；换算关系（minijack 4↔8 等）未定标。
//
// 标识含义（当前词表）：
//   叠 `XY-Jack[-W]`      X=密度 S/M/L/H；Y=糊度 F/R/P；-W = Gults（hand→R）
//   切 `XY-Stream`        X=密度 B/S/M/L/H（B=低于切密度 4.75 的"碎"）；Y=糊度 F/R/P
//   乱 `XY-Speed[-T|-W]`  X=密度 S/M/L 或 O（越界）；Y=糊度 F/R/P；-T 麻花 / -W 构造
//
// 各表列：谱面 | BPM | osu星(Sunny 1×) | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称。
// 运行：
//   npx esbuild test/wdsGuideContrast.test.ts --bundle --platform=node --format=esm --outfile=dist/wdsGuideContrast.mjs && node dist/wdsGuideContrast.mjs
import * as fs from "fs";
import * as path from "path";

const MAPS_ROOT = path.resolve(process.cwd(), "../osu diff/work-r1/maps");
const REPORT_PATH = path.join(process.cwd(), "test", "wdsGuideContrast.report.md");

const GROUPS = [
  { label: "叠 Reform Jack", dir: "reform dans/jack" },
  { label: "叠 Regular Jack", dir: "regular dans/jack" },
  { label: "切 Reform Stamina", dir: "reform dans/stamina" },
  { label: "切 Regular Stream", dir: "regular dans/stream" },
  { label: "乱 Reform Speed", dir: "reform dans/speed" },
  { label: "乱 Regular Speed", dir: "regular dans/speed" },
  { label: "技 Reform Tech", dir: "reform dans/tech" },
  { label: "技 Regular Tech", dir: "regular dans/tech" },
  { label: "叠 Signicial", dir: "signicial dans/jack" },
  { label: "技 Signicial", dir: "signicial dans/tech" },
  { label: "乱 Signicial", dir: "signicial dans/speed" },
  { label: "切 Signicial", dir: "signicial dans/stamina" },
];

// PDF 5.4 密度分带
const jackBand = (d: number) => (d < 8 ? "S" : d < 10 ? "M" : d < 12 ? "L" : "H");
const streamBand = (d: number) => (d < 4.75 ? "B" : d < 6 ? "S" : d < 7 ? "M" : d < 7.5 ? "L" : "H"); // B=碎：低于切规定密度 4.75（手册单字 B）
const SPEED_S_LINE = 8 + 1 / 256;
const speedBand = (d: number) => (d < SPEED_S_LINE ? "S" : d < 8.5 ? "M" : d < 9.5 ? "L" : "—");
// 切糊度：PDF 锚值阈值
const streamLetter = (a: number) => (a >= 1.11 ? "F" : a >= 1.1 ? "R" : "P");
// 叠糊度：deltaA 线映射大勿 F/R/P；hand（三押≥20%）= Gults 规则 → 字母 R + 后缀 -W
const rawJackLetter = (a: number) => (a >= 1.1 ? "F" : a >= 1.09 ? "R" : "P");
const jackMush = (a: number, delta: number | null, tri: number): [string, string] => {
  if (tri >= 0.2) return ["R", "W"];
  if (a > 1.11 || delta == null) return [rawJackLetter(a), ""];
  return [delta < 0.005 ? "F" : delta > 0.01 ? "P" : "R", ""];
};
// 乱糊度（用户 2026-10-06）：字母恒为 F/R/P（PDF 子弹带：≤1/16→F、(1/16,1]→R、(1,3]→P、>3→P），
// 特殊旗标插中间：T=麻花（弹>3）、W=构造（弹≤1/16 且 A<1.115）
const speedMush = (a: number, bullet: number): [string, string] => {
  let flag = "";
  if (bullet > 3) flag = "T";
  else if (bullet <= 1 / 16 && a < 1.115) flag = "W";
  const letter = bullet > 1 / 16 && bullet <= 1 ? "R" : bullet > 1 ? "P" : "F";
  return [letter, flag];
};

const GREEK: Record<string, number> = { Alpha: 11, Beta: 12, Gamma: 13, Delta: 14, Epsilon: 15 };
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14 };
function danNumber(f: string, dir: string): number {
  if (dir.startsWith("signicial")) {
    if (/Last Stage/.test(f)) return 15;
    const m = f.match(/Stage ([IVX]+|\d+)/);
    if (m) return ROMAN[m[1]!] ?? parseInt(m[1]!, 10);
    return -1;
  }
  if (dir.startsWith("reform")) {
    const tag = f.replace(/^.*\[([^\]]+)\]\.osu$/, "$1");
    const m = tag.match(/~ ([A-Za-z0-9]+) ~ /);
    if (!m) return -1;
    const ord = m[1]!.match(/^(\d+)(?:st|nd|rd|th)$/);
    if (ord) return parseInt(ord[1]!, 10);
    return GREEK[m[1]!] ?? -1;
  }
  const reg = f.match(/Reg-(\d+)/);
  if (reg) return parseInt(reg[1]!, 10);
  const ex = f.match(/Extra-(\d+)/);
  if (ex) return 10 + parseInt(ex[1]!, 10);
  if (/Extra-Final/.test(f)) return 20;
  return -1;
}

function dominantBpm(parsed: import("../src/types/beatmap.js").ParsedBeatmap): number | null {
  const pts = parsed.timingPoints.filter((p) => p.uninherited && p.beatLength > 0).sort((a, b) => a.time - b.time);
  if (!pts.length) return null;
  const end = parsed.lastNote || parsed.duration;
  let best: { bpm: number; span: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const next = i + 1 < pts.length ? pts[i + 1]!.time : end;
    const span = Math.max(0, next - pts[i]!.time);
    const bpm = 60000 / pts[i]!.beatLength;
    if (!best || span > best.span) best = { bpm, span };
  }
  return best ? Math.round(best.bpm) : null;
}

function dominantCadence(rows: Array<{ t: number }>): number | null {
  if (rows.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i]!.t - rows[i - 1]!.t);
  gaps.sort((a, b) => a - b);
  const clusters: Array<{ center: number; count: number }> = [];
  for (const g of gaps) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(g - last.center) / last.center < 0.15) {
      last.center = (last.center * last.count + g) / (last.count + 1);
      last.count++;
    } else clusters.push({ center: g, count: 1 });
  }
  const dom = clusters.filter((c) => c.count >= 4).sort((a, b) => b.count - a.count)[0];
  return dom ? dom.center : null;
}

async function main() {
  const { OsuFileParser } = await import("../src/parser/osuFileParser.js");
  const { calculateSunny } = await import("../src/algorithm/sunnyRework.js");
  const { computeJackClass } = await import("../src/custom/jackClass.js");
  const { computeStreamClass } = await import("../src/custom/streamClass.js");

  const report: string[] = [
    "# 大勿段标记对照 — 12 表",
    "",
    "本表是《大勿段游玩指南及标准规范文件》+ 观景台实现的移植后调整版本，非忠实实现：",
    "锚值核心（帐篷失衡 U、多窗 min-A）来自 guanjing-scene 的 spike.js；分带与词表取自《指南》5.4；",
    "再按本仓语料与体感标注本地重校准。与原版的差异（链式锚值、图级 family 密度池、叠糊度 delta 线、",
    "乱密度 Stream 段 P50×2、弹对计数档）详见 test/wdsGuideContrast.test.ts 文件头。",
    "",
    "标识含义：",
    "  叠 `XY-Jack[-W]`：X=叠池 P90 密度档（S<8/M[8,10)/L[10,12)/H≥12）；Y=糊度 delta 线",
    "    （<0.005 F / >0.01 P / 其余 R）；hand（三押≥20% 行）= Gults → R + -W 后缀。",
    "  切 `XY-Stream`：X=Stream 池 P90 密度档（B<4.75 碎 / S<6 / M<7 / L<7.5 / H≥7.5）；",
    "    Y=链式锚值直套手册阈值（F≥1.11 / R[1.1,1.11) / P<1.1）。",
    "  乱 `XY-Speed[-T|-W]`：X=Stream 段 P50×2 密度档（S<8+1/256 / M<8.5 / L<9.5；≥9.5 → 前缀 O，",
    "    FRP 不显示）；Y=Stream 段每节弹对计数档（≤1/16 F / (1/16,1] R / (1,3] P / >3 P）；",
    "    -T 麻花（计数>3）/ -W 构造（计数≤1/16 且 A<1.115）后置。",
    "密度单位 = 4 行滑窗均值（主导 cadence 归一的 16 拍节），非手册的键密度/规范密度原文口径。",
    "osu星 = Sunny Rework 1×。段位：reform 1st..10th=1..10, Epsilon=15；regular Reg-N=N, Ex-N=10+N,",
    "Final=20；signicial Stage 0..XIV=0..14, Last Stage=15。",
    "",
  ];

  for (const g of GROUPS) {
    const dir = path.join(MAPS_ROOT, g.dir);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".osu")).sort();
    type Row = { dan: number; line: string };
    const out: Row[] = [];
    for (const f of files) {
      const parser = new OsuFileParser(fs.readFileSync(path.join(dir, f), "utf8"));
      parser.process();
      const parsed = parser.getParsedData();
      if (parsed.gameMode !== 3 || parsed.columnCount !== 4) continue;
      const dan = danNumber(f, g.dir);
      if (dan < 0) continue;
      // 行
      const byT = new Map<number, boolean[]>();
      for (let i = 0; i < parsed.noteStarts.length; i++) {
        const c = parsed.columns[i] ?? 0;
        if (c < 0 || c > 3) continue;
        let a = byT.get(parsed.noteStarts[i]!);
        if (!a) byT.set(parsed.noteStarts[i]!, a = [false, false, false, false]);
        a[c] = true;
      }
      const rows = [...byT].sort((x, y) => x[0] - y[0]).map(([t, a]) => ({ t, a, n: a.filter(Boolean).length }));
      const C = dominantCadence(rows);
      if (!C) continue;
      // 有效段（2s 空隙）
      const segs: Array<[number, number]> = [];
      let s0 = rows[0]!.t, prev = rows[0]!.t;
      for (const r of rows) {
        if (r.t - prev > 2000) { segs.push([s0, prev]); s0 = r.t; }
        prev = r.t;
      }
      segs.push([s0, prev]);
      // 音符时间/列前缀计数（链式锚值用）
      const times: number[] = [], cols: number[] = [];
      for (const [ss, ee] of segs) {
        for (const r of rows) {
          if (r.t < ss || r.t > ee) continue;
          for (let c = 0; c < 4; c++) if (r.a[c]) { times.push(r.t); cols.push(c); }
        }
      }
      const N = times.length;
      if (!N) continue;
      const pc: Uint32Array[] = [0, 1, 2, 3].map(() => new Uint32Array(N + 1));
      for (let i = 0; i < N; i++) {
        for (let c = 0; c < 4; c++) pc[c]![i + 1] = pc[c]![i]!;
        const ci = cols[i]!;
        pc[ci]![i + 1] = pc[ci]![i + 1]! + 1;
      }
      // 锚值（手册 4.1.2.1 链式生长口径）：每有效段 × t 网格 × 步长网格 → 窗链，
      // 链内 Uᵢ 调和权重（1/i，归一到 Σ=−0.06），全链聚合单一 A（不取 min）
      let A = Infinity;
      {
        let wSumU = 0, wSum = 0;
        for (const [ss, ee] of segs) {
          const L = ee - ss;
          if (L <= 0) continue;
          for (const tDiv of [16, 32, 64, 128, 256, 512, 1024]) {
            const t = L / tDiv;
            for (const stepDiv of [16, 8, 4]) {
              const s = t / stepDiv;
              let chainSumU = 0, chainH = 0, idx = 0;
              let lo = 0, hi = 0;
              for (let T = ss; T + t <= ee + 1e-9; T += s) {
                const from = T, to = T + t;
                while (hi < N && times[hi]! <= to) hi++;
                while (lo < hi && times[lo]! < from) lo++;
                idx++;
                chainH += 1 / idx;
                for (const [a, b] of [[0, 1], [2, 3]] as const) {
                  const c0 = pc[a]![hi]! - pc[a]![lo]!, c1 = pc[b]![hi]! - pc[b]![lo]!;
                  const n1 = Math.max(c0, c1), n2 = Math.min(c0, c1);
                  const u = n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
                  chainSumU += u / idx;
                }
              }
              wSumU += chainSumU;
              wSum += chainH;
            }
          }
        }
        // A = 1.135 + Σ CᵢUᵢ，ΣCᵢ = −0.06：A = 1.135 − 0.06 × (Σ(Uᵢ/i) / Σ(1/i))
        A = wSum > 0 ? 1.135 - 0.06 * (wSumU / wSum) : Infinity;
      }
      // spike-min 锚值（站方口径，最"锚"窗口尺度）：叠糊度 delta = 链式A − spikeMin（尺度局部性）
      let aSpike = Infinity;
      {
        const rt: number[] = [];
        let dur = 0;
        for (const [ss, ee] of segs) {
          for (const r of rows) {
            if (r.t < ss || r.t > ee) continue;
            rt.push(dur + (r.t - ss));
          }
          dur += ee - ss;
        }
        const rtN = rt.length;
        for (let d = 16; d <= 1024; d++) {
          const wMs = dur / d, stMs = wMs / 2, steps = (d - 1) * 2;
          let sumU = 0, cnt = 0, iF = 0, iT = 0;
          for (let j = 0; j <= steps; j++) {
            const from = j * stMs, to = j === steps ? dur : from + wMs;
            while (iT < rtN && rt[iT]! <= to) iT++;
            while (iF < iT && rt[iF]! < from) iF++;
            for (const [a, b] of [[0, 1], [2, 3]] as const) {
              const c0 = pc[a]![iT]! - pc[a]![iF]!, c1 = pc[b]![iT]! - pc[b]![iF]!;
              const n1 = Math.max(c0, c1), n2 = Math.min(c0, c1);
              sumU += n1 === 0 ? 0 : 1 - Math.abs(n1 - 2 * n2) / n1;
              cnt++;
            }
          }
          aSpike = Math.min(aSpike, 1.135 - 0.06 * (sumU / cnt));
        }
      }
      // 节分类 + 分族密度（用户 2026-10-06 口径）：
      //   叠段 = 节内同列≤2C 重复对 ≥ 12% 节音符数（jack/chord 纹理），其余为 Stream 段；
      //   叠名只吃叠段，切/乱只吃 Stream 段；段内 P90 = 难度细分（滤除过低部分）。
      //   乱密度 = Stream 段 P90 × 2（32 分音口径）。
      const sectionMs = 64 * C;
      const means: number[] = [], jackMeans: number[] = [], streamMeans: number[] = [], streamBullets: number[] = [];
      for (const [ss, ee] of segs) {
        const nB = Math.floor((ee - ss) / sectionMs + 1e-9);
        for (let b = 0; b < nB; b++) {
          const bs = ss + b * sectionMs, be = bs + sectionMs;
          const inB = rows.filter((r) => r.t >= bs && r.t < be);
          if (inB.length < 4) continue;
          let sum = 0, cN = 0;
          for (let i = 0; i + 3 < inB.length; i++) {
            sum += inB[i]!.n + inB[i + 1]!.n + inB[i + 2]!.n + inB[i + 3]!.n;
            cN++;
          }
          if (!cN) continue;
          const dens = sum / cN;
          means.push(dens);
          const notes = inB.reduce((s2, r) => s2 + r.n, 0);
          const ct: number[][] = [[], [], [], []];
          for (const r of inB) for (let c = 0; c < 4; c++) if (r.a[c]) ct[c]!.push(r.t);
          let pairs = 0;
          for (const arr of ct) for (let i = 1; i < arr.length; i++) if (arr[i]! - arr[i - 1]! <= 2 * C) pairs++;
          // 节内局部 cadence：行间隔中位数（DT 的半速 Stream 段 localC≈2C，不入切/乱池）
          const gapsS: number[] = [];
          for (let i = 1; i < inB.length; i++) gapsS.push(inB[i]!.t - inB[i - 1]!.t);
          gapsS.sort((a, b) => a - b);
          const localC = gapsS.length ? gapsS[Math.floor(gapsS.length / 2)]! : C;
          if (notes > 0 && pairs >= 0.12 * notes) {
            jackMeans.push(dens); // 叠段：jack/chord 纹理，不限 cadence（半速叠段是叠轴的正当样本）
          } else if (localC >= C * 0.85 && localC <= C * 1.15) {
            streamMeans.push(dens); // Stream 段：低重复纹理且 cadence 贴合置顶 BPM（双向 ±15%：
            // 慢段=叠段不混入，快段=乱型单点段（密度锁 4.0）也不混入——Hymn 病例）
            streamBullets.push(pairs);
          }
        }
      }
      if (!means.length || !Number.isFinite(A)) continue;
      // 图级 family（主导判定，锁1≥10% = 主 jack；与面板/记忆口径一致）：
      //   主 jack 图：叠池=全部节；主 stream 图：切池=全部节。
      //   节级纹理抽取（jackMeans/streamMeans）只服务跨族轴（主 stream 图的乱轴剔叠段、
      //   主 jack 图的切/乱轴剔叠段）。
      let k1 = 0, kTot = 0;
      for (let col = 0; col < 4; col++) {
        const ts = rows.filter((r) => r.a[col]).map((r) => r.t);
        for (let i = 1; i < ts.length; i++) {
          const dt = ts[i]! - ts[i - 1]!;
          if (dt <= 0 || dt > 16 * C) continue;
          kTot++;
          if (Math.abs(dt - C) <= C * 0.15) k1++;
        }
      }
      const isJackChart = kTot > 0 && k1 / kTot >= 0.10;
      const q = (arr: number[], fb: number[], p: number) => {
        const a2 = [...(arr.length ? arr : fb)].sort((x, y) => x - y);
        return a2[Math.floor(p * (a2.length - 1))]!;
      };
      const p90 = q(means, means, 0.9);           // 兜底/对比
      const p90Jack = q(isJackChart ? means : jackMeans, means, 0.9);   // 叠：主jack图=全部节
      const p90Stream = q(isJackChart ? streamMeans : means, means, 0.9); // 切：主stream图=全部节
      const p50Stream = q(streamMeans, means, 0.5);  // 乱：Stream 段 P50（用户校准：Icyxis/Reimei/YAYY 8.5–9、DT=8）
      const sb = [...streamBullets].sort((a, b) => a - b);
      const bP50 = sb.length ? sb[Math.floor(sb.length / 2)]! : 0;
      // 三押行占比（hand 判定）
      let nRowsAll = 0, nRows3 = 0;
      for (const r of rows) {
        if (r.n >= 1) nRowsAll++;
        if (r.n >= 3) nRows3++;
      }
      const tri = nRowsAll ? nRows3 / nRowsAll : 0; // 分母=全部行（定版口径）
      // 主键型
      const jc = computeJackClass(parsed, 1);
      const sc = computeStreamClass(parsed, 1);
      // Sunny 星
      let star = "—";
      try {
        const sr = await calculateSunny(fs.readFileSync(path.join(dir, f), "utf8"), 1, { dt: false, ht: false, hr: false, ez: false, da: false, in: false, ho: false });
        star = sr.star > 0.01 ? sr.star.toFixed(2) : "—";
      } catch { /* 保持 — */ }
      const delta = Number.isFinite(aSpike) ? A - aSpike : null; // 聚合A − 最难窗A：锚纹理尺度局部性
      const jD = jackBand(p90Jack);
      const [jL, jFlag] = jackMush(A, delta, tri);
      const sD2 = streamBand(p90Stream);
      const sL = streamLetter(A);
      // 乱密度 = Stream 段 P50 × 2（32 分音口径）对照 8.0039/8.5/9.5，≥9.5 = 切级出档
      const pRaw = p50Stream * 2;
      const pOut = pRaw >= 9.5; // 越过乱上限 9.5 → 密度位前缀 O（切级密度）
      const pD = pOut ? "O" : speedBand(pRaw);
      // 乱糊度：Stream 段每节弹对原始计数（过渡方案 B，用户 2026-10-06），阈值 PDF 字面
      const [pL, pFlag] = speedMush(A, bP50);
      const tag = f.replace(/^.*\[([^\]]+)\]\.osu$/, "$1").slice(0, 26);
      out.push({
        dan,
        line: `| ${tag} | ${dominantBpm(parsed) ?? "—"} | ${star} | ${dan} | ${jc.className} | ${sc.className} | ${jD === "—" ? "—" : jD}${jL}-Jack${jFlag ? "-" + jFlag : ""} | ${sD2 === "—" ? "—" : sD2}${sL}-Stream | ${pOut ? `O-Speed${pFlag ? "-" + pFlag : ""}` : `${pD}${pL}-Speed${pFlag ? "-" + pFlag : ""}`} |`,
      });
    }
    out.sort((a, b) => a.dan - b.dan);
    report.push(`## ${g.label}（${g.dir}）`, "");
    report.push("| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |");
    report.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of out) report.push(r.line);
    report.push("");
  }

  fs.writeFileSync(REPORT_PATH, report.join("\n"), "utf8");
  console.log(`报告已写入 ${REPORT_PATH}`);
}
main();
