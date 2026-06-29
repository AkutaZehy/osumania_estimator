# osumania-estimator

A tosu overlay plugin for osu!mania 4K key pattern analysis and difficulty estimation.

By Akuta Zehy.

## Deployment

Copy the entire `osumania-estimator by Akuta Zehy` folder into tosu's `static/` directory. Restart tosu or reload overlays.

## Interface Layout

```
+--------------------------------------------------+
| Artist - Title [Difficulty]                       |
+--------------------------------------------------+
|               180 JumpStream                      |
|            Sunny: 4.51                            |
+--------------------------------------------------+
|        270 BPM          LN 5%                    |
+--------------------------------------------------+
|  JumpStream  [=======]          180              |
|  MiniJacks   [===]               90              |
|  HandStream  [=]                180              |
+----------------------+---------------------------+
|  BPM / DENSITY       |  LONG NOTE                |
|  BPM         270     |  Ratio        5%          |
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
|  Vibro         ETT   |                           |
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

Shows the effective BPM and dominant pattern type. On vibro maps detected by Etterna, displays "VIBRO" in red. BPM is `rawBPM * division / 4 * speedRate`.

### Sunny (second line)

Sunny Rework star rating. If the algorithm returns below 0.01, a density-based estimate is shown.

### Pattern Breakdown Bars

Up to 4 bars. Bar width = pattern amount / max amount. Types include: Stream, JumpStream, HandStream, MiniJacks, ChordJacks, LongJacks, MiniTrills, Rolls, Trills, SplitTrill, JumpTrill, ColumnLock, Shield, Release, Inverse.

### BPM / DENSITY Panel

| Field | Meaning |
|-------|---------|
| BPM | Speed-adjusted BPM (`rawBPM * speedRate`) |
| Both | Both-hands max/median density (notes per 1000ms window) |
| L/R | Left hand vs right hand peak density |
| Cols | Per-column peak density |

### LONG NOTE Panel

Shown when LN ratio > 1% or patterns detected.

| Field | Meaning |
|-------|---------|
| Ratio | LN percentage |
| Shields | Normal note -> LN head on same column within 1/4 beat |
| ColLock | Adjacent same-hand hits >= 3 at 90+ BPM while LN held |
| Inverse | Alternating LN releases with consistent gap timing |

### JACK Panel

| Field | Meaning |
|-------|---------|
| Grade | Mini (<=4) / Low (5-7) / Mid (8-11) / Dense (12+). Values: P90/P50 |
| Anchors | 3+ consecutive same-column notes, gap <= 2x per-row beat length |
| Finger | Max per-column density / max both-hands (0-1) |
| Hand | Max(left,right) peak density / max both-hands (0-1) |
| Imbal | 4-row / 16-row / overall. "bias" if only one hand has jacks |
| Vibro | "ETT" when Etterna JackSpeed/Overall >= 0.95 |

### STREAM Panel

| Field | Meaning |
|-------|---------|
| Type | Stream / JumpStream / HandStream / "JumpStream / HandStream" |
| Grade | Single(<=4) / Light(5) / Mid(6) / Dense(8) / Heavy(9+). P90/P50 |
| Imbal | 4-row / 16-row / overall stream hand imbalance |
| Brk2r | Broken stream: max/median notes in any 2-row window |

### TECH Panel

| Field | Meaning |
|-------|---------|
| 1f KPS | Single-finger max KPS (500ms window) |
| 1h KPS | One-hand max KPS |
| 2h KPS | Both-hands max KPS |
| Graces | Grace/flam count (< 50ms adjacent-column gap) |
| Rolls | Max consecutive length per division (e.g. "24x16") |
| Trills | Total count per division |

### STAMINA Panel

| Field | Meaning |
|-------|---------|
| Max | P95 density x longest stretch above P75 |
| Med | P50 density x longest stretch above P50 |
| Med tot | Total time above P50 |
| Ratio | % of map above P50 |
| Switch | Max jack/stream transitions in 16-row window |

## Technical Notes

### Division-Based Clustering

Patterns grouped by effective note division against the beat grid:

| Div | Type | Display BPM |
|-----|------|-------------|
| 1 | 4th | rawBPM/4 |
| 2 | 8th | rawBPM/2 |
| 3 | 12th | rawBPM*3/4 |
| 4 | 16th | rawBPM |
| 6 | 24th | rawBPM*1.5 |
| 8 | 32nd | rawBPM*2 |
| >9.5 | 48th+ | grace |

### Algorithm Layers

- **Sunny Rework** — 6 strain components, weighted percentile aggregation
- **Pattern Detection** — Interlude sliding-window, 6 core + 22+ specific patterns
- **Custom Metrics** — Beat-grid density, speed, stamina, tech analysis
- **Etterna Vibro** — MinaCalc v0.72.3 WASM, JackSpeed/Overall >= 0.95

### MOD Support

DT/NC (1.5x), HT/DC (0.75x), lazer custom rates. Per-row beatLength handles BPM changes. MOD change detection requires map re-entry on tosu lazer v4.

### Build

```bash
npm install && npm run build
```

Output: `deploy/osumania-estimator by Akuta Zehy/`

### Acknowledgments

- [Sunny Rework](https://github.com/sunnyxxy/Star-Rating-Rebirth)
- [osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser)
- [Interlude](https://github.com/YAVSRG/YAVSRG)
- [Etterna](https://github.com/etternagame/etterna)
- [tosu](https://tosu.app/)
