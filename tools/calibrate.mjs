import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Travel times against the real city's own speed limits. Every passenger
// fare is timed, and set against the time it would take at the posted limit
// on each road of its route (OSM maxspeed; where untagged, 50 km/h, the
// Italian urban default, or DEFAULT=40 for New York's 25 mph; a unit is
// 0.4 m). The ratio less one is the extra travel time, the way traffic
// indices (TomTom's congestion level) put it, though theirs is against
// observed free flow, not the limit. Per day:
// median and mean of time / limit time, and the share of fares faster than
// the limit allows.
//
//   DAYS=4 node tools/calibrate.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 4);
const graph = JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const w = new EcoWorld({ seed: +seed, founders, graph });
const c = w.city, limit = new Map(graph.maxspeed || []), fallback = +(process.env.DEFAULT || 50);
const newJob = w.newJob.bind(w), pay = w.pay.bind(w);
let ratios = [];
w.newJob = (d, first) => {
  newJob(d, first);
  if (d.job.kind !== "passenger") return;
  let t = 0;
  for (let i = 1; i < d.route.length; i++) {
    const e = c.edgeBetween(d.route[i - 1], d.route[i]);
    if (e) t += (e.len * 0.4) / ((limit.get(e.id) || fallback) / 3.6);
  }
  d.job.limitT = t;
};
w.pay = (d) => {
  const j = d.job;
  if (j && j.limitT > 0) ratios.push(((w.tick - j.start) * DT) / j.limitT);
  pay(d);
};
const rows = [];
for (let day = 1; day <= days; day++) {
  ratios = [];
  for (let t = 0; t < DAY / DT; t++) w.step();
  ratios.sort((a, b) => a - b);
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length, med = ratios[ratios.length >> 1];
  rows.push(`d${day} n${ratios.length} median ${med.toFixed(2)} mean ${mean.toFixed(2)} faster ${Math.round((100 * ratios.filter((r) => r < 1).length) / ratios.length)}%`);
}
console.log(`${map} s${seed}: ${rows.join(" | ")}`);
