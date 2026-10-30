// Which runs collapse, and when? A run has collapsed when it ends with FLOOR cars
// (default 30) or fewer. For each run of a pattern, over seeds 101.., the peak
// number of cars and the day it came, the day the city last had more than FLOOR
// cars, and (for collapsed runs) what the day before that looked like: crashes
// per car, mean cash, births and immigrants per day. Then the first day of the collapsed runs
// (trips, births, deaths, immigrants) next to the others'.
//
//   node tools/collapse.mjs "runs/trial-hand-turin-base-d6-s{s}"   (SEEDS=20 FLOOR=30)
import fs from "node:fs";

export function look(rows, floor) {
  const peak = rows.reduce((a, x) => (x.cars > a.cars ? x : a), rows[0]);
  const above = rows.filter((x) => x.cars > floor), last = above.at(-1) || null;
  const end = rows.at(-1), collapsed = end.cars <= floor;
  const day = (x) => (x.tick / 86400);
  const d1 = rows.filter((x) => x.tick <= 86400), sum = (f) => d1.reduce((a, x) => a + x[f], 0);
  const out = { collapsed, peak: peak.cars, peakDay: day(peak), lastAbove: last ? day(last) : null, endCars: end.cars, day1: { trips: sum("trips"), births: sum("births"), deaths: sum("deaths"), immigrants: sum("immigrants") } };
  if (collapsed && last) {
    const w = rows.filter((x) => x.tick > last.tick - 86400 && x.tick <= last.tick), n = Math.max(1, w.length);
    out.before = { crashesPerCar: w.reduce((a, x) => a + x.crashes / Math.max(1, x.cars), 0) / n, cash: w.reduce((a, x) => a + x.cash, 0) / n, births: w.reduce((a, x) => a + x.births, 0), deaths: w.reduce((a, x) => a + x.deaths, 0), immigrants: w.reduce((a, x) => a + x.immigrants, 0) };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pat = process.argv[2], n = +(process.env.SEEDS || 20), floor = +(process.env.FLOOR || 30), rs = [];
  for (let i = 0; i < n; i++) {
    const f = `${pat.replace("{s}", 101 + i)}/telemetry.jsonl`;
    if (fs.existsSync(f)) rs.push({ seed: 101 + i, ...look(fs.readFileSync(f, "utf8").trim().split("\n").map(JSON.parse), floor) });
  }
  const c = rs.filter((r) => r.collapsed);
  console.log(`${pat}: ${c.length} of ${rs.length} runs end with ${floor} cars or fewer`);
  for (const r of c) console.log(`  seed ${r.seed}: peak ${r.peak} cars on day ${r.peakDay.toFixed(1)}, last above ${floor} on day ${r.lastAbove === null ? "never" : r.lastAbove.toFixed(1)}${r.before ? `; the day before: ${r.before.deaths} deaths, ${r.before.births} births, ${r.before.immigrants} immigrants, mean cash ${r.before.cash.toFixed(1)}` : ""}`);
  const ok = rs.filter((r) => !r.collapsed);
  const mean = (xs, k) => (xs.reduce((a, r) => a + r.day1[k], 0) / Math.max(1, xs.length)).toFixed(1);
  for (const [name, xs] of [["collapsed", c], ["the others", ok]]) if (xs.length) console.log(`  day 1, ${name} (mean over ${xs.length}): ${["trips", "births", "deaths", "immigrants"].map((k) => `${k} ${mean(xs, k)}`).join(", ")}`);
  if (ok.length) console.log(`  the other ${ok.length}: peak cars ${(ok.reduce((a, r) => a + r.peak, 0) / ok.length).toFixed(0)} on average, end ${(ok.reduce((a, r) => a + r.endCars, 0) / ok.length).toFixed(0)}`);
}
