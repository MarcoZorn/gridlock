import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { Genome } from "../src/genome.js";
import { BODY } from "../src/driver.js";
if (process.env.TOW) BODY.towTicks = +process.env.TOW;
if (process.env.WRECKS) BODY.wrecks = 1;
// How much intelligence does traffic have collectively? One way to put a
// number on it: the part of the city's work that exists only because the
// drivers see each other. The shipped drivers in the two unseen cities of
// tools/fundamental.mjs, at a density, either as they are or blind to other
// cars (car distance held at nothing seen, closing at zero, as in
// tools/ablate.mjs). Trips per car a minute, crashes per 1000 units. Run
// at density 1 for a car alone; then (seeing - blind) / (alone - blind) is the
// share of what crowding costs that the drivers win back by reacting.
//
//   node tools/collective.mjs 120 seeing|blind     (WRECKS=1 TOW=600 as there)
const density = +process.argv[2], mode = process.argv[3] || "seeing";
if (mode === "blind") {
  const act = Genome.prototype.activate;
  Genome.prototype.activate = function (inp, out) {
    for (const i of [1, 4, 7, 10, 13]) inp[i] = 1;
    for (const i of [2, 5, 8, 11, 14]) inp[i] = 0;
    return act.call(this, inp, out);
  };
}
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
let dist = 0, carTicks = 0, trips = 0, crashes = 0;
for (const seed of [77, 91]) {
  const size = Math.max(120, density), genomes = Array.from({ length: size }, (_, i) => pop.genomes[i % pop.genomes.length]);
  const e = new CityWorld({ seed, popSize: size, traffic: true, density });
  for (let g = 0; g < 3; g++) {
    e.pop.genomes = genomes; e.pop.generation = g; e.newGeneration();
    while (e.step());
    for (const c of [...e.finished, ...e.cars]) { dist += c.dist; carTicks += c.ticks; trips += c.trips; crashes += c.crashes; }
  }
}
console.log(`density ${density} ${mode}: trips per car a minute ${(3600 * trips / carTicks).toFixed(2)}  crashes per 1000 units ${(1000 * crashes / dist).toFixed(2)}`);
