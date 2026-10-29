import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Real weather: a real fortnight of Turin's rain (docs/turin-rain.json, Open-
// Meteo), one sim day to a real one. On a day with at least a millimetre,
// grip falls to GRIP for every car (engine, brakes, steering, as in
// tools/snow.mjs) and passengers book MORE times as many fares, people
// taking a taxi rather than walking; on a dry day both come back. Against
// the same city always dry: each day's fares, crashes per 1000 units, and
// money earned per car.
//
//   GRIP=0.8 MORE=1.25 node tools/rain.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const grip = +(process.env.GRIP || 0.8), more = +(process.env.MORE || 1.25), perDay = DAY / DT;
const rain = JSON.parse(fs.readFileSync("docs/turin-rain.json", "utf8")).mm.map((mm) => mm >= 1);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const demand = ECON.demand;
const wet = (d, on) => {
  if (!d.dryP) d.dryP = d.p;
  d.p = on ? { ...d.dryP, accel: d.dryP.accel * grip, brake: d.dryP.brake * grip, turnRate: d.dryP.turnRate * grip } : d.dryP;
};
for (const arm of ["dry", "real"]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  let raining = false;
  const spawn = w.spawn.bind(w);
  w.spawn = (...a) => { const d = spawn(...a); if (raining) wet(d, true); return d; };
  const rows = [];
  for (let day = 0; day < rain.length; day++) {
    raining = arm === "real" && rain[day];
    ECON.demand = demand * (raining ? more : 1);
    for (const d of w.cars) wet(d, raining);
    let fares = 0, crashes = 0, earned = 0, dist = 0, n = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips, k = w.events.crashes, e = w.events.earned;
      w.step();
      fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      crashes += w.events.crashes >= k ? w.events.crashes - k : w.events.crashes;
      earned += w.events.earned >= e ? w.events.earned - e : w.events.earned;
      for (const d of w.cars) dist += Math.abs(d.v) * DT;
      n += w.cars.length;
    }
    rows.push(`${raining ? "R" : "-"}${fares} ${(1000 * crashes / dist).toFixed(2)} $${Math.round(earned / (n / perDay))}`);
  }
  ECON.demand = demand;
  console.log(`${map} s${seed} ${arm}: ${rows.join(" | ")}`);
}
