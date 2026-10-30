// A paired comparison on the seeds where BOTH arms started: collapsed runs (a city that
// never leaves its floor, tools/collapse.mjs) are left out, since their ratios blow up.
// Fares a day, crashes per car a day, trip time and cars, days FROM..DAYS, change of arm B
// over arm A with a 95% bootstrap interval, like tools/trial.mjs.
//
//   SEED0=201 SEEDS=20 node tools/survivors.mjs "runs/a-s{s}" "runs/b-s{s}"   (FLOOR=30 FROM=2 DAYS=6)
import fs from "node:fs";
import { bootstrap } from "./stats.mjs";

export function measures(dir, from, days) {
  const rows = fs.readFileSync(`${dir}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
  const w = rows.filter((x) => x.tick > from * 86400 && x.tick <= days * 86400), sum = (f) => w.reduce((a, x) => a + f(x), 0), d = days - from, cars = sum((x) => x.cars) / w.length;
  return { end: rows.at(-1).cars, "fares a day": sum((x) => x.trips) / d, "crashes per car a day": sum((x) => x.crashes) / (cars * d), "trip time": sum((x) => x.tripTicks) / Math.max(1, sum((x) => x.trips)) / 60, cars };
}

export function paired(a, b, floor = 30) {
  const keep = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x.end > floor && y.end > floor);
  const out = { kept: keep.length, of: a.length, rows: {} };
  for (const k of ["fares a day", "crashes per car a day", "trip time", "cars"]) {
    const ch = keep.map(([x, y]) => y[k] / x[k] - 1);
    out.rows[k] = ch.length ? { mean: ch.reduce((s, v) => s + v, 0) / ch.length, ci: bootstrap(ch), up: ch.filter((v) => v > 0).length, down: ch.filter((v) => v < 0).length } : null;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [pa, pb] = process.argv.slice(2), n = +(process.env.SEEDS || 20), s0 = +(process.env.SEED0 || 101), from = +(process.env.FROM || 2), days = +(process.env.DAYS || 6), floor = +(process.env.FLOOR || 30);
  const A = [], B = [];
  for (let i = 0; i < n; i++) { A.push(measures(pa.replace("{s}", s0 + i), from, days)); B.push(measures(pb.replace("{s}", s0 + i), from, days)); }
  const r = paired(A, B, floor), f = (v) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}%`;
  console.log(`${pb} against ${pa}, ${r.kept} of ${n} seeds where both arms ended above ${floor} cars, days ${from}-${days}: mean change, 95% interval, seeds up/down`);
  for (const [k, v] of Object.entries(r.rows)) if (v) console.log(`  ${k.padEnd(22)} ${f(v.mean).padStart(8)}  [${f(v.ci[0])}, ${f(v.ci[1])}]  ${v.up} up / ${v.down} down${v.ci[0] > 0 || v.ci[1] < 0 ? "" : "  (not distinguishable from zero)"}`);
}
