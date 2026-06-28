# osumania-estimator

A tosu overlay plugin for osu!mania 4K key pattern analysis and difficulty estimation.

By Akuta Zehy.

## Deployment

Copy the entire `osumania-estimator by Akuta Zehy` folder into tosu's `static/` directory. Restart tosu or reload overlays.

## Interface Layout

```
+--------------------------------------------------+
| Artist - Title [Difficulty]                       |  Status bar (map info or connection state)
+--------------------------------------------------+
|               180 JumpStream                      |  Main display: effective BPM + dominant pattern type
|            Sunny: 4.51                            |  Sunny Rework star rating (density fallback if Sunny fails)
+--------------------------------------------------+
|        180 BPM          LN 5%                    |  Raw BPM from timing points / Long note ratio
+--------------------------------------------------+
|  JumpStream  [=======]          180              |  Pattern breakdown bars (top 4 pattern clusters)
|  MiniJacks   [===]               90              |  Each shows: type + amount bar + effective BPM
|  HandStream  [=]                180              |
+----------------------+---------------------------+
|  BPM / DENSITY       |  LONG NOTE                |
|  BPM         180     |  Ratio        5%          |
|  Both    max12/med6  |  Shields      0           |
|  L/R      8/5        |  ColLock      0           |
|  Cols    4|4|3|3     |  Inverse      0           |
+----------------------+---------------------------+
|  JACK                |  STREAM                   |
|  Grade   Mid (7.3/4) |  Type    JumpStream       |
|  Anchors       2     |  Grade   Mid (6.0/3)      |
|  Finger      0.75    |  Imbal   0.3/0.2/0.1     |
|  Hand        0.85    |  Brk2r   8.0/4.0         |
|  Imbal   0.3/0.2/0.1 |                           |
+----------------------+---------------------------+
|  TECH                |  STAMINA                  |
|  1f KPS      8.2     |  Max     8.0x16.0s        |
|  1h KPS     14.5     |  Med     6.0x32.0s        |
|  2h KPS     22.0     |  Med tot     45.2s        |
|  Graces       5      |  Ratio        38%         |
|  Rolls  24x16 16x4   |  Switch        3          |
|  Trills 24x8  16x12  |                           |
+----------------------+---------------------------+
```

## Element Descriptions

### Main Display (top line)

Shows the effective BPM and dominant pattern type of the beatmap's primary speed cluster.

- The BPM is calculated as `rawBPM * division / 4`, normalized to 16th-note speed.
- The pattern type comes from the most dominant pattern cluster's specific subtype (e.g., JumpStream, MiniJacks, HandStream).

### Sunny (second line)

Sunny Rework star rating. If the Sunny algorithm returns a value below 0.01 (algorithm failure), a density-based estimate is shown instead, marked with "(est)".

### Pattern Breakdown Bars

Up to 4 bars showing detected pattern types with their relative time proportions.

- Bar width = pattern amount / maximum pattern amount (largest bar = 100%).
- The number on the right is the effective BPM for that pattern cluster.
- Pattern types include: Stream, JumpStream, HandStream, MiniJacks, ChordJacks, LongJacks, MiniTrills, Rolls, Trills, SplitTrill, JumpTrill, ColumnLock, Shield, Release, Inverse, etc.

### BPM / DENSITY Panel

| Field | Meaning                                                            |
| ----- | ------------------------------------------------------------------ | ----- | ----- | ------ |
| BPM   | Raw BPM from the first uninherited timing point                    |
| Both  | Both-hands density: max and median notes per 1000ms sliding window |
| L/R   | Left hand (cols 0-1) vs right hand (cols 2-3) peak density         |
| Cols  | Per-column peak density (col 0                                     | col 1 | col 2 | col 3) |

### LONG NOTE Panel

Only shown when the map has long notes (LN ratio > 1%) or detected LN patterns.

| Field   | Meaning                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Ratio   | Percentage of notes that are long notes                                                                |
| Shields | Count of Shield patterns (normal note immediately followed by LN head on same column, within 1/4 beat) |
| ColLock | Count of Column Lock patterns (adjacent same-hand hits >= 3 at 90+ BPM while LN held)                  |
| Inverse | Count of Inverse patterns (alternating LN releases with consistent gap timing)                         |

