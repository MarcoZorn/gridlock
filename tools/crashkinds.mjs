// How many crashes does a trial arm have? Reads the telemetry of the runs of
// two arms (same seeds) and prints, per arm, over days FROM..DAYS: crashes
// (every car that crashes), car-car collisions (`carCrashes`, one per PAIR:
// each pair crashes both cars), trips, and the mean number of cars. Crashes
// minus collisions is NOT the number of wall crashes; for kinds and roads
// use `headless.mjs --crash-log` and tools/crashmap.mjs.
// A run whose mean city size is under COLLAPSE cars (default 30: the economy
// has died back to its floor) is counted as collapsed and left out of the second figure.
//
//   node tools/crashkinds.mjs "runs/trial-hand-barcelona-base-d6-s{s}" "runs/trial-hand-barcelona-twoway-base-d6-s{s}"
//   SEEDS=20 FROM=2 DAYS=6 (defaults); the seeds are 101..
import fs from "node:fs";

export function arm(pattern, seeds, from, days, collapse = 30) {
  const sum = { crashes: 0, pairs: 0, trips: 0, cars: 0, runs: 0, perSeed: [] };
  for (const s of seeds) {
    const f = pattern.replace("{s}", s);
    if (!fs.existsSync(`${f}/telemetry.jsonl`)) continue;
    const rows = fs.readFileSync(`${f}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter((x) => x.tick > from * 86400 && x.tick <= days * 86400);
    const r = { crashes: 0, pairs: 0, trips: 0, cars: 0 };
    for (const x of rows) { r.crashes += x.crashes; r.pairs += x.carCrashes; r.trips += x.trips; r.cars += x.cars / rows.length; }
    for (const k of ["crashes", "pairs", "trips", "cars"]) sum[k] += r[k];
    sum.runs++; sum.perSeed.push({ seed: s, ...r, collapsed: r.cars < collapse });
  }
  return sum;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +(process.env.SEEDS || 20), from = +(process.env.FROM || 2), days = +(process.env.DAYS || 6);
  const seeds = Array.from({ length: n }, (_, i) => 101 + i);
  for (const pattern of process.argv.slice(2)) {
    const a = arm(pattern, seeds, from, days, +(process.env.COLLAPSE || 30)), d = days - from;
    const pc = (k) => (a[k] / (a.cars * d)).toFixed(3);
    console.log(`${pattern}: ${a.runs} runs, per seed and day: crashes ${(a.crashes / a.runs / d).toFixed(1)}, car-car pairs ${(a.pairs / a.runs / d).toFixed(1)}, trips ${(a.trips / a.runs / d).toFixed(1)}, cars ${(a.cars / a.runs).toFixed(1)}; crashes per car and day ${pc("crashes")}`);
    const live = a.perSeed.filter((x) => !x.collapsed), lc = live.reduce((t, x) => t + x.cars, 0) * d, lk = live.reduce((t, x) => t + x.crashes, 0);
    console.log(`  collapsed (under ${process.env.COLLAPSE || 30} cars): ${a.perSeed.length - live.length} of ${a.runs}; the other ${live.length}: ${(lk / lc).toFixed(1)} crashes per car and day`);
  }
}
