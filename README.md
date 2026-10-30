# osumania-estimator

A tosu overlay plugin that analyses osu!mania 4K beatmaps and reports key-pattern structure, pattern-class typing and difficulty estimates over the play area.

By Akuta Zehy · version history in [CHANGELOG.md](CHANGELOG.md), current version in `metadata.txt`.

## Requirements

- [tosu](https://tosu.app/) — the osu! client fork this overlay targets (`CompatibleWith: tosu`).
- Node.js 18+ to build from source; the deployed overlay itself is a static bundle.

## Quick start

Deploy the built folder `deploy/osumania-estimator by Akuta Zehy/` (index.html, metadata.txt, settings.json, styles/, dist/) into tosu's `static/` directory, then restart tosu or reload overlays.

To build it yourself:

```bash
npm install && npm run build
```

The build bundles `src/index.ts` with esbuild into `dist/index.js` and copies the overlay files into `deploy/osumania-estimator by Akuta Zehy/`.

## Usage

### Input

- **Beatmap** — the overlay fetches the loaded chart's `.osu` file from tosu (`http://localhost:24050/files/beatmap/file`) and parses it locally.
- **Mods** — speed rate, OD flag and conversion flag (IN/HO) come from the tosu websocket payload. Any change of the mod signature (`speedRate | odFlag | cvtFlag`) re-runs the analysis; an already-analysed (chart, mod) pair is served from an in-memory LRU cache of 50 entries.

### Output

- **Overlay card** (lobby and result screens): effective BPM, dominant pattern, the Sunny star line, the pattern bars and the metric panels.
- **Metric panels**: BPM/DENSITY, LONG NOTE, JACK, STREAM, TECH and STAMINA — see the [panel reference](#panel-reference).
- **Section bar / in-game bar**: the whole-map segment structure, colour-coded by segment type; during play the in-game bar shows the segment under the playhead.

Detailed view card, rendered with `Camellia - Fastest Crash (inteliser) [cracked]`:

![Detailed view card — headline 210 Minijack, Sunny 5.33, pattern bars, metric panels and wds0-like markers](docs/screenshot-card.png)

### Settings

Two checkboxes in tosu's overlay settings (`settings.json`):

| Setting | Effect |
| --- | --- |
| Show Pattern Breakdown | Toggle the dominant-pattern / pattern-bars row |
| Show Custom Metrics | Toggle the BPM/DENSITY, LONG NOTE, JACK, STREAM, TECH and STAMINA panels |

## Panel reference

### Top strip

| Element | Shows |
| --- | --- |
| Headline | `{effective BPM} {dominant pattern}`. The dominant pattern comes from grid analysis; it is replaced by the dominant LN pool name when the LN ratio is ≥15 % and that pool scores ≥15 points, and replaced by a red `Vibro` when the vibro verdict fires |
| BPM | Effective BPM — `rawBPM * division / 4 * speedRate`; on variable-speed charts `BPM (min-max)` from per-cell timing points |
| KEYS | Column count (`4K`) |
| LN | Chart LN ratio in percent |
| SUNNY | Sunny Rework star. Below a 0.01 algorithm result a density estimate is substituted; when the in-game star is available the line adds `Sunny: 4.51 (+12.3 %)` |

Pattern bars: up to 8 bars of the BPM-grouped patterns, bar width relative to the largest share, BPM on the right. Abbreviations: Chordjack → `CJ`, Jumpstream → `JS`, Handstream → `HS`; `Minijack` and `Single Stream` stay spelled out. Without grid analysis the row falls back to up to 4 Interlude-cluster bars whose width is `patternAmount / max`.

### BPM / DENSITY

| Row | Shows |
| --- | --- |
| BPM | Effective BPM |
| Both | `avg X / max Y` — both-hands mean and max density (notes per 1 s window) |
| L/R | Left vs right hand mean density |
| Cols | Per-column mean density, `a \| b \| c \| d` |

### LONG NOTE

Shown when the LN ratio is >1 %, or any overlapping LN or tap LN exists.

| Row | Shows |
| --- | --- |
| Ratio | `60 % (45 %)` — all LN share / share excluding tap LNs; a ` · Jacky` or ` · Speedy` suffix marks a jack- or speed-heavy LN construction |
| Overlap | `585 (12 %)` — overlapping LN pairs and their share of all LNs |
| Tap LN | LNs no longer than a 16th note |
| P-Score | `CO x · DE x · WC x · TE x` — coordination / density / wildcard / technical pool scores |

Shield, reverse shield, column lock, attack/release, inverse, ouroboros and LN-tree constructions are computed in `lnAnalysis.ts` and feed the pool scores, but are not shown as separate rows.

### JACK

Rows in order: Grade, Class, Stamina, Imbal 4c/16c, wds0-like, Finger, Hand, Vibro.

| Row | Shows |
| --- | --- |
| Grade | Weighted P90 of grid notes per jack cell: Mini ≤4 / Low ≤7 / Mid ≤11 / Dense ≥12, displayed `Mid (8/5)` as `P90/P50`. Without grid data it falls back to a 4-row window, displayed `max/med` |
| Class | `{eff} Actually Not Jack` / `Speedjack` / `Bullet / Minijack` / `{Low\|Mid\|High} Chordjack` / `Anchor / X Chordjack` (anchor confidence ≥70). See [Jack class](ALGORITHM.md#jack-class-system) |
| Stamina | `18.0s (247, Broken) / 106.8s (1138)` — longest jack streak and total streak coverage with note counts; `Broken` marks a sub-10 s peak merged past 10 s by gaps of ≤½ measure |
| Imbal 4c/16c | `1.87/1.35 S` — 16-row / 64-row window imbalance (1.0 balanced, 2.0 one-sided) plus direction `L` / `R` / `S`. When every jack sits in one hand the row shows `bias L/R/S` |
| wds0-like | `SF-Jack`, `MR-Jack-W` — see [wds0-like markers](#wds0-like-markers) |
| Finger | `4 × max column ÷ both hands` peak density; 1.0 balanced, 4.0 everything in one column |
| Hand | `2 × max hand ÷ both hands` peak density; 1.0 balanced, 2.0 everything in one hand |
| Vibro | `No Vibro` / `Vibro Suspicious` / `Vibro(rate %) B1.2s/C0.8s` — verdict, weighted canVibro rate, burst and control coverage |

### STREAM

Rows in order: Grade, Class, Stamina, Imbal 4c/16c, wds0-like (stream line plus an unlabelled speed line), Sta L/R, Sta DH.

| Row | Shows |
| --- | --- |
| Grade | Mean notes per row over qualifying stream segments: Single ≤1.125 / Light ≤1.25 / Mid ≤1.5 / Dense <2.0 / Full =2.0 / Heavy >2.0, displayed `Light (1.16)` |
| Class | `{eff} {Full\|Dense\|Broken\|Mid} (JS\|HS\|SS)[, Jacky][, Technical]`, e.g. `105 Mid JS, Jacky, Technical`; `Running Man` for Full + pure single-note stream. See [Stream class](ALGORITHM.md#stream-class-system) |
| Stamina | `104 (10s) / 419 (30s)` — max notes in any sliding 10 s / 30 s window |
| Imbal 4c/16c | Same construction as the JACK row, over non-jack rows |
| wds0-like | Two lines: `XY-Stream` and `XY-Speed[-T\|-W]` — see [wds0-like markers](#wds0-like-markers) |
| Sta L/R | Single-hand anchor stamina, `P100 / P90=v×n / P50=v×n` in measures |
| Sta DH | Dual-hand anchor stamina (four cross-hand column pairs), same format |

### TECH

Rows appear only when non-zero.

| Row | Shows |
| --- | --- |
| dtCV | Row-spacing coefficient of variation inside active sections; 0.2–0.4 even, 0.6+ bursty |
| Interval | Single-finger spacing of the fastest burst (ms) |
| KPS (P90) | Both-hands P90 keys per second |
| Graces | Grace / flam count (cell-aware; legitimate 48th-note streams excluded) |
| Rolls | Max consecutive lengths per note division, e.g. `3×4 4×8 4×16 4×24 3×32` |
| Trills | Total counts per note division, same `length×division` form |

### STAMINA

| Row | Shows |
| --- | --- |
| Max | `6.9×9.0s` — peak 4-row density and its longest stretch |
| Med | `5.0×17.5s` — median 4-row density and its longest stretch |
| Med tot | Total time at or above the Med density |
| Ratio | Med total time ÷ map duration |
| Switch | `34 (Rhythmic)` — max jack↔stream transitions in a 16-beat window, plus a descriptor: Steady ≤15, Mixed ≤25, Rhythmic ≤35, Intense >35. The count is not capped |

The switch metric clusters rows from actual note timestamps rather than a fixed grid; consecutive rows sharing a column form a jack pair, same-type pairs merge into runs, and the score is the maximum number of run-type transitions inside a sliding 16-beat window. LN heads participate as single notes at their start time.

### wds0-like markers

Three-axis markers shown in the JACK and STREAM panels, following the **wds0 Dan** system by chart author wds0. Each marker reads `Density-Manip-Word` in letters:

| Axis | Marker | Density letter | Manip letter |
| --- | --- | --- | --- |
| Jack | `XY-Jack[-W]` | Jack-pool P90: S <8 / M <10 / L <12 / H ≥12 | Chain-A delta against a spike-min baseline: F <0.005 / R in between / P >0.01; maps with 3+ note rows ≥20 % force R plus `-W` (Gluts) |
| Stream | `XY-Stream` | Stream-pool P90: B <4.75 / S <6 / M <7 / L <7.5 / H ≥7.5 | Chain A against the PDF thresholds: F ≥1.11 / R ≥1.10 / P <1.10 |
| Speed | `XY-Speed[-T\|-W]` | Stream-section P50 ×2: S <8+1/256 / M <8.5 / L <9.5; ≥9.5 prefixes `O` and drops the F/R/P letter | Per-section bullet count: F ≤1/16 / R ≤1 / P ≤3 / P >3; suffixes `T` (twist, >3) and `W` (constructed, ≤1/16 with A <1.115) |

Density letters: `S` / `M` / `L` / `H`, plus `B` (below the stream range) and `O` (beyond the speed range). Manip letters: `F` (flat / mashable) / `R` (regular) / `P` (peak / locked). Examples: `MR-Jack-W`, `MR-Stream`, `O-Speed-T`.

## Metric index

Row names, units and ranges at a glance; each row links to the panel that renders it.

| Metric | Unit | Range | Panel |
| --- | --- | --- | --- |
| BPM | BPM | chart value; `BPM (min-max)` on variable-speed charts | [Top strip](#top-strip) |
| Dominant pattern | enum | `Minijack`, `Low/Mid/High Chordjack`, `Mid Jumpstream`, … | [Top strip](#top-strip) |
| KEYS | count | `4K` only | [Top strip](#top-strip) |
| LN ratio | % | 0–100 (strict share ≤ total share) | [Top strip](#top-strip) |
| Sunny | stars | ≥ 0; `Sunny: 4.51 (+12.3 %)` against the in-game star | [Top strip](#top-strip) |
| Both / L/R / Cols | keys per second | ≥ 0 over a 1 s sliding window | [BPM / DENSITY](#bpm--density) |
| Ratio / Overlap / Tap LN | % / pairs·% / count | ≥ 0 | [LONG NOTE](#long-note) |
| LN pool scores CO/DE/WC/TE | points | 0–100, relative between the four pools | [LONG NOTE](#long-note) |
| JACK Grade / Class / Stamina | enum / enum / s+notes | see panel | [JACK](#jack) |
| Imbal 4c/16c | ratio | 1.0 balanced – 2.0 one-sided, or `bias L/R/S` | [JACK](#jack) |
| Finger / Hand | ratio | 1.0 balanced – 4.0 / 2.0 one-sided | [JACK](#jack) |
| wds0-like | letters | `XY-Jack[-W]`, `XY-Stream`, `XY-Speed[-T\|-W]` | [wds0-like markers](#wds0-like-markers) |
| Vibro | verdict | No Vibro / Vibro Suspicious / Vibro | [JACK](#jack) |
| STREAM Grade / Class / Stamina | enum / string / notes | see panel | [STREAM](#stream) |
| Sta L/R, Sta DH | measures | `P100 / P90=v×n / P50=v×n` | [STREAM](#stream) |
| dtCV | ratio | ≥ 0; 0.2–0.4 even, 0.6+ bursty | [TECH](#tech) |
| Interval / KPS / Graces | ms / keys per second / count | ≥ 0 | [TECH](#tech) |
| Rolls / Trills | length×division | ≥ 0, one pair per division | [TECH](#tech) |
| Max / Med / Med tot | density×s / s | ≥ 0 | [STAMINA](#stamina) |
| Ratio | % | 0–100 | [STAMINA](#stamina) |
| Switch | count | ≥ 0; 16-beat window, no cap | [STAMINA](#stamina) |

## Known limitations

- **4K only.** The pattern, grid and clustering algorithms assume a 4-column chart; other key counts are out of scope.
- **Very dense charts are skipped.** A chart with more than 30000 notes, or more than 15000 long notes, is reported as skipped instead of analysed.
- **LN pool scores are not a difficulty number.** They express relative probability between the four pools, so only their ordering is meaningful.
- **Without grid analysis the output degrades.** The pattern bars fall back to up to 4 Interlude-cluster bars, and the density grades fall back to a 4-row sliding-window tier.
- **Sunny falls back to a density estimate.** Below a 0.01 algorithm result the star is estimated from density, and the comparison against the in-game star is then omitted.
- **Anchor stamina shows two of the three tiers.** `Sta L/R` (single hand) and `Sta DH` (dual hand) are displayed; the single-finger tier is computed for calibration and stays internal.
- **Anchor stamina values depend on the dominant pattern.** On jack-type charts SH/DH resolve on a 2× BPM grid; on stream-type charts SF resolves on half BPM. The same chart can therefore report different values if its dominant pattern changes.

## Docs

- [docs/glossary.md](docs/glossary.md) — the bilingual term table: Chinese names, English names, algorithm definitions and the code identifiers behind them.
- [docs/ALGORITHM.md](docs/ALGORITHM.md) — how each number is produced: formulas, thresholds and their source locations.
- [CHANGELOG.md](CHANGELOG.md) — version history.

## Build & test

```bash
npm install && npm run build     # esbuild → dist/index.js, then copied into deploy/
npm run typecheck                # tsc --noEmit
npm test                         # vitest
npm run bench                    # perf benchmark (npm run bench:stages for per-stage breakdown)
```

Test maps live in `maps/`, vitest suites in `test/*.test.ts`; the remaining files in `test/` and `scripts/` are one-off diagnostic and benchmark scripts.

## Acknowledgments

References:

- [Sunny Rework](https://github.com/sunnyxxy/Star-Rating-Rebirth) — star rating algorithm
- [osumania_map_analyser](https://github.com/LeoBlackMT/osumania_map_analyser) — reference implementation
- [wds0 Dan](https://www.bilibili.com/opus/1237321666437054472) — wds0-like marker system
- [Guanjing Scene](https://github.com/guanjing1462-creator/guanjing-scene) — anchor algorithm reference ([web](https://guanjingscene.xyz/))
- [Interlude](https://github.com/YAVSRG/YAVSRG) · [Etterna](https://github.com/etternagame/etterna) · [tosu](https://tosu.app/) · [osu](https://github.com/ppy/osu)

Special thanks to:

- [sunnyxxy](https://github.com/sunnyxxy): Sunny Rework
- [Leo_Black](https://github.com/LeoBlackMT): osumania_map_analyser, benchmark
- [wds0](https://osu.ppy.sh/users/8771622): wds0 dan and its documentation
- [Guanjing](https://github.com/guanjing1462-creator) & [AquaStone](https://github.com/AquaStoneLZS): Guanjing Scene, wds0 implementation reference
  - the `wds0-like` anchor algorithm in `src/custom/wdsMarker.ts` derives from their [`spike.js`](https://github.com/guanjing1462-creator/guanjing-scene/blob/main/frontend/shared/analysis/spike.js), heavily reworked here
- [FutureLK](https://osu.ppy.sh/users/24038353): plugin testing and feedback

## License

This repository ships no license file. Treat the code as all-rights-reserved and contact the author before reuse.