### JACK Panel

| Field   | Meaning                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Grade   | Jack density grade and values. Mini (<=4), Low (5-7), Mid (8-11), Dense (12+). Values: P90 peak density / P50 median density |
| Anchors | Number of anchor patterns detected (3+ consecutive same-column notes at jack-like speed, time gap <= 2x beat length)         |
| Finger  | Single-finger pressure: max per-column density / max both-hands density (0-1)                                                |
| Hand    | Single-hand pressure: max(left, right) peak density / max both-hands density (0-1)                                           |
| Imbal   | Multi-scale hand imbalance: 4-row window / 16-row window / overall. "bias" if only one hand has jack notes.                  |

### STREAM Panel

| Field | Meaning                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type  | Stream classification: Stream (single notes), JumpStream (2-note chords), HandStream (3+ note chords), or "JumpStream / HandStream" if both are present |
| Grade | Stream density grade and values. Single (<=4), Light (5), Mid (6), Dense (8), Heavy (9+). Values: P90 / P50                                             |
| Imbal | Multi-scale hand imbalance: 4-row / 16-row / overall for stream patterns                                                                                |
| Brk2r | Broken stream density: max/median note count in any 2-row window, detecting rhythm breaks                                                               |

### TECH Panel

| Field  | Meaning                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1f KPS | Single-finger max keys per second (busiest column in any 500ms window)                                                          |
| 1h KPS | One-hand max keys per second (left or right, whichever is higher)                                                               |
| 2h KPS | Both-hands max keys per second (total notes in any 500ms window)                                                                |
| Graces | Count of grace/flam notes detected (< 50ms gap between adjacent columns)                                                        |
| Rolls  | Roll pattern statistics: max consecutive length per note division. Format: `24x16` = max 24 consecutive rows at 16th-note speed |
| Trills | Trill pattern statistics: total count per note division                                                                         |

### STAMINA Panel

| Field   | Meaning                                                                              |
| ------- | ------------------------------------------------------------------------------------ |
| Max     | P95 density (4-row window) x longest continuous stretch above P75                    |
| Med     | P50 density (4-row window) x longest continuous stretch above P50                    |
| Med tot | Total time spent above P50 density                                                   |
| Ratio   | Percentage of map duration spent above P50 density                                   |
| Switch  | Maximum jack/stream transition count in any 16-row window (pattern change frequency) |

## Technical Notes

### Algorithm Overview

The plugin combines three analysis layers:

1. **Sunny Rework** - Ported from the Python reference implementation. Computes 6 strain components (Jbar, Xbar, Pbar, Abar, Rbar, C/Ks) and aggregates via weighted percentile into a star rating.

2. **Pattern Detection** - Ported from Interlude's pattern analysis. Uses sliding-window matching across 6 core pattern categories (Stream, Chordstream, Jacks, Coordination, Density, Wildcard) with 22+ specific sub-patterns for 4K.

3. **Custom Metrics** - Beat-grid-aware density, speed, and difficulty analysis. Uses note-division bands (4/8/12/16/24/32) instead of BPM for clustering. Grace notes (48th+) are excluded from main clustering.

### Division-Based Clustering

Instead of clustering by raw BPM (which breaks for non-standard note divisions), patterns are grouped by their effective note division relative to the beatmap's beat grid. This correctly handles:

- 16th notes at full speed (div=4)
- 8th notes at half speed (div=2)
- 24th notes (div=6, wider acceptance band for timing variance)
- 32nd notes (div=8)
- Half-time BPM maps (automatic detection and reclassification)

### Build

```bash
npm install
npm run build
```

Output goes to `deploy/osumania-estimator by Akuta Zehy/`. Copy this folder to tosu's `static/` directory.

### Acknowledgments

This project is inspired by:

- [osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser)
    - [Sunny Rework](https://github.com/sunnyxxy/Star-Rating-Rebirth)
    - [Interlude](https://github.com/YAVSRG/YAVSRG)
    - [tosu](https://tosu.app/)

Special thanks to all the external resources used in this work.

