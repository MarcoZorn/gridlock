import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Social mobility: does a rich car's child earn well too? Every car's
// lifetime earnings per hour, paired with its parent's; the rank correlation
// is the intergenerational elasticity, and the quintile table says how often
// a child of the bottom fifth reaches the top fifth.
//
//   DAYS=4 IMITATE=0.3 node tools/mobility.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
ECON.imitate = +(process.env.IMITATE || 0);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
const rate = new Map(), parent = new Map(), born = new Map(), hour = 60 / DT;   // a city hour is a minute of simulation
for (let t = 0; t < (+process.env.DAYS || 4) * DAY / DT; t++) {
  w.step();
  if (t % 600) continue;
  for (const d of w.cars) {
    parent.set(d.id, d.parent); born.set(d.id, d.born);
    if (w.tick - d.born > hour) rate.set(d.id, d.earned / (w.tick - d.born) * hour);
  }
}
// Ranked against cars born the same quarter-day, so a parent is compared with
// its own cohort and a child with its own: earnings drift as the economy grows.
const cohort = (id) => Math.floor(born.get(id) / (DAY / DT / 4));
const groups = new Map();
for (const [id, r] of rate) { const c = cohort(id); if (!groups.has(c)) groups.set(c, []); groups.get(c).push([r, id]); }
const pct = new Map();
for (const g of groups.values()) { g.sort((a, b) => a[0] - b[0]); g.forEach(([, id], k) => pct.set(id, g.length > 1 ? k / (g.length - 1) : 0.5)); }
const kids = [...rate.keys()].filter((id) => rate.has(parent.get(id)) && born.get(id) > DAY / DT);
const pr = kids.map((id) => pct.get(parent.get(id))), cr = kids.map((id) => pct.get(id));
const n = kids.length, mean = 0.5;
let sxy = 0, sxx = 0, syy = 0;
for (let i = 0; i < n; i++) { sxy += (pr[i] - mean) * (cr[i] - mean); sxx += (pr[i] - mean) ** 2; syy += (cr[i] - mean) ** 2; }
const q = (x) => Math.min(4, Math.floor(x * 5));
// parents are sorted into fifths among parents: only cars with cash breed, so
// few parents come from the bottom of their own cohort
const ps = [...pr].sort((a, b) => a - b), cut = (k) => ps[Math.floor(k * (n - 1))];
const all = kids.map((_, i) => i), bottom = all.filter((i) => pr[i] <= cut(0.2)), top = all.filter((i) => pr[i] >= cut(0.8));
const share = (ids, k) => (100 * ids.filter((i) => q(cr[i]) === k).length / Math.max(1, ids.length)).toFixed(0);
console.log(`${map} s${seed} imitate ${ECON.imitate}: ${n} parent-child pairs, lowest parent ${(100 * ps[0]).toFixed(0)}th percentile, rank correlation ${(sxy / Math.sqrt(sxx * syy)).toFixed(2)}; bottom-fifth parents: ${share(bottom, 0)}% children bottom, ${share(bottom, 4)}% top; top-fifth parents: ${share(top, 4)}% children top`);
