# src/ett — parity reference builds

Versioned minaclac (MinaCalc) WASM builds kept as **parity references** for
`test/msdVsWasm.test.ts`, which loads `minaclac-72.3.js` + `minaclac-72.3.wasm`
and compares the pure-TS port in `src/msd/` against the official engine.

- **Only 72.3 is referenced** by the test; there is no version-selection
  mechanism at runtime. The production overlay never loads anything from this
  directory — the whole engine runs from the TS port (`src/msd/`).
- The other builds (68.0-unofficial, 70.0, 72.0, 74.0) are kept for diffing
  calibration changes between engine versions.

`npm test` regenerates the parity comparison; `scripts/bench.ts` measures the
TS engine only.
