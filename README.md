# osumania-estimator v3.0.0

A tosu overlay plugin for osu!mania 4K key pattern analysis, difficulty estimation, and LN pool type classification.

By Akuta Zehy.

## Deployment

Copy the entire `osumania-estimator by Akuta Zehy` folder into tosu's `static/` directory. Restart tosu or reload overlays.

## Interface

### View Mode (Settings)

Configured via tosu settings panel. `settings.json` provides two view modes:

| Mode     | Description                                                  |
| -------- | ------------------------------------------------------------ |
| Simple   | Section bar timeline only (compact, suitable during gameplay) |
| Detailed | Full structure grid + segment table + metrics panels         |

### In-Game Bar (gameplay overlay)

```
+-------------------------------------------------------------+
| [=======-----------------] Mid Jumpstream   160 BPM          |
| 4/4 measures: 48 | time: 01:23.456 | density: 7.2 nps       |
+-------------------------------------------------------------+
```

Shown during active gameplay. Displays a horizontal progress track of the current section, the active pattern label/subtype, elapsed measures/time, and real-time density.

### Section Bar (timeline)

```
< 4s    8s    12s   16s   20s   24s   28s   32s   36s   40s   >
| js--- | hs-- | tech | js--- | jk-- | -----break----- | js--- |
                                                           ^
                                                    playhead
```

Color-coded measure-by-measure timeline showing pattern type per measure. Playhead tracks current position during gameplay.

### Detailed View (card — lobby/result screen)

```
+----------------------------------------------------------+
| Artist - Title [Difficulty]                               |
+----------------------------------------------------------+
|               160 Mid Jumpstream                          |
|            Sunny: 4.51                                    |
+----------------------------------------------------------+
|        270 BPM          LN 5%                            |
+----------------------------------------------------------+
|  JumpStream  [=======]          180  (23%)               |
|  MiniJacks   [===]               90  (15%)               |
|  HandStream  [=]                180  (8%)                |
+----------------------------------------------------------+
| ▸ Structure Grid (pattern detail cards)                   |
| +-----------------------+  +----------------------------+ |
| | Mid Jumpstream  160   |  | Minijack  136              | |
| | 126 cells (23%)       |  | 48 cells (8.7%)            | |
| | ───────────────────── |  | ────────────────────────── | |
| | Avg density  6.8 nps  |  | Avg density  4.2 nps       | |
| | Avg density  6.8 nps  |  | Avg density  4.2 nps       | |
| +-----------------------+  +----------------------------+ |
+----------------------------------------------------------+
| ▸ Segment Table                                            |
| SEGMENTS                                                  |
| #  Type          BPM   Cells  Category  GridNotes  Len    |
| 1  Mid Jumpstr.  160   24     stream    96         8s     |
| 2  Minijack      136   12     jack      24         4s     |
| 3  High Jmpstr.  160   18     stream    72         6s     |
+----------------------------------------------------------+
| ▸ Metrics Panels                                           |
| +----------------------+--------------------------------+ |
| | BPM / DENSITY       | LONG NOTE                      | |
| | JACK                | STREAM                         | |
| | TECH                | STAMINA                        | |
| +----------------------+--------------------------------+ |
+----------------------------------------------------------+
```

### Element Descriptions

#### Main Display (top line)

Shows the effective BPM and dominant pattern type. On vibro maps detected by Etterna, displays "VIBRO" in red. BPM is `rawBPM * division / 4 * speedRate`. For SV maps with multiple BPM zones, per-cell active timing point lookup provides accurate BPM per segment.

#### Sunny (second line)

Sunny Rework star rating. If the algorithm returns below 0.01, a density-based estimate is shown.

#### Pattern Breakdown Bars

Up to 8 bars. Bar width = pattern amount / max amount. For LN segments, the main display BPM is replaced by the pool type (CO/DE/WC/TE). Appended "(Jacky)" or "(Speedy)" for WC pool.
Types include: Stream, JumpStream, HandStream, Shield, Timing Hell, LN Inverse, JS Density, HS Density, Density, Speedy WC, Jacky WC.

#### Structure Grid

Cards summarizing each detected pattern cluster: BPM, cell count, density metrics, and segment distribution. Hidden by default in Simple mode.

#### Segment Table

Detailed row-level breakdown of every segment: type, BPM, cell count, category (stream/jack/LN), grid note total, and duration. Hidden by default in Simple mode.

