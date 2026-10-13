import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { Genome } from "../src/genome.js";
// The shipped drivers in twelve unseen cities, with one group of inputs held
// at a neutral value, to see which senses they actually drive by.
//
//   node tools/ablate.mjs none|walls|cars|closing|speed|heading|lateral|junction|turn
const GROUPS = {
  none: [],
  walls: [0, 3, 6, 9, 12].map((i) => [i, 1]),
  cars: [1, 4, 7, 10, 13].map((i) => [i, 1]),
  closing: [2, 5, 8, 11, 14].map((i) => [i, 0]),
  speed: [[15, 0.4]],
  heading: [[16, 0]],
  lateral: [[17, 0]],
  junction: [[18, 1]],
  turn: [[19, 0]],
};
const name = process.argv[2] || "none", mask = GROUPS[name];
if (!mask) { console.error(`groups: ${Object.keys(GROUPS).join(" ")}`); process.exit(1); }
const act = Genome.prototype.activate;
const buf = new Float64Array(64);
Genome.prototype.activate = function (inp, out) {
  if (!mask.length) return act.call(this, inp, out);
  buf.set(inp);
  for (const [i, v] of mask) buf[i] = v;
  return act.call(this, buf, out);
};
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
let trips = 0, crashes = 0, n = 0, km = 0;
for (const seed of [77, 91]) {
  const e = new CityWorld({ seed, popSize: 120, traffic: true, density: 40 });
  for (let g = 0; g < 6; g++) {
    e.pop.genomes = pop.genomes; e.pop.generation = g; e.newGeneration();
    while (e.step()) {}
    for (const c of [...e.finished, ...e.cars]) { trips += c.trips; crashes += c.crashes; km += c.dist; n++; }
  }
}
console.log(name.padEnd(9), `trips/car ${(trips / n).toFixed(2)}  crashes per 1000 units ${(1000 * crashes / km).toFixed(2)}  distance/car ${(km / n).toFixed(0)}`);
