# osumania-estimator v4.0.3

A tosu overlay plugin for osu!mania 4K key pattern analysis and difficulty estimation.

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

Shows the effective BPM and dominant pattern type. On vibro maps detected by the built-in vibro analyzer, displays "VIBRO" in red with the dominant subtype (Single/Hand/Full/Common). BPM is `rawBPM * division / 4 * speedRate`. For SV maps with multiple BPM zones, per-cell active timing point lookup provides accurate BPM per segment.

#### Sunny (second line)

Sunny Rework star rating. If the algorithm returns below 0.01, a density-based estimate is shown.

#### Pattern Breakdown Bars

Up to 4 bars. Bar width = pattern amount / max amount. Types include: Stream, JumpStream, HandStream, MiniJacks, ChordJacks, LongJacks, MiniTrills, Rolls, Trills, SplitTrill, JumpTrill, ColumnLock, Shield, Release, Inverse, Inversi, Doublestep, Anchor.

#### Structure Grid

Cards summarizing each detected pattern cluster: BPM, cell count, density metrics, and segment distribution. Hidden by default in Simple mode. Key type names use full form (e.g. "Mid Chordjack @ 150 BPM").

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

| Field        | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| Ratio        | `60% (45%)` — all LN / excluding Tap LN                                              |
| Overlay      | `585 (12%)` — overlapping LN pairs / % of total LN (sweep-line O(n log n))           |
| Tap LN       | Short LNs (<=16th note)                                                              |
| Shield/R     | `12/8` — Shield (normal→LN head) / Reversed Shield (LN tail→normal)                  |
| ColLock      | Held LN + adjacent column hits >= 2 at 90+ BPM within 3 beats                        |
| A/R          | `62/15` — Attack (different start, same tail) / Release (same start, different tail) |
| Inverse      | Alternating LN tail→head with consistent gaps (>=2 col bodies)                       |
| Ouroboros    | LN tail→head gap < 21ms chain                                                       |
| LN Tree      | 3+ LNs on different cols with staggered ends within 0.25 beats                       |
| Pool (CO/DE) | LN Coordination / Density pool scores from Sunny Rework components                   |
| Pool (WC/TE) | LN Wildcard / Technical pool scores                                                  |

#### JACK Panel

| Field   | Meaning                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| Grade   | A4 tiers: Mini (≤5) / Low CJ (6-7) / Mid CJ (8-10) / High CJ (≥11). Values: P90/P50 |
| Anchor  | SF (Single Finger) stamina — `P100 / P90=v×n / P50=v×n` in measures            |
| Finger  | Max per-column density / max both-hands (1.0 balanced, >1.5 biased)            |
| Hand    | Max(left,right) peak density / max both-hands (1.0 balanced, >1.5 biased)      |
| Imbal   | 16-row / 64-row / overall hand imbalance. Direction label: L/R/S                |
| Vibro   | 连4 + canVibro SHFC classification. Display: "VIBRO {Single/Hand/Full/Common}"  |

#### STREAM Panel

| Field   | Meaning                                                                 |
| ------- | ----------------------------------------------------------------------- |
| Type    | Stream / JumpStream / HandStream / mixed                                |
| Grade   | Single(≤4) / Light(5) / Mid(6) / Dense(8) / Heavy(9+). P90/P50         |
| Imbal   | 16-row / 64-row / overall hand imbalance. Direction label: L/R/S        |
| Brk2r   | Broken stream: max/median notes in any 2-row window                     |
| Sta L/R | SH (Single Hand) stamina — `P100 / P90=v×n / P50=v×n`                   |
| Sta Alt | DH (Dual Hand) stamina — `P100 / P90=v×n / P50=v×n`                     |

#### TECH Panel

| Field  | Meaning                                            |
| ------ | -------------------------------------------------- |
| 1f KPS | Single-finger max KPS (500ms window)               |
| 1h KPS | One-hand max KPS                                   |
| 2h KPS | Both-hands max KPS                                 |
| Graces | Grace/flam count (cell-aware, excludes legitimate 48th-note streams) |
| Rolls  | Max consecutive length per division (e.g. "24x16") |
| Trills | Total count per division                           |

#### STAMINA Panel

| Field   | Meaning                                      |
| ------- | -------------------------------------------- |
| Max     | P95 density x longest stretch above P75      |
| Med     | P50 density x longest stretch above P50      |
| Med tot | Total time above P50                         |
| Ratio   | % of map above P50                           |
| Switch  | Max jack/stream transitions in a 16-beat window + descriptor (Steady/Mixed/Rhythmic/Intense) |

The switch metric is computed over uneven rows clustered from actual note timestamps (not a fixed grid); consecutive rows sharing any column count as a jack pair, same-type pairs merge into runs, and the score is the maximum run-type transitions inside a sliding 16-beat window. LN heads participate as single notes at their start time. Descriptors: Steady ≤15, Mixed ≤25, Rhythmic ≤35, Intense >35. Low values = sustained single-mode sections (pure stream/jumpstream/jack); high values = frequent stable switching (minijack-style maps).

## Technical Notes

