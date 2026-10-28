import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Pedestrian crossings placed by the pedestrians' own deaths. A crossing is
// a slow zone: a speed camera at LIMIT on its road (as in tools/limits.mjs),
// so drivers that rush it pay, and selection does the rest. Every night
// CROSSINGS new ones go on the roads where most people were hit that day;
// against as many on random roads, and against none. Each day: people hit,
// crossings made, fares, and crossings placed so far.
//
//   CROSSINGS=10 node tools/zebra.mjs turin 7     (ARMS=deaths for one arm)
const [map = "turin", seed = 7] = process.argv.slice(2);
const per = +(process.env.CROSSINGS || 10), limit = +(process.env.LIMIT || 35), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const arm of (process.env.ARMS || "none,random,deaths").split(",")) {
  const w = new EcoWorld({ seed: +seed, founders, pedestrians: 40, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, rng = new Rng(+seed + 99);
  w.limits = new Array(c.edges.length).fill(0);
  let hits = new Map();
  w.onPair = (a, b) => { const p = a.isPed ? a : b.isPed ? b : null; if (p) hits.set(p.edge.id, (hits.get(p.edge.id) || 0) + 1); };
  const out = [];
  let placed = 0;
  for (let day = 1; day <= days; day++) {
    if (day > 1 && arm !== "none") {
      const free = c.edges.filter((e) => !w.limits[e.id]);
      const pick = arm === "random"
        ? Array.from({ length: per }, () => free.splice(rng.int(free.length), 1)[0])
        : free.filter((e) => hits.get(e.id)).sort((p, q) => hits.get(q.id) - hits.get(p.id)).slice(0, per);
      for (const e of pick) { w.limits[e.id] = limit; placed++; }
    }
    hits = new Map();
    let fares = 0, hit = 0, crossed = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips, h = w.crowd.events.hit, x = w.crowd.events.crossings;
      w.step();
      fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      hit += w.crowd.events.hit >= h ? w.crowd.events.hit - h : w.crowd.events.hit;
      crossed += w.crowd.events.crossings >= x ? w.crowd.events.crossings - x : w.crowd.events.crossings;
    }
    out.push(`${hit}/${crossed} ${fares}`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(6)} +${placed}: ${out.join(" | ")}`);
}
