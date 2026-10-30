# Algorithm notes

How the numbers behind the overlay are produced. Every formula, threshold and unit below is stated together with the source location it comes from (`file:line`). Terminology and translations live in [glossary.md](glossary.md); the panel field names and display formats are listed in the [README metric index](../README.md#metric-index).

Line references were refreshed in the change that translated the source comments (commit `902b6b4`). They are pointers, not contracts: translating a comment block or adding a line above them shifts every number that follows.

## Pipeline

`src/integration/analyzer.ts` orchestrates the stages, in this order:

| Stage | Source | Notes |
| --- | --- | --- |
| parse | `analyzer.ts:269-291` | `.osu` text → `OsuFileParser`; IN/HO conversion runs inside the same parser (`analyzer.ts:271-284`) so every later stage sees the converted chart |
| Sunny | `analyzer.ts:348` | `src/algorithm/sunnyRework.ts` — 6 bar components (Jbar, Xbar, Pbar, Abar, Rbar, C/Ks, `sunnyRework.ts:21`), weighted percentile aggregation |
| chart / primitives | `analyzer.ts:369` | one `createChart` + `calculatePrimitives` pair, shared by the pattern and custom stages |
| patterns | `analyzer.ts:376-382` | `src/patterns/*`: 6 core patterns (`patternsDef.ts:31-38`) + 20 4K-specific ones (`patternsDef.ts:851-900`); rating multipliers in `src/patterns/config.ts:41-48` |
| grid | `analyzer.ts:390` | `src/custom/gridAnalysis.ts` — beat grid, dominant pattern, switch metric, vibro label |
| custom | `analyzer.ts:401` | `src/custom/customMetrics.ts` — density, jack, stream, tech, stamina, anchor, LN pools, wds markers |
| aggregate | `analyzer.ts:412` | `src/integration/difficultyAggregator.ts` — Sunny + custom → final star |
| sections | `analyzer.ts:417` | `src/custom/sectionAnalysis.ts` — segment bar / in-game bar |

Module ownership:

| Module | Owns |
| --- | --- |
| `src/custom/gridAnalysis.ts` | beat grid, cell classification, pattern tiers, dominant pattern, switch metric, per-cell timing |
| `src/custom/lnAnalysis.ts` | LN metrics, LN pool scores, release difficulty |
| `src/custom/jackAnalysis.ts` | finger/hand pressure, multi-scale hand imbalance, jack density grade |
| `src/custom/streamAnalysis.ts` | stream imbalance, broken-stream detection |
| `src/custom/jackClass.ts` | jack class typing, burst/sum stamina |
| `src/custom/streamClass.ts` | stream class typing, 10 s / 30 s stamina peaks |
| `src/custom/anchorAnalysis.ts` | SF / SH / DH anchor stamina tiers |
| `src/custom/techAnalysis.ts` | grace detection, row-spacing CV, single-finger interval, KPS, rolls/trills |
| `src/custom/vibroAnalysis.ts` | bullet-4 detection, SHFC classification, canVibro, verdict |
| `src/custom/wdsMarker.ts` | wds0-like marker computation |
| `src/custom/density.ts` | sliding-window density (both hands, per hand, per column) |
| `src/custom/sectionAnalysis.ts` | segment slicing, pattern analysis, LN subtypes, anomaly detection |

## Division-based grid

The map is cut into a beat grid; one cell spans one beat (4 rows in 4K). Cell construction: `gridAnalysis.ts:1516-1588`.

Per cell:

- **Timing** — BPM and beat length come from the timing point active at the cell start (`gridAnalysis.ts:1523-1524`, helpers at `gridAnalysis.ts:124-146`).
- **Category** — `break` when the cell holds no notes (`gridAnalysis.ts:1542-1550`); `ln` when ≥50 % of its notes are LNs (`gridAnalysis.ts:1553-1561`); otherwise `jack` or `stream` depending on `detectJack` (`gridAnalysis.ts:263-312`, cell assignment at `gridAnalysis.ts:1575-1580`).
- **Subdivision** — `detectSubdivision` (`gridAnalysis.ts:173-262`) scores the candidate denominators `[2, 3, 4, 6, 8, 12]` against the cell's note intervals with a 20 % jitter tolerance (`gridAnalysis.ts:181-183`); a cell without a match is marked `isGrace` (`gridAnalysis.ts:1582`). When one denominator ≥ 6 covers ≥30 % of the analysed cells, grace cells are re-checked against that subdivision (`gridAnalysis.ts:1590-1599`).
- **Effective BPM** — `cellRawBPM * (denom / 4)`, rounded (`gridAnalysis.ts:1566`, `gridAnalysis.ts:1583`); the speed rate is applied to cell and segment BPM afterwards (`gridAnalysis.ts:1928-1936`).

### Division ↔ effective BPM

`effectiveBPM = cellRawBPM × (denom / 4)` (`gridAnalysis.ts:1566`):

| Denom | Note value | Effective BPM | Cell subdivision |
| --- | --- | --- | --- |
| 1 | 4th | `cellBPM / 4` | not a candidate — cells are cut on beats |
| 2 | 8th | `cellBPM / 2` | yes |
| 3 | 12th | `cellBPM * 3/4` | yes |
| 4 | 16th | `cellBPM` | yes (also the fallback denominator when no subdivision is detected — those cells are marked `isGrace`) |
| 6 | 24th | `cellBPM * 1.5` | yes |
| 8 | 32nd | `cellBPM * 2` | yes |
| 12 | 48th | `cellBPM * 3` | yes |
| — | grace / flam | `cellBPM` (no subdivision) | `isGrace` cells (`gridAnalysis.ts:1582`); tech stage falls back to an absolute 50 ms rule there (`techAnalysis.ts:129-131`) |

## Switch metric (gridSwitch)

`gridAnalysis.ts:1832-1905`. Unit: **number of run-type transitions** inside a sliding **16-beat** window (16 cells = 64 rows in 4K).

1. **Rows** — rice notes and LN heads (counted as single notes at their start time) are clustered by actual timestamp; notes ≤8 ms apart merge into one row (`gridAnalysis.ts:1844-1855`). The row grid follows the chart, not a fixed subdivision.
2. **Pairs** — consecutive rows sharing any column are a jack pair (`J`), everything else is a stream pair (`S`); single-column jacks and chord overlaps both count (`gridAnalysis.ts:1862-1867`).
3. **Runs** — consecutive same-type pairs merge into runs (`gridAnalysis.ts:1869-1881`).
4. **Window** — a 16-beat time window (`winMs = 16 * beatLength`, `gridAnalysis.ts:1883-1884`) slides across the map in one-beat steps (`gridAnalysis.ts:1891`); `gridSwitch` is the largest number of run-type transitions inside any window (`gridAnalysis.ts:1895-1902`).

Descriptor (`gridAnalysis.ts:1923-1926`): **Steady** ≤15, **Mixed** ≤25, **Rhythmic** ≤35, **Intense** >35. Displayed in the STAMINA panel as `Switch` (`display.ts:410`).

## Jack class system

`src/custom/jackClass.ts`. Output: the JACK panel `Class` and `Stamina` rows.

1. **Rows and links** — two *adjacent* rows (no row in between) sharing a column form a link (`jackClass.ts:43-57`, `jackClass.ts:59-69`); adjacency is what separates a jack from a same-column repeat across a stream structure.
2. **Cadence clusters** — link intervals are sorted and split greedily whenever the next interval exceeds 1.15× the running mean (`jackClass.ts:71-89`); clusters with fewer than 4 links are dropped (`jackClass.ts:88`). A link joins a cluster when it stays within ±18 % of the cluster centre (`jackClass.ts:27`, `jackClass.ts:95`). The dominant cluster plus secondaries holding ≥10 % of the links at effective BPM ≥60 are used (`jackClass.ts:38-39`, `jackClass.ts:166`); a cadence's effective BPM is `round(15000 / cadence_ms)` (`jackClass.ts:79`).
3. **Chains** — maximal consecutive links per column give the x-bullet lengths (`jackClass.ts:92-118`); chords with intervening rows are excluded by construction.
4. **Streaks** — contiguous jack runs on a qualifying cadence, with a ±18 % interval tolerance and a tolerated single non-jack row transition (`jackClass.ts:27`, `jackClass.ts:119-151`).
5. **Pooled statistics** — over all qualifying clusters (`jackClass.ts:211-230`):
   - `keys` = Σ chain lengths, `p3` = share of keys in 3+-run chains, `k5p` = share of keys in 5+-run chains, `avgKey` = Σx²nₓ / Σxnₓ,
   - `kps` = keys / chart duration,
   - `peak` = largest 10 s bucket of chain keys ÷ 10.
6. **Class decision** (`jackClass.ts:232-250`):
   - fewer than 20 notes, no qualifying cluster, or neither condition met → `Actually Not Jack` (`jackClass.ts:157`, `jackClass.ts:235`),
   - general condition `kps ≥ 4.5 && peak ≥ 6.5` (`jackClass.ts:32-33`, `jackClass.ts:234`),
   - coverage condition: streak coverage ≥25 % of the chart (`jackClass.ts:31`, `jackClass.ts:182`),
   - density band from `kps`: Low <8, Mid <15, High ≥15 keys/s (`jackClass.ts:35-36`, `jackClass.ts:237`),
   - anchor confidence = 100 × m1 × m2 × m3 where m1 is the 5+-run key share band, m2 = clamp((avgKey − 2.8) / 1.2), m3 = clamp((5+-run count − 5) / 10) (`jackClass.ts:238-242`); ≥70 adds the `Anchor /` prefix (`jackClass.ts:37`, `jackClass.ts:245`),
   - `p3 < 15 %` → `Bullet / Minijack` (`jackClass.ts:34`, `jackClass.ts:246`),
   - otherwise `{Low|Mid|High} Chordjack` (`jackClass.ts:247`).
7. **Stamina row** (`jackClass.ts:170-209`) — burst = longest single streak; streaks separated by ≤½ measure merge into groups, the gap time is not counted and durations plus note counts accumulate; the merged maximum is marked `Broken` when it crosses 10 s while the unmerged maximum stayed below it (`jackClass.ts:205`). Sum = total streak seconds over the uniquely covered rows plus their note count (`jackClass.ts:173-181`).

## Stream class system

`src/custom/streamClass.ts`. Output: the STREAM panel `Class` and `Stamina` rows.

1. **Cadences** — row intervals are counted, then split greedily whenever the next interval exceeds 1.15× the running mean; clusters with fewer than 4 rows are dropped (`streamClass.ts:50-74`). The dominant cluster plus secondaries with ≥10 % share at effective BPM ≥60 are used (`streamClass.ts:31-32`, `streamClass.ts:89`); a cadence's effective BPM is `round(15000 / cadence_ms)` (`streamClass.ts:64`). Charts with fewer than 20 notes produce no class (`streamClass.ts:82`).
2. **Interval buckets** — per column, consecutive same-column hits spaced exactly k×C (±10 % tolerance, `streamClass.ts:28`) with every intervening beat occupied (`streamClass.ts:104-157`):

   | Bucket | Meaning |
   | --- | --- |
   | `interval(0)` | adjacent rows (jack content mixed in) |
   | `interval(1)` | 2C = 8th note, two-column trill |
   | `interval(2)` | 3C = dotted 8th, three-column cycle |
   | `interval(3)` | 4C = quarter note |
   | `interval(4+)` | wider gaps; open-ended (gap ≥ 4) |
   | `off-grid` | dt on no qualifying cadence grid (±10 %, bucket 5; dotted intervals, SV sections) |

3. **Tags** (`streamClass.ts:161-168`) — Jacky: `interval(0)` >1 %; Full: `interval(1)` ≥50 %; Dense: 45 ≤ `interval(1)` < 50 and `interval(1)`+`interval(2)` >80 %; Broken: 15 ≤ `interval(1)` < 30 %; Singles: `interval(1)` <15 %; Technical: `off-grid` ≥15 %.
4. **Row composition** on the dominant grid (`streamClass.ts:170-187`) — rows with ≥3 notes ≥5 % → `HS`, rows with ≥2 notes ≥10 % → `JS`, otherwise `SS`; the Singles tag forces `SS`.
5. **Class string** (`streamClass.ts:188-194`) — `{eff} {Full|Dense|Broken|Mid} (JS|HS|SS)[, Jacky][, Technical]`; `Full` + `SS` is displayed as `Running Man` (`streamClass.ts:193`).
6. **Stamina row** — maximum note count inside any sliding 10 s / 30 s window (`streamClass.ts:196-204`).

## Pattern system

The top row shows `{BPM} {dominant pattern}`. Grid tiers (`gridAnalysis.ts:556-559`):

| Grid notes | Pattern |
| --- | --- |
| ≤5 | Minijack |
| 6–7 | Low Chordjack |
| 8–10 | Mid Chordjack |
| ≥11 | High Chordjack |

Stream run classification by average notes per row (`gridAnalysis.ts:1374-1398`): Full ≥2.0, High ≥1.5, Mid >1.25, Low ≈1.25, High Stream ≥1.125, Single Stream below that; the handstream path uses max beat ≥3 with Full ≥1.75, High >1.5, Mid ≈1.5, Low ≥1.25.

Run-level density grade (`gridAnalysis.ts:1404-1418`): Single ≤1.125, Light ≤1.25, Mid ≤1.5, Dense <2.0, Full =2.0, Heavy >2.0 — displayed as `Mid (1.38)`.

Dominant pattern selection (`gridAnalysis.ts:1698-1806`):

- **Merge** — adjacent tiers only: Full→High→Mid→Low for both families, High→Mid→Low→Minijack for the jack family, plus the stream cascade (`gridAnalysis.ts:1706-1719`).
- **Effective BPM** — jack patterns count double (`gridAnalysis.ts:1758-1760`).
- **Tier priority** — HS > JS > CJ inside one tier (`gridAnalysis.ts:1761-1768`).
- **Adaptive N** — a candidate needs 30 merged cells when the raw BPM <150, 30 cells for non-jack patterns below 200 BPM, and 50 cells otherwise (`gridAnalysis.ts:1777-1781`). The first candidate in effective-BPM/tier order that meets N wins (`gridAnalysis.ts:1783`); without a candidate the fallback picks the highest-BPM group with the most cells (`gridAnalysis.ts:1786-1803`).
- **Share** — the winner's percentage is relative to the non-LN cells (`gridAnalysis.ts:1804-1806`); LN patterns never take the main slot (`gridAnalysis.ts:1720`).

## SV maps (per-cell timing)

Charts with scroll velocity changes resolve their timing point per cell instead of using the first global one: `getActiveTimingPoint` (`gridAnalysis.ts:124`), `getActiveBPM` (`gridAnalysis.ts:136`), `getActiveBeatLength` (`gridAnalysis.ts:145`), applied at the cell start (`gridAnalysis.ts:1523-1524`). The displayed BPM range comes from the cells' effective BPMs (`gridAnalysis.ts:1808-1813`), so sections at different tempos inside one chart keep their own BPM.

## Anchor / stamina analysis

`src/custom/anchorAnalysis.ts` measures single-finger (SF), single-hand (SH) and dual-hand (DH) stamina over 16th-note positions. The panel shows SH as `Sta L/R` and DH as `Sta DH`; SF is computed for calibration and never displayed.

Input is every note start plus every LN end, with no jack/stream filter, so stacked notes inside a hand neither break nor advance the chain twice: a chord row occupies one slot. The metric therefore measures a **continuous run of occupied 16th slots** — sustained presses, not alternating stream, and not the duration an LN is held (only its head and tail enter the grid).

- **SH** merges left hand (columns 0+1) and right hand (columns 2+3) (`anchorAnalysis.ts:188-193`): the hand must hold a hit on every 16th slot.
- **DH** merges four cross-hand column pairs — 0+2, 1+3, 1+2, 0+3 (`anchorAnalysis.ts:195-202`): the pair must hold a hit on every 16th slot. The centre pair (1+2) is the classic two-hand trill.
- **SF** segments are per column (`anchorAnalysis.ts:183-186`).

| Tier | Rule | Meaning |
| --- | --- | --- |
| P100 | bridge tolerance — a gap of ≤2 is bridged by 4 consecutive notes (`anchorAnalysis.ts:26-66`) | worst-case endurance |
| P90 | strict, consecutive only (`anchorAnalysis.ts:68-95`) | 90th percentile segment length |
| P50 | strict, consecutive only | median segment length |

- **BPM scaling** (`anchorAnalysis.ts:175-178`) — jack-type charts use base BPM for SF and 2× base for SH/DH; stream-type charts halve the SF BPM and use base for SH/DH. A chart's SH/DH values therefore depend on its dominant pattern.
- Values are measures; the panel shows `P100 / P90=v×n / P50=v×n`, with `—` where no segment qualifies (`display.ts:163-169`).

## Vibro detection

`src/custom/vibroAnalysis.ts`.

1. **bullet-4 detection** — same-column sequences of 4+ notes with a gap tolerance of `beatMs / 4 + 10` ms and trill awareness (`vibroAnalysis.ts:172-227`, called at `vibroAnalysis.ts:42`). The code keeps the name `findLian4`.
2. **SHFC classification** — per sequence, the column occupancy density `d` over the sequence grid decides the type (`vibroAnalysis.ts:77-85`): F when ≥4 columns reach 0.6, S when one column is dense and ≥3 columns stay ≤0.3, H when one hand pair is dense and the other is not, C otherwise.
3. **canVibro** — the same-hand neighbour column has to fill every other position of the sequence; the weight is `valid / total` (`vibroAnalysis.ts:87-99`).
4. **Verdict** (`vibroAnalysis.ts:113-125`) — `vibro` when the weighted canVibro rate >35 % at ≥150 BPM and at least one type qualifies: H with ≥5 sequences at >60 %, F with ≥10 at >50 %, C with ≥5 at >70 %, S with ≥5 at >50 %.
5. **Burst vs control** (`vibroAnalysis.ts:101-110`) — other-column offsets aligned to the sequence grid (<15 % or >85 % of the step) count as burst, offsets in the 35–65 % band as control; the panel shows the covered time of each.

The JACK panel shows the verdict and timing (`display.ts:368`); a `vibro` verdict replaces the dominant pattern in the top row (`display.ts:234-236`).

## Grace detection

`src/custom/techAnalysis.ts:125-226`.

- For a cell with a known subdivision, a gap counts as a grace when it is below 55 % of the cell's expected gap **and** below 50 ms (`techAnalysis.ts:129`, `techAnalysis.ts:180-188`).
- Cells with an unknown subdivision (`isGrace`) and the no-grid fallback use the absolute 50 ms rule (`techAnalysis.ts:130-131`, `techAnalysis.ts:190-198`).
- A grace must also come with a column change (`techAnalysis.ts:204-222`).

Related tech metrics:

- **dtCV** — coefficient of variation of the row spacing inside active sections (row gaps ≤1 s); 0.2–0.4 is even spacing, 0.6+ is bursty (`techAnalysis.ts:28-38`).
- **Interval** — 10th percentile of the same-column spacing, chords below 5 ms excluded, minimum over the four columns (`techAnalysis.ts:45-61`).
- **KPS** — P90 of the note counts in 500 ms windows over all notes (`techAnalysis.ts:120-122`, window helper `windowIndex.ts:16-28`).
- **Rolls / Trills** — same-direction runs and two-column alternations counted per subdivision (`techAnalysis.ts:265-399`).

## LN pool scores

`src/custom/lnAnalysis.ts`. Every component is a per-LN participation rate (share of the chart's LNs exhibiting the pattern), so all four pools share one denominator and stay comparable at the argmax (`lnAnalysis.ts:160-166`).

| Pool | Formula | Source |
| --- | --- | --- |
| CO — coordination | `0.5·ov + 0.2·i + 0.3·c` | `lnAnalysis.ts:228` |
| DE — density | `0.65·i + 0.2·ch + 0.15·tp` | `lnAnalysis.ts:229` |
| WC — wildcard | `0.45·wj + 0.45·ws + 0.1·s` | `lnAnalysis.ts:230` |
| TE — technical | `0.5·rel + 0.2·r + 0.15·s + 0.15·c` | `lnAnalysis.ts:231` |

Components: `ov` overlapping LN pairs (`lnAnalysis.ts:188`), `i` inverse LNs (`lnAnalysis.ts:183`), `c` LNs with ≥2 hits in the neighbouring column during their body (`lnAnalysis.ts:169-182`), `ch` multi-note LN heads (`lnAnalysis.ts:184`), `wj`/`ws` wc-jack and wc-speed head textures (`lnAnalysis.ts:185-186`), `tp` tap LNs (`lnAnalysis.ts:187`), `s` shields (`lnAnalysis.ts:168`), `rel` LNs in a staggered release group (`lnAnalysis.ts:195-205`), `r` async release pairs (`lnAnalysis.ts:206`).

The top row replaces the dominant pattern with the winning pool name when the chart's LN ratio is ≥15 % and the winning pool scores at least 15 points (`display.ts:69`, `display.ts:72-84`, `display.ts:238`). The scores express relative probability between the pools, not difficulty.

## Hand bias

- **Finger** — `4 × max column peak density ÷ both-hands peak density`; 1.0 is balanced, 4.0 is everything in one column (`jackAnalysis.ts:147-153`).
- **Hand** — `2 × max hand peak density ÷ both-hands peak density`; 1.0 is balanced, 2.0 is everything in one hand (`jackAnalysis.ts:156-163`).
- **Imbalance** — `2·max(side) / (L+R)`; 1.0 is balanced, 2.0 is fully one-sided (`jackAnalysis.ts:171-174`). The jack variant measures over 16-row (4-cell) and 64-row (16-cell) windows and averages the top 25 % of the windows (`jackAnalysis.ts:204-243`); the stream variant uses the same construction but counts only non-jack rows (`streamAnalysis.ts:104-188`).
- **Direction** — `L` (left-dominant), `R` (right-dominant), `S` (switching).

## Mod handling

`src/tosu/mods.ts`, applied in `src/index.ts:135-145`.

- **Speed** — the tosu `rate` field wins, then lazer `speed_change`, then the mod codes (DT/NC = 1.5, HT/DC = 0.75) (`mods.ts:185-191`). Time-based metrics scale with the speed rate; the pattern stage runs on the speed-scaled beat length, so the displayed BPM is the effective one.
- **OD** — HR and EZ are detected as `odFlag` (`mods.ts:192-195`).
- **Conversion** — IN takes precedence over HO (`mods.ts:197-200`); the parser is re-run on the converted chart so every stage sees it (`analyzer.ts:271-284`).
- **Signature** — `speedRate | odFlag | cvtFlag` (`mods.ts:210`); any change re-triggers the analysis (`index.ts:70`).

## Performance and limits

- Pre-cached `_notes` and `_rowNotes` per grid cell avoid repeated range scans (`gridAnalysis.ts:1532-1539`).
- Density uses one shared two-pointer window index, O(n) per window sweep (`windowIndex.ts:16-27`, `density.ts:8-27`).
- LN overlap detection is a sweep-line, O(n log n) (`lnAnalysis.ts:61-65`).
- Boundary lookups use `lowerBound` / `upperBound` binary searches (`gridAnalysis.ts:1885-1889`, `lnAnalysis.ts:179`, `vibroAnalysis.ts:68-69`).
- Run and interval extraction in the jack and switch class scanners is single-pass per qualifying cadence (`jackClass.ts:119-151`, `gridAnalysis.ts:1891-1903`).
- Heavy-map guards: charts above 30000 notes are rejected before the fetch (`index.ts:117`) and inside the analyzer (`analyzer.ts:32`, `analyzer.ts:311`); charts above 15000 LNs are rejected too (`analyzer.ts:33`, `analyzer.ts:328`); above 15000 notes the pattern-clustering stage is skipped while Sunny, grid and custom metrics still run (`analyzer.ts:39`, `analyzer.ts:374-382`).
- Analysis results are cached in an LRU of 50 entries keyed by `md5|modSignature`, in memory only and cleared on overlay reload (`index.ts:30-34`, `resultCache.ts:29-59`).

## wds0-like markers

`src/custom/wdsMarker.ts` computes the `XY-Jack` / `XY-Stream` / `XY-Speed` markers shown in the JACK and STREAM panels, following the **wds0 Dan** system by chart author wds0 (see the [glossary](glossary.md#wds0-like) for the bilingual term table): rows are built from the chart (`wdsMarker.ts:42-52`), the dominant cadence is measured (`wdsMarker.ts:55-70`), and the chart is split into sections for the density/manip letters (`wdsMarker.ts:72-82`, `wdsMarker.ts:109`).

| Axis | Marker | Density letter | Manip letter |
| --- | --- | --- | --- |
| Jack | `XY-Jack[-W]` | jack-pool P90: S <8 / M <10 / L <12 / H ≥12 | chain-A delta against a spike-min baseline: F <0.005 / R in between / P >0.01 (A >1.11 falls back to the A thresholds 1.10 / 1.09); 3+ note rows ≥20 % force R plus `-W` (Gluts) |
| Stream | `XY-Stream` | stream-pool P90: B <4.75 / S <6 / M <7 / L <7.5 / H ≥7.5 | chain A against the PDF thresholds: F ≥1.11 / R ≥1.10 / P <1.10 |
| Speed | `XY-Speed[-T\|-W]` | stream-section P50 ×2: S <8+1/256 / M <8.5 / L <9.5; ≥9.5 prefixes `O` and drops the F/R/P letter | per-section bullet count: F ≤1/16 / R ≤1 / P ≤3 / P >3; suffixes `T` (twist, >3) and `W` (constructed, ≤1/16 with A <1.115) |

Chart family: lock1 ≥10 % marks a main-jack chart, whose jack pool is the whole chart; a main-stream chart uses the whole chart as its stream pool. Section-level extraction (same-column repeats ≤2C at ≥12 %) feeds the cross-family axes only.
