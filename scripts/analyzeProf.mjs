import { readFileSync } from "node:fs";
const prof = JSON.parse(readFileSync(process.argv[2] ?? "dist/patterns.cpuprofile", "utf8"));
const nodes = new Map(prof.nodes.map(n => [n.id, n]));
const hits = new Map();
for (const id of prof.samples) {
  const n = nodes.get(id);
  if (!n) continue;
  const name = n.callFrame.functionName || "(anon)";
  const url = n.callFrame.url || "";
  const file = url.split(/[\/]/).slice(-1)[0].replace(/\.mjs.*/, "");
  const key = `${name} @${file}:${n.callFrame.lineNumber + 1}`;
  hits.set(key, (hits.get(key) ?? 0) + 1);
}
const total = prof.samples.length;
const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
for (const [k, c] of top) console.log(`${(c / total * 100).toFixed(1).padStart(5)}%  ${k}`);
