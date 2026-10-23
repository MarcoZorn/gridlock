import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Evolutionary rescue: the city switches every junction to traffic lights on
// the morning of day three, under a population raised without them. Does it
// adapt and recover, or collapse? Fares a day against the same economy
// without lights, and one that had them from the start.
//
//   node tools/rescue.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = 8, perDay = DAY / DT;
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
for (const [name, from] of [["no lights", -1], ["lights from day 3", 3], ["lights from the start", 0]]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph(), control: from === 0 ? "lights" : "none" });
  const fares = Array(days).fill(0), cars = Array(days).fill(0);
  let last = 0;
  for (let t = 0; t < days * perDay; t++) {
    if (t === from * perDay && from > 0) w.control = "lights";
    w.step();
    const d = Math.floor(t / perDay), now = w.events.trips;
    fares[d] += now >= last ? now - last : now; last = now;
    if (t % perDay === perDay - 1) cars[d] = w.cars.length;
  }
  console.log(`${map} s${seed} ${name.padEnd(21)} fares by day ${fares.join(" ")} | cars ${cars.join(" ")}`);
}
