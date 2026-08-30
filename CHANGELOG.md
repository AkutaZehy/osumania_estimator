# Changelog

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
