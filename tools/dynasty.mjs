import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Dynasties: how long do rich families stay rich? A family is everyone
// descended from one founder (or immigrant). Each day, every family's fares
// and how many cars it has; the families richest on day 1 are followed after.
// Earnings are not inherited car to car (tools/mobility.mjs), so a family can
// only stay rich by being big.
//
//   DAYS=8 node tools/dynasty.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const days = +process.env.DAYS || 8, TOP = 5;
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
// a car's family is fixed at birth: its parent's (the parent is alive then),
// or its own if it is a founder or an immigrant
const family = new Map();
const root = (d) => { if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return family.get(d.id); };
for (const d of w.cars) root(d);
const spawn = w.spawn.bind(w);
w.spawn = (...a) => { const d = spawn(...a); root(d); return d; };
const seen = new Map(), paid = new Map();   // car -> last earned seen, earned already counted
const rows = [];
for (let day = 0; day < days; day++) {
  const fam = new Map(), cars = new Map();
  for (let t = 0; t < DAY / DT; t++) {
    w.step();
    if (t % 300) continue;
    for (const d of w.cars) { root(d); seen.set(d.id, d.earned); }
  }
  // ponytail: a car's fares after its last sample are lost, at most 300 ticks
  for (const [id, e] of seen) {
    const f = family.get(id), got = e - (paid.get(id) || 0);
    paid.set(id, e);
    if (got > 0) fam.set(f, (fam.get(f) || 0) + got);
  }
  for (const d of w.cars) { const f = root(d); cars.set(f, (cars.get(f) || 0) + 1); }
  seen.clear();
  rows.push({ fam, cars });
}
const rank = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([f]) => f);
const total = (m) => [...m.values()].reduce((s, x) => s + x, 0);
const first = rank(rows[0].fam).slice(0, TOP);
console.log(`${map} s${seed}: day | families earning | top-${TOP} of day 1: still top-${TOP}, share of fares, share of cars, fares per car vs rest`);
rows.forEach(({ fam, cars }, k) => {
  const top = new Set(rank(fam).slice(0, TOP)), F = total(fam), C = total(cars);
  const fe = first.reduce((s, f) => s + (fam.get(f) || 0), 0), fc = first.reduce((s, f) => s + (cars.get(f) || 0), 0);
  const per = fc && C > fc ? (fe / fc) / ((F - fe) / (C - fc)) : NaN;
  console.log(`${k + 1} | ${fam.size} | ${first.filter((f) => top.has(f)).length}, ${(100 * fe / F).toFixed(0)}%, ${(100 * fc / C).toFixed(0)}%, ${per.toFixed(2)}`);
});
