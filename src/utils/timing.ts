// ============================================================
// timing.ts — optional console.time-style instrumentation
// Enabled via localStorage "osumania-debug-timing" = "1" (browser;
// the overlay can be opened with the dev console to read output).
// Zero overhead when disabled; no-op in Node (bench runner).
// Labels are grouped under "[perf]" for grepping.
// ============================================================

export const DEBUG_TIMING: boolean =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("osumania-debug-timing") === "1";

/** Run fn under a timing label; logs only when DEBUG_TIMING is on. */
export function timed<T>(label: string, fn: () => T): T {
  if (!DEBUG_TIMING) return fn();
  const t0 = performance.now();
  const r = fn();
  console.log(`[perf] ${label}: ${(performance.now() - t0).toFixed(1)}ms`);
  return r;
}

/** Mark an async section: call start() before, end() after. */
export function makeTicker(label: string): { start(): void; end(): void } {
  let t0 = 0;
  return {
    start() { if (DEBUG_TIMING) t0 = performance.now(); },
    end() {
      if (DEBUG_TIMING) console.log(`[perf] ${label}: ${(performance.now() - t0).toFixed(1)}ms`);
    },
  };
}