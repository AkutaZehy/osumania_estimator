# Changelog

## 4.5.0 (2026-10-06)

### Changed

- **WDS0-like markers reworked to the 大勿 letter vocabulary** — markers now read `XY-Jack`, `XY-Stream`, `XY-Speed` in letters (e.g. `MR-Jack-W`, `MR-Stream`, `O-Speed-T`), replacing the `Low-Manip-Jack` word form. Anchor algorithm follows the official guide's chain-growth spec (plus the site's sliding min-A as the delta baseline); density pools are routed by chart family (lock1 ≥10% = main jack); Speed density = Stream-section P50 ×2 with an `O` prefix past the 9.5 cap
- **Marker affixes** — `-W` Gults suffix (hand-chord maps, ≥20% ≥3-note rows) on Jack and constructed charts on Speed; `-T` twist suffix (bullet count >3); `B` density prefix for Stream sections below 4.75
- Full marker test tables over 12 chart groups (8 dan + 4 signicial) in `test/wdsGuideContrast.report.md`, with the porting/divergence notes in `test/wdsGuideContrast.test.ts`

## 4.4.0 (2026-10-05)

### Added

- **WDS0-like markers** — WDS-style `Density-Mush-Word` markers (letters, e.g. `MR-Jack-W`) in the metric panels: `X-Jack` under the JACK `Imbal` row, `X-Stream` + `X-Speed` (two lines) under the STREAM `Imbal` row. Density: family-routed section-density P90 (Jack), Stream-section P90 (Stream), Stream-section P50 ×2 with an `O` out-of-range prefix (Speed). Mush: anchor-delta grade with the `-W` Gults suffix on ≥20% hand-chord maps (Jack), anchor thresholds (Stream), bullet-count bands with `T`/`W` suffixes (Speed)
- **Marker vocabulary** — density letters `S / M / L / H` plus `B` (below Stream) and `O` (beyond Speed); mush letters `F` (flat/mashable) / `R` (regular) / `P` (peak/locked); flags `-W` (Gults / constructed) and `-T` (twist); e.g. `MR-Jack-W`, `MR-Stream`, `O-Speed-T`
- Full 8-group WDS word tables over all dan ladders (reform/regular × jack/stamina/speed/stream/tech) via `test/wdsFullTables.report.md`

### Changed

- STREAM panel `Brk2r` row removed (broken-stream max/median stay internal)
- New module `wdsMarker.ts`; marker computation costs ~40–130 ms per chart

## 4.3.0 (2026-08-30)

### Added

- **JACK panel `Class` row** — run-extraction jack typing at the dominant jack cadence: `Actually Not Jack` / `Speedjack` / `Bullet / Minijack` / `{Low|Mid|High} Chordjack` / `Anchor / X Chordjack` (anchor confidence ≥70), prefixed with the jack cadence effBPM
- **JACK panel `Stamina` row** — burst (longest jack streak) / sum (total streak coverage), each with note counts; `Broken` marks a sub-10s peak merged past 10s from ≤½-measure gaps
- **STREAM panel `Class` row** — 切 interval-distribution typing: `[eff] [Full|Dense|Broken|Mid] (JS|HS|SS)[, Jacky][, Technical]`; `Running Man` for Full pure-single-stream
- **STREAM panel `Stamina` row** — max notes in any 10s / 30s sliding window
- New modules `jackClass.ts` / `streamClass.ts`; both scale with speedRate

### Changed

- JACK `Purity` row removed (both-hands ratio no longer displayed; still computed in gridAnalysis)
- JACK `Anchor` row removed from the panel (SF stays internal for calibration; SH/DH remain in STREAM as `Sta L/R` / `Sta Alt`)
- STREAM `Type` row replaced by `Class`
- JACK/STREAM panel row order aligned (Grade, Class, Stamina, …; panel-specific rows after)
- Switch `Technical` tag threshold raised to non-integer intervals ≥15%

## 4.2.0

- jackBothHand both-hands occupancy metric (superseded in display by the Class row in 4.3.0)
- Performance: multiple O(n²) hotspots → O(n log n)/O(n); binary searches → monotonic pointers
- GitHub Actions release workflow (tag-push builds + zips + publishes)
