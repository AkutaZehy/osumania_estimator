import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // test/ root holds the vitest suites. *.diag.ts files are one-off
    // diagnostic scripts (run with tsx), and test/tmp/ holds scratch probes —
    // none of those are runnable as tests.
    include: ["test/*.test.ts"],
  },
});
