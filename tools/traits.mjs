// Which way do the bodies drift? For each run of a pattern (seeds 101..), the
// population's mean of each body trait (0 to 1) in the first telemetry row and in the last,
// and in how many runs it fell; the mean change with a 95% bootstrap interval and an
// exact two-sided sign test (a coin flip would give about half).
//
//   node tools/traits.mjs "runs/trial-turin-base-d6-s{s}"      (SEEDS=20 SEED0=101)
import fs from "node:fs";
import { binomial } from "./sides.mjs";
import { bootstrap } from "./stats.mjs";

export function change(rows) { const a = rows[0].traits, b = rows.at(-1).traits; return Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]])); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const pat = process.argv[2], n = +(process.env.SEEDS || 20), s0 = +(process.env.SEED0 || 101), cs = [];
  for (let i = 0; i < n; i++) {
    const f = `${pat.replace("{s}", s0 + i)}/telemetry.jsonl`;
    if (fs.existsSync(f)) cs.push(change(fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse)));
  }
  console.log(`${pat}: ${cs.length} runs, mean body trait at the end less at the start (95% interval; runs where it fell; sign test p)`);
  for (const k of Object.keys(cs[0])) {
    const d = cs.map((c) => c[k]), m = d.reduce((a, b) => a + b, 0) / d.length, [lo, hi] = bootstrap(d), fell = d.filter((x) => x < 0).length, f = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
    console.log(`  ${k.padEnd(7)} ${f(m).padStart(7)}  [${f(lo)}, ${f(hi)}]  fell in ${fell} of ${d.length}  (p ${binomial(fell, d.length).toFixed(3)})`);
  }
}
