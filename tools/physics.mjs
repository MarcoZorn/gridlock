import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { BODY } from "../src/driver.js";
import { Population, Rng } from "../src/neat.js";
// Evolve the simulator's physics until the drivers stop crashing: the
// shipped drivers stay as they are, and a (1+1) search changes the world
// they drive in, multiplying acceleration, braking, drag, top speed and
// turning by factors between a quarter and four. A change is kept when it
// lowers crashes per 1000 units driven without losing more than a tenth of
// the trips (else the answer is a world where nobody moves). Then tried on
// traffic the search never saw.
//
//   ITERS=60 node tools/physics.mjs 91
//   ONLY=turnRate=3.5 node tools/physics.mjs 91    (no search: just these factors)
const seed = +(process.argv[2] || 91), iters = +(process.env.ITERS || 60);
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const KNOBS = ["accel", "brake", "drag", "maxSpeed", "turnRate"], base = Object.fromEntries(KNOBS.map((k) => [k, BODY[k]]));
const run = (f, gen) => {
  KNOBS.forEach((k, i) => (BODY[k] = base[k] * f[i]));
  const e = new CityWorld({ seed, cities: 1, popSize: 120, traffic: true, density: 40 });
  e.pop.genomes = pop.genomes; e.pop.generation = gen; e.newGeneration();
  while (e.step()) {}
  let trips = 0, crashes = 0, dist = 0;
  for (const c of [...e.finished, ...e.cars]) { trips += c.trips; crashes += c.crashes; dist += c.dist; }
  KNOBS.forEach((k) => (BODY[k] = base[k]));
  return { trips, crashes, dist, rate: (1000 * crashes) / Math.max(1, dist) };
};
const test = (f) => [1, 2, 3, 4].map((g) => run(f, g)).reduce((a, r) => ({ trips: a.trips + r.trips, crashes: a.crashes + r.crashes, dist: a.dist + r.dist }), { trips: 0, crashes: 0, dist: 0 });
const fmt = (r) => `${r.trips} trips, ${((1000 * r.crashes) / r.dist).toFixed(2)} crashes per 1000 units`;
const one = KNOBS.map(() => 1);
if (process.env.ONLY) {
  const set = Object.fromEntries(process.env.ONLY.split(",").map((kv) => kv.split("=")));
  const f = KNOBS.map((k) => +(set[k] || 1));
  console.log(`city ${seed} unseen traffic: as built ${fmt(test(one))}; ${process.env.ONLY} ${fmt(test(f))}`);
  process.exit(0);
}
const rng = new Rng(seed), start = run(one, 0);
let best = one.slice(), bestR = start;
for (let it = 0; it < iters; it++) {
  const cand = best.map((x) => (rng.next() < 0.4 ? Math.max(0.25, Math.min(4, x * Math.exp(rng.normal() * 0.3))) : x));
  const r = run(cand, 0);
  if (r.trips >= 0.9 * start.trips && r.rate <= bestR.rate) { best = cand; bestR = r; }
}
console.log(`city ${seed}: evolved physics ${KNOBS.map((k, i) => `${k} x${best[i].toFixed(2)}`).join(", ")}`);
console.log(`unseen traffic: as built ${fmt(test(one))}; evolved ${fmt(test(best))}`);
