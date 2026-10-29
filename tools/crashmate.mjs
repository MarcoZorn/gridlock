import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Sex only on crashing, literally: with ECON.crashMate a car may have a
// child only after it has hit another car, and the child is a cross of the
// two. A crash still costs what it always did. Does the city breed
// crashers? Each day: fares, car-on-car crashes per 1000 units driven,
// births, cars; against the usual rule.
//
//   node tools/crashmate.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const on of [0, 1]) {
  ECON.crashMate = on;
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, hits = 0, births = 0, dist = 0;
    for (let t = 0; t < perDay; t++) {
      const e = w.events, f = e.trips, k = e.carCrashes, b = e.births;
      w.step();
      const n = w.events, fresh = n !== e;   // events are reset now and then inside step()
      fares += fresh ? n.trips : n.trips - f;
      hits += fresh ? n.carCrashes : n.carCrashes - k;
      births += fresh ? n.births : n.births - b;
      for (const d of w.cars) dist += Math.abs(d.v) * DT;
    }
    out.push(`${fares} ${(1000 * hits / dist).toFixed(2)} b${births} ${w.cars.length}c`);
  }
  console.log(`${map} s${seed} ${on ? "crashMate" : "usual    "}: ${out.join(" | ")}`);
}
ECON.crashMate = 0;
