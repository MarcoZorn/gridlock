import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { LIGHT } from "../src/city.js";
import { Population } from "../src/neat.js";
import { Rng } from "../src/neat.js";
// Evolve one city's traffic light timings: a (1+1) search over the offsets of
// its lights, with the lights-raised drivers fixed, then tested on traffic
// the search never saw.
//
//   node tools/lightsopt.mjs 91
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained-lights.json", "utf8")).pop);
const run = (offsets, gen) => {
  const e = new CityWorld({ seed: +(process.argv[2] || 77), cities: 1, popSize: 120, traffic: true, density: 40, control: "lights" });
  e.pop.genomes = pop.genomes; e.pop.generation = gen; e.newGeneration();
  const lit = e.city.nodes.filter((n) => n.light);
  if (offsets) lit.forEach((n, i) => (n.light.offset = offsets[i]));
  while (e.step()) {}
  let trips = 0; for (const c of [...e.finished, ...e.cars]) trips += c.trips;
  return { trips, lit };
};
const base = run(null, 0);
let best = base.lit.map((n) => n.light.offset), bestScore = base.trips;
const rng = new Rng(5);
for (let it = 0; it < 60; it++) {
  const cand = best.slice();
  for (let k = 0; k < 3; k++) cand[rng.int(cand.length)] = rng.range(0, LIGHT.cycle);
  const s = run(cand, 0).trips;
  if (s >= bestScore) { best = cand; bestScore = s; }
}
// the test: the same city, traffic it was not tuned on
let tBase = 0, tBest = 0;
for (const g of [1, 2, 3, 4]) { tBase += run(null, g).trips; tBest += run(best, g).trips; }
console.log(`city ${process.argv[2] || 77}: tuned on: ${base.trips} -> ${bestScore} trips;  fresh traffic (4 generations): random offsets ${tBase}, evolved offsets ${tBest} (${(100 * (tBest / tBase - 1)).toFixed(1)}%)`);