#### BPM / DENSITY Panel

| Field | Meaning                                                 |
| ----- | ------------------------------------------------------- |
| BPM   | Speed-adjusted BPM (`rawBPM * speedRate`)               |
| Both  | Both-hands max/median density (notes per 1000ms window) |
| L/R   | Left hand vs right hand peak density                    |
| Cols  | Per-column peak density                                 |

#### LONG NOTE Panel

Shown when LN ratio > 1% or patterns detected.

| Field    | Meaning                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Ratio    | `60% (45%)` — all LN / excluding Tap LN                                              |
| Overlap  | `552 (55%)` — LN body overlap pairs / % of total LN                                  |
| Tap LN   | Short LNs (<=16th note)                                                              |
| P-Score  | `CO 22.3 · DE 25.0 · WC 27.1 · TE 26.8` — 4 LN pool normalized density scores       |

**Pool Score Interpretation:**

| Pool | Full Name | Definition |
|------|-----------|-----------|
| **CO** | Coordination | Low-speed complex release, shield, column lock. "Disorientate your finger." |
| **DE** | Density | Sustained walls and inverse. Endurance-oriented, simple but physically demanding. |
| **WC** | Wildcard | Mixed LN+RC patterns. Jacky (jack-like when LN→RC) or Speedy (stream-like). |
| **TE** | Technical | High technicality, volatile release, dump, grace. Hard to read and hit accurately. |

#### JACK Panel

| Field   | Meaning                                                            |
| ------- | ------------------------------------------------------------------ |
| Grade   | Mini (<=4) / Low (5-7) / Mid (8-11) / Dense (12+). Values: P90/P50 |
| Anchors | 3+ consecutive same-column notes, gap <= 2x per-row beat length    |
| Finger  | Max per-column density / max both-hands (0-1)                      |
| Hand    | Max(left,right) peak density / max both-hands (0-1)                |
| Imbal   | 4-row / 16-row / overall hand imbalance                            |
| Vibro   | "ETT" when Etterna JackSpeed/Overall >= 0.95                       |

#### STREAM Panel

| Field | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| Type  | Stream / JumpStream / HandStream / mixed                        |
| Grade | Single(<=4) / Light(5) / Mid(6) / Dense(8) / Heavy(9+). P90/P50 |
| Imbal | 4-row / 16-row / overall hand imbalance                         |
| Brk2r | Broken stream: max/median notes in any 2-row window             |

#### TECH Panel

| Field  | Meaning                                            |
| ------ | -------------------------------------------------- |
| 1f KPS | Single-finger max KPS (500ms window)               |
| 1h KPS | One-hand max KPS                                   |
| 2h KPS | Both-hands max KPS                                 |
| Graces | Grace/flam count (< 50ms adjacent-column gap)      |
| Rolls  | Max consecutive length per division (e.g. "24x16") |
| Trills | Total count per division                           |

#### STAMINA Panel

| Field   | Meaning                                      |
| ------- | -------------------------------------------- |
| Max     | P95 density x longest stretch above P75      |
| Med     | P50 density x longest stretch above P50      |
| Med tot | Total time above P50                         |
| Ratio   | % of map above P50                           |
| Switch  | Max jack/stream transitions in 16-row window |

## Technical Notes

### Architecture (v3.0.0 — LN Pool Classification)

The analysis pipeline has three parallel detection paths for LN patterns:

```
sectionAnalysis.ts       gridAnalysis.ts          patterns/ (Interlude)
┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐
│ Beat-grid slicing│    │ Cell subdivision │    │ 10 LN detectors       │
│ Measure metrics  │    │ LN subtype class │    │ (sliding window)      │
│ LN subtype dist  │    │ (classifyLNCell) │    │ → _lnCounts           │
└──────────────────┘    └──────────────────┘    └───────────────────────┘
         │                       │                        │
         └───────────┬───────────┴────────────┬───────────┘
                     │                        │
               Pattern Bars              Pool Scores (lnAnalysis.ts)
               (gridAnalysis)            → CO/DE/WC/TE
               + Title Display
```

**Pool score weighting** (each normalized by total notes):