### Architecture (v4.0.3)

The analysis pipeline is decomposed into focused modules:

```
                             analyzer.ts (pipeline orchestrator)
                             ┌──────────────────────────────────────┐
                             │ parse → Sunny → patterns → grid →    │
                             │   section → custom → aggregate       │
                             └──────┬───────────────┬───────────────┘
                                    │               │
          sectionAnalysis.ts        │    gridAnalysis.ts         vibroAnalysis.ts
   ┌─────────────────────┐         │   ┌─────────────────────┐   ┌───────────────────┐
   │ Beat-grid slicing   │──┬──────│───│ Cell-level subclass │   │ 连4 detection     │
   │ Segment aggregation │  │      │   │ Pattern class.      │   │ SHFC classification│
   │ Cross-segment stats │  │      │   │ Jack/stream detect  │   │ canVibro algorithm │
   │ Summary reports     │  │      │   │ LN metrics          │   │ Verdict engine     │
   └─────────────────────┘  │      │   │ Grace/flam detect   │   └───────────────────┘
                            │      │   │ Cross-cell jack     │
                            │      │   │ Key type (A4 tiers) │
                            │      │   │ Vibro label         │
                            │      │   └─────────────────────┘
                            │      │
              lnAnalysis.ts │      ├── Per-cell timing lookup:
   ┌──────────────────────┐ │      │   getActiveTimingPoint(time)
   │ LN metrics           │ │      │   → correct BPM for SV maps
   │ Pool scores (CO/DE/  │ │      │     with multiple BPM zones
   │   WC/TE)             │ │      │
   │ Release difficulty   │ │      └── Grade helpers:
   └──────────────────────┘ │          gradeJack(), gradeStream()
                            │
        anchorAnalysis.ts   │
   ┌──────────────────────┐ │
   │ SF/SH/DH stamina     │ │
   │ Bridge/P100 tolerance│ │
   │ Strict P90/P50       │ │
   └──────────────────────┘ │
                            │
   jackAnalysis.ts          │    streamAnalysis.ts
   ┌──────────────────────┐ │    ┌──────────────────────┐
   │ Jack-specific metrics│ │    │ Stream classification│
   │ Finger/Hand pressure │ │    │ Grade / Imbalance    │
   │ Hand bias (L/R/S)   │ │    │ Broken stream        │
   └──────────────────────┘ │    │ Hand bias (L/R/S)    │
                            │    └──────────────────────┘
                            │
                     ┌──────┴──────────┐
                     │  customMetrics   │
                     │  (aggregator)    │
                     └─────────────────┘
```

### Division-Based Grid

The map is divided into a beat grid where each cell spans one row (4 notes in 4K). Each cell is classified by:

- **Subdivision**: how many notes per beat (denom 2, 4, 6, 8, 12, etc.)
- **Pattern**: detected via column analysis (jack, chord, trill, roll, etc.)
- **Category**: stream (<=2 cols/row), jack (same-col density), LN, break
- **Effective BPM**: `cellRawBPM * denom / 4 * speedRate`

### Switch Metric (gridSwitch)

The switch metric measures how frequently the map alternates between jack-type and stream-type rows, distinguishing sustained single-mode sections (pure stream / jumpstream) from frequent stable switching (chordjack-style maps).

1. **Uneven rows**: All rice notes (LN heads included as single notes at their start time) are clustered into rows by actual timestamps (≤8ms apart merge into one row) — not a fixed grid.
2. **J/S pairing**: Consecutive rows sharing any column → J (jack), otherwise S (stream). Lenient: single-column jacks and chord overlaps both count.
3. **Runs**: Consecutive same-type pairs merge into runs.
4. **Sliding window**: A 16-beat window (16 × beatLength) slides across the map; `gridSwitch` = max run-type transitions inside any window.

Descriptor thresholds: **Steady** ≤15, **Mixed** ≤25, **Rhythmic** ≤35, **Intense** >35. Displayed in the STAMINA panel as `Switch` (e.g. `54 (Intense)`).

### Key Type System (A4 tiers)

Segments are classified into 5 tiers based on 4×4 grid total notes:

| Tier    | Grid Notes | Type                 |
| ------- | ---------- | -------------------- |
| Mini    | ≤5         | Minijack             |
| Low     | 6-7        | Low Chordjack        |
| Mid     | 8-10       | Mid Chordjack        |
| High    | ≥11        | High Chordjack       |
| SS      | —          | Single/Stream hybrid |

Main type selection uses BPM grouping (effBPM matching at double speed for jack→stream correlation), adjacent-level merge (Full→High→Mid→Low→Minijack), and adaptive N (raw BPM <150 or stream <200 → N=30, else N=50). Tier-based priority: High > Mid > Low > SS, with HS > JS within tier.

### SV Map Support (Per-Cell Timing)

Maps with scroll velocity changes (multiple uninherited timing points at different BPMs) no longer use only the first global timing point. Each grid cell looks up the active timing point at its start time:

