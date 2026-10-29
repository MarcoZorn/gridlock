import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Pedestrians who become drivers when rich. A pedestrian's wealth is the
// crossings it has survived; at RICH of them it buys a car and leaves the
// crowd, joining the economy as a newcomer (a founder's brain, its own
// cash, like any immigrant: walking teaches nothing about driving). The
// crowd's best crossers keep leaving: does it get worse at crossing, and
// does the city fill with cars? Each day: people hit per 100 crossings,
// people, promotions, cars, fares; against pedestrians who stay on foot.
//
//   RICH=20 node tools/promote.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6), rich = +(process.env.RICH || 20);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const arm of ["stay", "promote"]) {
  const w = new EcoWorld({ seed: +seed, founders, pedestrians: 40, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, hit = 0, crossed = 0, up = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips, ce = w.crowd.events, h = ce.hit, x = ce.crossings;
      w.step();
      fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      const ne = w.crowd.events, fresh = ne !== ce;   // reset at dawn
      hit += fresh ? ne.hit : ne.hit - h;
      crossed += fresh ? ne.crossings : ne.crossings - x;
      if (arm === "promote") {
        const room = ECON.maxCars * w.scale - w.cars.length;
        const leaving = w.crowd.people.filter((p) => p.crossings >= rich).slice(0, Math.max(0, room));
        if (leaving.length) {
          const gone = new Set(leaving);
          w.crowd.people = w.crowd.people.filter((p) => !gone.has(p));
          for (let i = 0; i < leaving.length; i++) w.immigrate();
          up += leaving.length;
        }
      }
    }
    out.push(`${((100 * hit) / Math.max(1, crossed)).toFixed(1)}/100 ${w.crowd.people.length}p +${up} ${w.cars.length}c ${fares}`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(7)}: ${out.join(" | ")}`);
}
