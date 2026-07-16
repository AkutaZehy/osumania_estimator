# osumania-estimator v2.0.0

**A tosu overlay plugin for osu!mania 4K key pattern analysis and difficulty estimation.**

## What's New in v2.0.0

### 🧠 Architecture: Grid Analysis Decomposition

The monolithic `sectionAnalysis.ts` has been split into two focused modules:

- **`gridAnalysis.ts`** — cell-level beat-grid analysis: subdivision detection, pattern classification, jack/stream/LN metrics, grace/flam detection, cross-cell jack analysis
- **`sectionAnalysis.ts`** — beat-grid slicing, segment aggregation, cross-segment statistics, summary reports

This separation enables independent testing, clearer data flow, and easier extension for new pattern types.

### ⏱ SV Map Support: Per-Cell Active Timing

Maps with scroll velocity changes (multiple uninherited timing points at different BPMs) no longer use only the first global timing point. Each grid cell looks up the active timing point at its start time:

- `getActiveTimingPoint(time)` — finds the correct timing point
- `getActiveBPM(time)` / `getActiveBeatLength(time)` — per-cell BPM/beat length

Previously: a 192→243 BPM SV map showed **Speedy Tech @ 288BPM** (wrong).  
Now: correctly shows **Rolls @ 243BPM**.

### 🖥 UI Overhaul

| Element | Description |
|---------|-------------|
| **In-Game Bar** | Progress track + active pattern label + subtype + measures/time/density during gameplay |
| **Section Bar** | Color-coded measure-by-measure timeline with playhead tracking |
| **Structure Grid** | Pattern detail cards with BPM, cell count, density per cluster |
| **Segment Table** | Row-level breakdown of every segment (type, BPM, cells, category, duration) |

### ⚙️ View Mode (tosu Settings)

| Mode | Description |
|------|-------------|
| **Simple** | Section bar timeline only — compact, suitable during gameplay |
| **Detailed** | Full structure grid + segment table + all metrics panels — suited for lobby/result screen |

### 🧪 Test Framework

- **Test suite**: Vitest with col/key pattern, section analysis, real-map validation tests
- **10 test maps**: Jack (7 stages), Speed (4 stages), Stamina (2 stages) dan packs + SV map + custom map
- **Grid analysis script**: `scripts/testGridAnalysis.ts` for running all maps and inspecting output

---

## Full Feature Overview (v2.0.0)

### Core Analysis

| Feature | Description |
|---------|-------------|
| **Beat-Grid Cell Analysis** | Map divided into beat-aligned cells; each cell classified by subdivision (2/4/6/8+) and pattern type |
| **Division-Based Clustering** | Patterns grouped by effective note division (4th through 32nd+) against the beat grid |
| **Per-Cell Timing** | Accurate BPM per cell via active timing point lookup — supports SV maps with BPM changes |
| **Jack Detection** | Minijack (anchor) / Chordjack / Longjack detection with strict interruption checking |
| **Stream Analysis** | Stream / JumpStream / HandStream classification with grade (Single→Heavy), imbalance, broken stream metrics |
| **LN Metrics** | Ratio, Overlay, TapLN, Shield/Reversed Shield, ColLock, A/R (Attack/Release), Inverse |
| **Grace/Flam Detection** | Adjacent-column gaps < 50ms counted as graces |
| **Cross-Cell Jacks** | Jack patterns spanning cell boundaries at low subdivisions |
| **Hand Balance** | Per-hand peak density, finger/hand dominance ratios, 4/16-row imbalance |

### Star Rating & Difficulty

| Feature | Description |
|---------|-------------|
| **Sunny Rework** | 6 strain components with weighted percentile aggregation |
| **Density-Based Estimate** | Fallback when Sunny returns < 0.01 |

### MOD Support

- DT/NC (1.5x), HT/DC (0.75x), lazer custom rate multipliers
- BPM, densities, and pattern speeds adjust accordingly

### External Integrations

| Integration | Description |
|-------------|-------------|
| **tosu WebSocket** | Live beatmap data and gameplay state via `ws://localhost:24050/ws` |
| **tosu Settings API** | Two view modes configurable in tosu settings panel |
| **Etterna (MinaCalc)** | WASM-based ETT vibro detection (JackSpeed/Overall >= 0.95) |
| **Sunny Rework** | Upstream star rating engine |
| **Interlude** | Sliding-window pattern detection |

---

## Changelog (v1.0.0 → v2.0.0)

### Added
- `src/custom/gridAnalysis.ts` — modular cell-level analysis extracted from section analysis
- `src/custom/sectionAnalysis.ts` — orchestrator delegating to gridAnalysis
- Per-cell active timing point lookup for SV maps with multiple BPM zones
- In-game bar with progress track, label, subtype, measures/time/density
- Section bar (timeline) with measure-level color coding and playhead
- Structure grid — pattern detail cards per cluster
- Segment table — row-level segment breakdown
- View Mode settings (simple / detailed) in tosu settings panel
- `scripts/testGridAnalysis.ts` — command-line test harness for all maps
- 10 test maps in `maps/` for validation
- Vitest test suite in `test/`
- `src/tosu/socket.js` — WebSocket transport for browser-bound tosu integration
- `src/types/global.d.ts`, `prototype/section-bar.html` — type definitions and UI prototype
- `deploy/*.zip` — pre-built deployment artifact

### Changed
- Bumped version 1.0.0 → 2.0.0
- Overlay resolution: 480×780 → 640×960
- `index.html` / `deploy/*.html` — added structure grid, segment table, section bar, in-game bar DOM
- `src/ui/display.ts` — comprehensive rewrite for new UI elements
- `src/integration/analyzer.ts` — updated data flow for decomposed analysis modules
- `src/index.ts` — initialized grid analysis integration
- `settings.json` — replaced algorithm/display settings with two view mode options

---

**Ultraworked with Sisyphus**
