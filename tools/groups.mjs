import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Group selection between whole cities: four Turin economies (seeds 3, 5,
// 7, 11) run side by side, and at the end of every day the one that carried
// the fewest fares that day is replaced by a copy of the one that carried
// the most, with fresh random numbers so the two go their own ways (and its
// cars set off from new places, as on any resume). Fares a day per city.
// Without the replacement these are exactly the runs inh-base-s3 ... s11.
//
//   DAYS=6 node tools/groups.mjs turin
const [map = "turin"] = process.argv.slice(2), days = +(process.env.DAYS || 6), seeds = [3, 5, 7, 11];
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
let cities = seeds.map((seed) => new EcoWorld({ seed, founders, graph }));
const perDay = DAY / DT;
for (let day = 1; day <= days; day++) {
  const fares = cities.map((w) => {
    let n = 0, last = w.events.trips;
    for (let t = 0; t < perDay; t++) {
      w.step();
      n += w.events.trips >= last ? w.events.trips - last : w.events.trips;   // events reset every telemetry row
      last = w.events.trips;
    }
    return n;
  });
  const lo = fares.indexOf(Math.min(...fares)), hi = fares.indexOf(Math.max(...fares));
  console.log(`day ${day}: fares ${fares.join(" ")}, cars ${cities.map((w) => w.cars.length).join(" ")}; city ${lo} becomes a copy of city ${hi}`);
  if (day < days && lo !== hi) {
    const copy = EcoWorld.fromJSON(JSON.parse(JSON.stringify(cities[hi].toJSON())));
    copy.rng.s = (cities[lo].rng.s ^ 0x9e3779b9) >>> 0;
    cities[lo] = copy;
  }
}
