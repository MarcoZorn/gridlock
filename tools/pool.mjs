// Forty seeds from two sets of twenty: the paired change of arm B over arm A (as in
// tools/trial.mjs: fares a day, crashes per car a day, trip time, cars) over the seeds of
// several sets together, with one 95% bootstrap interval. Each set is "first seed:count".
//
//   node tools/pool.mjs "runs/trial-turin-base-d6-s{s}" "runs/trial-turin-congestion_0.1-d6-s{s}" 101:20 301:20
//   (FROM=2 DAYS=6)
import fs from "node:fs";
import { bootstrap } from "./stats.mjs";
import { measures } from "./survivors.mjs";

export function pooled(A, B) {
  const out = {};
  for (const k of ["fares a day", "crashes per car a day", "trip time", "cars"]) {
    const ch = A.map((x, i) => B[i][k] / x[k] - 1), [lo, hi] = bootstrap(ch);
    out[k] = { n: ch.length, mean: ch.reduce((s, v) => s + v, 0) / ch.length, lo, hi, up: ch.filter((v) => v > 0).length, down: ch.filter((v) => v < 0).length };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [pa, pb, ...sets] = process.argv.slice(2), from = +(process.env.FROM || 2), days = +(process.env.DAYS || 6), A = [], B = [];
  for (const set of sets) {
    const [s0, n] = set.split(":").map(Number);
    for (let i = 0; i < n; i++) { A.push(measures(pa.replace("{s}", s0 + i), from, days)); B.push(measures(pb.replace("{s}", s0 + i), from, days)); }
  }
  const r = pooled(A, B), f = (v) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}%`;
  console.log(`${pb} against ${pa}, ${A.length} seeds (${sets.join(" + ")}), days ${from}-${days}: mean change, 95% interval, seeds up/down`);
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(22)} ${f(v.mean).padStart(8)}  [${f(v.lo)}, ${f(v.hi)}]  ${v.up} up / ${v.down} down${v.lo > 0 || v.hi < 0 ? "" : "  (not distinguishable from zero)"}`);
}
