import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { BODY } from "../src/driver.js";
if (process.env.TOW) BODY.towTicks = +process.env.TOW;
if (process.env.WRECKS) BODY.wrecks = 1;
// Flow against density, the fundamental diagram of traffic: the shipped
// drivers in two unseen cities with more and more cars on the road at once.
// TOW=10 shortens the tow (normally 120 ticks); WRECKS=1 leaves crashed cars
// on the road, solid, until they are towed.
//
//   node tools/fundamental.mjs 120
const density = +process.argv[2];
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
let dist = 0, carTicks = 0, ticks = 0, trips = 0, crashes = 0, towed = 0, onRoad = 0;
for (const seed of [77, 91]) {
  const size = Math.max(120, density), genomes = Array.from({ length: size }, (_, i) => pop.genomes[i % pop.genomes.length]);
  const e = new CityWorld({ seed, popSize: size, traffic: true, density });
  for (let g = 0; g < 3; g++) {
    e.pop.genomes = genomes; e.pop.generation = g; e.newGeneration();
    while (e.step()) { ticks++; if (ticks % 20 === 0) for (const c of e.cars) if (c.alive) { onRoad++; if (c.towing > 0) towed++; } }
    for (const c of [...e.finished, ...e.cars]) { dist += c.dist; carTicks += c.ticks; trips += c.trips; crashes += c.crashes; }
  }
}
// flow: distance driven per tick by everyone together; speed: per car
console.log(`density ${String(density).padStart(3)}  flow ${(dist / ticks).toFixed(1)}  mean speed ${(60 * dist / carTicks).toFixed(1)}  trips per minute ${(3600 * trips / ticks).toFixed(1)}  crashes per 1000 units ${(1000 * crashes / dist).toFixed(2)}  being towed ${(100 * towed / onRoad).toFixed(0)}%`);
