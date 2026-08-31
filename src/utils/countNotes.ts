// ============================================================
// countNotes.ts — linear note-count scan over raw .osu text
// Used for heavy-map guards. No split/trim to avoid allocations
// on heavy maps; skips "//" comments and blank lines.
// ============================================================

/**
 * Count HitObjects lines in raw .osu text (cheap char scan, no split).
 * Returns 0 if the [HitObjects] section is missing.
 */
export function countHitObjects(osuText: string): number {
  const hoIdx = osuText.indexOf("[HitObjects]");
  if (hoIdx < 0) return 0;
  let pos = hoIdx + 12;
  let noteCount = 0;
  while (pos < osuText.length) {
    const next = osuText.indexOf("\n", pos);
    const lineEnd = next >= 0 ? next : osuText.length;
    // Scan line: skip whitespace, skip "//" comments, count real content
    let hasNote = false;
    for (let i = pos; i < lineEnd; i++) {
      const c = osuText[i]!;
      if (c === "/" && i + 1 < lineEnd && osuText[i + 1] === "/") break;
      if (c !== " " && c !== "\t" && c !== "\r") { hasNote = true; break; }
    }
    if (hasNote) noteCount++;
    if (next < 0) break;
    pos = next + 1;
  }
  return noteCount;
}