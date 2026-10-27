import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Brain drain: at the end of every day the best-earning SHARE of the cars
// (earnings per hour of life, at least an hour old) leave the city for good.
// They are taken off the road as if broke, so they count among the day's
// deaths. Fares a day and cars at dawn, with and without the drain; without
// it these are exactly the runs inh-base-s*.
//
//   SHARE=0.1 node tools/drain.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.1), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const drain of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const rows = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips;
      w.step();
      fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
    }
    let left = 0;
    if (drain && day < days) {
      const rate = (d) => d.earned / (w.tick - d.born);
      const old = w.cars.filter((d) => w.tick - d.born >= 3600).sort((a, b) => rate(b) - rate(a));
      for (const d of old.slice(0, Math.round(share * w.cars.length))) { d.cash = -1e9; left++; }
    }
    rows.push(`d${day} fares ${fares} cars ${w.cars.length}${left ? ` (${left} leave)` : ""}`);
  }
  console.log(`${map} s${seed} ${drain ? "drain" : "none "} ${rows.join(" | ")}`);
}
