import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Which junctions should have a light? One gene per junction that can have
// one: light or no light (a junction without one is always green). A (1+1)
// search flips a few at a time and keeps the change when the lights-raised
// drivers, fixed, make at least as many trips, less W per crash; then the
// best set is tried on traffic the search never saw, against lights at
// every junction and at none.
//
//   ITERS=60 W=0 node tools/lightswhere.mjs 91
const seed = +(process.argv[2] || 91), iters = +(process.env.ITERS || 60), W = +(process.env.W || 0);
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained-lights.json", "utf8")).pop);
const run = (genes, gen) => {
  const e = new CityWorld({ seed, cities: 1, popSize: 120, traffic: true, density: 40, control: "lights" });
  e.pop.genomes = pop.genomes; e.pop.generation = gen; e.newGeneration();
  const lit = e.city.nodes.filter((n) => n.light);
  if (genes) lit.forEach((n, i) => { if (!genes[i]) n.light = null; });
  while (e.step()) {}
  let trips = 0, crashes = 0;
  for (const c of [...e.finished, ...e.cars]) { trips += c.trips; crashes += c.crashes; }
  return { trips, crashes, n: lit.length };
};
const score = (r) => r.trips - W * r.crashes;
const n = run(null, 0).n, rng = new Rng(seed);
const all = Array(n).fill(1), none = Array(n).fill(0);
let best = all.slice(), bestR = run(best, 0);
for (let it = 0; it < iters; it++) {
  const cand = best.slice();
  for (let k = 1 + rng.int(3); k > 0; k--) { const i = rng.int(n); cand[i] ^= 1; }
  const r = run(cand, 0);
  if (score(r) >= score(bestR)) { best = cand; bestR = r; }
}
// unseen traffic: other generations' waves, the same drivers
const test = (g) => [1, 2, 3, 4].map((gen) => run(g, gen)).reduce((a, r) => ({ trips: a.trips + r.trips, crashes: a.crashes + r.crashes }), { trips: 0, crashes: 0 });
const fmt = (r) => `${r.trips} trips ${r.crashes} crashes`;
console.log(`city ${seed} W ${W}: ${best.filter(Boolean).length} of ${n} junctions keep a light; unseen traffic: all lights ${fmt(test(all))}; none ${fmt(test(none))}; evolved ${fmt(test(best))}`);