| Function                  | Purpose                              |
| ------------------------- | ------------------------------------ |
| `getActiveTimingPoint()`  | Find the timing point active at `t`  |
| `getActiveBPM()`          | BPM from the active timing point     |
| `getActiveBeatLength()`   | Beat length from the active timing point |

This ensures accurate BPM assignment for sections at different tempos within the same map.

### Anchor / Stamina Analysis

Measures single-finger (SF), single-hand (SH), and dual-hand (DH) stamina by detecting consecutive-note segments in 16th-note positions:

| Tier | Tolerance | Description |
|------|-----------|-------------|
| **P100** | Bridge (gap≤2 bridged by 4 consecutive notes) | Worst-case endurance |
| **P90** | Strict (consecutive only) | 90th percentile segment length |
| **P50** | Strict (consecutive only) | Median segment length |

Display format: `P100 / P90=v×n / P50=v×n` (values in measures, `—` = no qualifying segment).

**SF** segments are per-column. **SH** segments merge left-hand (cols 0+1) and right-hand (cols 2+3). **DH** segments merge four paired column combinations (0+2, 1+3, 1+2, 0+3).

BPM scaling: jack-type maps use base BPM for SF and 2× base for SH/DH; stream-type maps halve SF BPM and use base for SH/DH.

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

### Vibro Detection

Custom-built vibro analyzer replacing the former Etterna MinaCalc-based detection:

1. **连4 detection**: Finds same-column 4+ note sequences with trill-aware gap tolerance
2. **SHFC classification**: Each sequence classified as Single / Hand / Full / Common based on column occupancy density
3. **canVibro validation**: Per-type adjacency check using column pattern analysis with anti-mash filtering and complex split handling
4. **Verdict**: "vibro" when weighted canVibro rate > 35% at ≥150 BPM with per-type qualifying thresholds

Vibro verdict and dominant subtype (Single/Hand/Full/Common) are displayed in the JACK panel as `VIBRO {type} ({cvRate}%)`.

### Grace Detection (Cell-Aware)

Grace/flam detection now uses per-cell subdivision context. For cells with known subdivision, only gaps below 55% of the expected interval AND below 50ms are flagged, preventing legitimate 48th-note streams from being counted as graces. Null-subdivision cells and no-grid fallback retain the original 50ms absolute threshold.

### LN Pool Scores

LN metrics include four pool scores derived from Sunny Rework components:

| Pool | Component | Description |
| ---- | --------- | ----------- |
| CO   | Coordination | AJ1/AJ2-based LN coordination difficulty |
| DE   | Density      | DJ/RJ-based LN density/overlay difficulty |
| WC   | Wildcard     | Speed/jack-based hybrid LN difficulty |
| TE   | Technical    | Shield/release-based LN technical difficulty |

### Hand Bias

Hand bias metrics use a unified 1.0-balanced scale with directional labels:
- **Finger**: `4 * maxCol / bothHands` (1.0 balanced, >1.5 biased)
- **Hand**: `2 * maxHand / bothHands` (1.0 balanced, >1.5 biased)
- **Imbalance**: `2 * max/sum` (1.0 balanced, 2.0 = one-sided)
- **Direction**: L (left-dominant), R (right-dominant), S (switching)

Jack imbalance uses 16r/64r windows; stream imbalance excludes jack rows.

### Algorithm Layers

- **Sunny Rework** — 6 strain components, weighted percentile aggregation, LN pool scores
- **Grid Analysis** — Beat-grid cell classification, A4 tier key type system, BPM-first main selection
- **Pattern Detection** — Interlude sliding-window, 6 core + 22+ specific patterns
- **Custom Metrics** — Beat-grid density, speed, stamina, tech analysis, anchor (SF/SH/DH) analysis, hand bias, LN pools
- **Vibro Detection** — Custom 连4 + SHFC + canVibro pipeline (no external dependency)

### MOD Support

DT/NC (1.5x), HT/DC (0.75x), lazer custom rates.

> Notice: MODs could NOT be effective once you toggled then since tosu didn't send any signal, this could be a bug, you should refresh manually by switching maps.

### Performance

Analysis pipeline optimized for sub-second execution on most maps:

- Pre-cached `_notes` / `_rowNotes` in grid cells to eliminate repeated `getNotesInRange` calls
- Sweep-line O(n log n) LN overlap detection (was O(n²))
- End-time grouping O(k) A/R detection
- `lowerBound` binary search for boundary lookups
- Heavy map guard at 30000 notes; heavy LN guard at 15000 LNs

### Build & Test

```bash
npm install && npm run build     # esbuild → dist/index.js
npm run typecheck                # TypeScript type checking
npm test                         # Vitest suite
```

Output: `deploy/osumania-estimator by Akuta Zehy/`

Test maps are in `maps/` (10 dan packs + SV test maps). Test scripts in `scripts/` and test suites in `test/`.

### Acknowledgments

- [Sunny Rework](https://github.com/sunnyxxy/Star-Rating-Rebirth)
- [osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser)
- [Interlude](https://github.com/YAVSRG/YAVSRG)
- [Etterna](https://github.com/etternagame/etterna)
- [tosu](https://tosu.app/)
