import fs from "node:fs";
import { EcoWorld, DAY, gini } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A city that remembers: roads wear out where traffic is heavy. Every road
// wears by the distance driven on it; day one, with no wear, sets the scale,
// and from then on a road whose wear passes K times the average road's day
// closes for REPAIR hours (driven only where there is no other way, as with
// any closure) and reopens as new. The busiest roads go first, and their
// traffic spills onto the rest. Against roads that never wear: each day,
// fares, seconds a fare, repairs started, and the Gini of distance per road.
//
//   K=5 REPAIR=2 node tools/wear.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const K = +(process.env.K || 5), repair = +(process.env.REPAIR || 2);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT, hour = Math.round(perDay / 24);
for (const arm of ["new", "wear"]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, E = c.edges.length, wear = new Float64Array(E), used = new Float64Array(E), until = new Float64Array(E);
  let limit = Infinity;
  const out = [];
  for (let day = 1; day <= days; day++) {
    used.fill(0);
    let fares = 0, ticks = 0, started = 0;
    for (let t = 0; t < perDay; t++) {
      const ev = w.events, f = ev.trips, k = ev.tripTicks;
      w.step();
      const nv = w.events, fresh = nv !== ev;   // events are reset now and then inside step()
      fares += fresh ? nv.trips : nv.trips - f;
      ticks += fresh ? nv.tripTicks : nv.tripTicks - k;
      for (const d of w.cars) {
        const e = d.route && c.edgeBetween(d.route[d.seg], d.route[d.seg + 1]);
        if (e) { const s = Math.abs(d.v) * DT; used[e.id] += s; wear[e.id] += s; }
      }
      if (arm === "wear" && (t + 1) % hour === 0) {
        let edited = false;
        for (let i = 0; i < E; i++) {
          if (until[i] && w.tick >= until[i]) { until[i] = 0; wear[i] = 0; c.closed.delete(i); edited = true; }
          else if (!until[i] && wear[i] > limit) { until[i] = w.tick + repair * hour; c.closed.add(i); started++; edited = true; }
        }
        if (edited) w.cityEdited();
      }
    }
    if (day === 1) { limit = K * used.reduce((a, b) => a + b, 0) / E; wear.fill(0); }
    out.push(`${fares} ${Math.round((ticks / Math.max(1, fares)) * DT)}s r${started} g${gini([...used]).toFixed(2)}`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(4)}: ${out.join(" | ")}`);
}
