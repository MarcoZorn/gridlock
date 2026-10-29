import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Emergency vehicles that others must yield to. A fifth of passengers are
// emergencies, triple fare in time and nothing late (ECON.emergency, as
// before); now, while a car carries one, every other car within 60 units
// ahead of it, in a cone of 30 degrees either side of its heading, pays
// FINE a second for being in the way. The drivers have no sense for a
// siren; whatever yielding evolves has to come from habits that keep a car
// out of the way of anything. Each day: emergencies delivered in time,
// fares, fines paid, car crashes per 1000 units, cars; against no fine.
//
//   FINE=2 node tools/yield.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6), fine = +(process.env.FINE || 2);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT, R = 60, cone = Math.cos(Math.PI / 6);
for (const f of [0, fine]) {
  ECON.emergency = 0.2;
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, urgent = 0, saved = 0, hits = 0, dist = 0, paid = 0;
    for (let t = 0; t < perDay; t++) {
      const ev = w.events, a = ev.trips, u = ev.urgent || 0, s = ev.saved || 0, h = ev.carCrashes;
      w.step();
      const nv = w.events, fresh = nv !== ev;   // events are reset now and then inside step()
      fares += fresh ? nv.trips : nv.trips - a;
      urgent += fresh ? nv.urgent || 0 : (nv.urgent || 0) - u;
      saved += fresh ? nv.saved || 0 : (nv.saved || 0) - s;
      hits += fresh ? nv.carCrashes : nv.carCrashes - h;
      for (const d of w.cars) dist += Math.abs(d.v) * DT;
      if (!f) continue;
      for (const amb of w.cars) {
        if (!amb.job || !amb.job.urgent || !amb.solid) continue;
        const hx = Math.cos(amb.a), hy = Math.sin(amb.a);
        for (const o of w.cars) {
          if (o === amb || !o.solid) continue;
          const dx = o.x - amb.x, dy = o.y - amb.y, r = Math.hypot(dx, dy);
          if (r < R && r > 0 && (dx * hx + dy * hy) / r > cone) { o.cash -= f * DT; paid += f * DT; }
        }
      }
    }
    out.push(`${Math.round((100 * saved) / Math.max(1, urgent))}% ${fares} $${Math.round(paid)} ${(1000 * hits / dist).toFixed(2)} ${w.cars.length}c`);
  }
  console.log(`${map} s${seed} fine ${f}: ${out.join(" | ")}`);
}
ECON.emergency = 0;
