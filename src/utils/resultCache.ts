// ============================================================
// resultCache.ts — LRU result cache for analysis results
// Pure module: no DOM, no imports — safe to load anywhere.
// Keys are built by the caller; values MUST be structured-clone-safe
// (plain objects / arrays / primitives — DifficultyResult satisfies this).
// put() stores the reference (the caller must not mutate it afterwards);
// get() deep-clones so callers can freely mutate what they receive.
// ============================================================

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  // ponytail: JSON fallback (Node <17) — breaks on undefined/Date, but
  // the caller contract is structured-clone-safe.
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface ResultCache<T> {
  get(key: string): T | undefined;
  put(key: string, value: T): void;
  has(key: string): boolean;
  clear(): void;
  readonly size: number;
  /** Bumped on clear() so callers can detect invalidation */
  readonly generation: number;
}

export function createResultCache<T>(
  { maxSize = 100 }: { maxSize?: number } = {},
): ResultCache<T> {
  const map = new Map<string, T>(); // insertion order = recency order (oldest first)
  let generation = 0;

  function touch(key: string): boolean {
    const value = map.get(key);
    if (value !== undefined) {
      map.delete(key);
      map.set(key, value);
      return true;
    }
    return false;
  }

  return {
    get(key) {
      return touch(key) ? deepClone(map.get(key) as T) : undefined;
    },
    put(key, value) {
      if (map.has(key)) {
        map.delete(key);
      } else if (map.size >= maxSize) {
        // Evict least-recently-used (first in Map iteration order)
        map.delete(map.keys().next().value as string);
      }
      // Store the reference: get() clones, so the stored value is never
      // observed mutated. Saves a structuredClone (tens of ms on heavy
      // results) on every freshly analyzed map.
      map.set(key, value);
    },
    has(key) {
      return touch(key);
    },
    clear() {
      map.clear();
      generation += 1;
    },
    get size() {
      return map.size;
    },
    get generation() {
      return generation;
    },
  };
}