```
CO = overlaps × 0.7 + inverses% × 0.3
DE = inverses% × 0.6 + lnChords% × 1.0 + tapLN% × 0.5
WC = shields% × 0.5 + colLocks% × 0.5 + wcJacks% × 1.0 + wcSpeeds% × 1.0
TE = overlaps × 0.3 + shields% × 0.5 + colLocks% × 0.5 + tapLN% × 0.5
```

### Division-Based Grid

The map is divided into a beat grid where each cell spans one row (4 notes in 4K). Each cell is classified by:

- **Subdivision**: how many notes per beat (denom 2, 4, 6, 8, etc.)
- **Pattern**: detected via column analysis (jack, chord, trill, roll, etc.)
- **Category**: stream (<=2 cols/row), jack (same-col density), LN, break
- **Effective BPM**: `cellRawBPM * denom / 4 * speedRate`

### SV Map Support (Per-Cell Timing)

Maps with scroll velocity changes (multiple uninherited timing points at different BPMs) no longer use only the first global timing point. Each grid cell looks up the active timing point at its start time:

| Function                  | Purpose                              |
| ------------------------- | ------------------------------------ |
| `getActiveTimingPoint()`  | Find the timing point active at `t`  |
| `getActiveBPM()`          | BPM from the active timing point     |
| `getActiveBeatLength()`   | Beat length from the active timing point |

This ensures accurate BPM assignment for sections at different tempos within the same map.

### Division ↔ BPM Mapping

| Div  | Type  | Effective BPM formula |
| ---- | ----- | --------------------- |
| 1    | 4th   | `cellBPM / 4`         |
| 2    | 8th   | `cellBPM / 2`         |
| 3    | 12th  | `cellBPM * 3/4`       |
| 4    | 16th  | `cellBPM`             |
| 6    | 24th  | `cellBPM * 1.5`       |
| 8    | 32nd  | `cellBPM * 2`         |
| >9.5 | 48th+ | grace (flam/anchor) category |

### Algorithm Layers

- **Sunny Rework** — 6 strain components, weighted percentile aggregation
- **Grid Analysis** — Beat-grid cell classification, subdivision detection, jack/stream/LN pattern recognition
- **LN Pool Classification (v3.0.0)** — 5 core categories (Stream/Chord/Jack/LN/Grace). 10 LN-specific detectors (Shield, ReversedShield, Overlap, ColumnLock, Ouroboros, Inverse, WC_Jack, WC_Speed, LN_Chord, LN_Stream). Pool scores aggregate into CO/DE/WC/TE.
- **Custom Metrics** — Beat-grid density, speed, stamina, tech analysis
- **Etterna Vibro** — MinaCalc v0.72.3 WASM, JackSpeed/Overall >= 0.95

### MOD Support

DT/NC (1.5x), HT/DC (0.75x), lazer custom rates.

> Notice: MODs could NOT be effective once you toggled then since tosu didn't send any signal, this could be a bug, you should refresh manually by switching maps.

### Build & Test

```bash
npm install && npm run build     # esbuild → dist/index.js
npm run typecheck                # TypeScript type checking
npm test                         # Vitest suite
```

Output: `deploy/osumania-estimator by Akuta Zehy/`

Test maps are in `maps/` (4K LN Dan Courses — 16 maps, Stage 1-4 × 5th-8th). Test scripts in `scripts/` and test suites in `test/`.

### v3.0.0 Changes

- **LN Pool Classification**: Introduced 4 LN pool types (CO/DE/WC/TE) based on weighted pattern density scores. Title displays dominant pool (e.g., "175 Wildcard") with optional "(Jacky)" / "(Speedy)" annotation.
- **Pattern Detection Restructure**: Merged old Coordination/Density/Wildcard into unified LN category. 10 LN-specific detectors with fixed 83ms time window.
- **LONG NOTE Panel Simplified**: Removed per-pattern counters. Shows Ratio, Overlap, Tap LN, and P-Score (4 pool density values).
- **ColumnLock/Shield refined**: Window-based Interlude detection for pattern bars; per-LN counting for pool scores.
- **Ouroboros detection fixed**: T→H chain detection within 2 rows, any column, gap < 21ms.

### Acknowledgments

- [Sunny Rework](https://github.com/sunnyxxy/Star-Rating-Rebirth)
- [osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser)
- [Interlude](https://github.com/YAVSRG/YAVSRG)
- [Etterna](https://github.com/etternagame/etterna)
- [tosu](https://tosu.app/)
