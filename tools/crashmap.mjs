// Where and how a run crashes, from the runs/<name>/crashes.jsonl that
// `headless.mjs --crash-log` writes: [tick, car, kind, impact, road from,
// road to, junction (-1: open road)].
//
//   node tools/crashmap.mjs tmp/cl-hand-one tmp/cl-hand-two
import fs from "node:fs";

export function summary(rows, top = 10) {
  const kinds = {}, roads = new Map();
  let junction = 0, impact = 0;
  for (const [, , kind, imp, a, b, j] of rows) {
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (j >= 0) junction++;
    impact += imp;
    const k = `${a}>${b}`; roads.set(k, (roads.get(k) || 0) + 1);
  }
  const ranked = [...roads].sort((x, y) => y[1] - x[1]);
  return { n: rows.length, kinds, junction, impact: impact / Math.max(1, rows.length), roads: roads.size, top: ranked.slice(0, top), topShare: ranked.slice(0, top).reduce((t, r) => t + r[1], 0) / Math.max(1, rows.length) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const d of process.argv.slice(2)) {
    const s = summary(fs.readFileSync(`${d}/crashes.jsonl`, "utf8").trim().split("\n").map(JSON.parse));
    const pct = (x) => (100 * x / s.n).toFixed(1) + "%";
    console.log(`${d}: ${s.n} crashes on ${s.roads} roads; ${Object.entries(s.kinds).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}; in a junction ${pct(s.junction)}; mean impact ${s.impact.toFixed(3)}`);
    console.log(`  the ten worst roads hold ${(100 * s.topShare).toFixed(1)}% of them: ${s.top.map(([r, c]) => `${r}:${c}`).join(" ")}`);
  }
}
