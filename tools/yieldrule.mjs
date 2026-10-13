import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { Genome } from "../src/genome.js";
// Does yielding pay? The shipped drivers, with or without a coded rule bolted
//
//   node tools/yieldrule.mjs none|rule|wide
//
// on: near a junction, if a side ray sees a car closing in, brake hard.
const mode = process.argv[2] || "none";
const act = Genome.prototype.activate;
let forced = 0, calls = 0;
if (mode !== "none") Genome.prototype.activate = function (inp, out) {
  act.call(this, inp, out);
  calls++;
  const nearJunction = inp[18] < (mode === "wide" ? 0.5 : 0.3);
  // rays 0,1 and 3,4 look left and right of the nose; car distance is 3i+1, closing 3i+2
  const side = [0, 1, 3, 4].some((i) => inp[3 * i + 1] < 0.5 && inp[3 * i + 2] > 0.05);
  if (nearJunction && side) { out[1] = -1; forced++; }
  return out;
};
// POP=runs/x/state.json MAP=crossroads to try another population on another map
const pop = Population.fromJSON(JSON.parse(fs.readFileSync(process.env.POP || "docs/trained.json", "utf8")).pop);
const graph = process.env.MAP ? JSON.parse(fs.readFileSync(`maps/${process.env.MAP}.json`, "utf8")) : null;
let trips = 0, crashes = 0, n = 0, km = 0, fit = 0;
for (const seed of [77, 91, 101]) {
  const e = new CityWorld({ seed, popSize: 120, traffic: true, density: 40, graph });
  for (let g = 0; g < 6; g++) {
    e.pop.genomes = pop.genomes; e.pop.generation = g; e.newGeneration();
    while (e.step()) {}
    for (const c of [...e.finished, ...e.cars]) { trips += c.trips; crashes += c.crashes; km += c.dist; fit += c.fitness(); n++; }
  }
}
console.log(mode.padEnd(6), `fitness ${(fit / n).toFixed(0)}  trips/car ${(trips / n).toFixed(2)}  crashes/car ${(crashes / n).toFixed(2)}  crashes per 1000 units ${(1000 * crashes / km).toFixed(2)}  rule fired ${(100 * forced / Math.max(1, calls)).toFixed(1)}% of ticks`);
