import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// A black market for fares. The platform takes CUT of every fare. A car
// may carry a habit of taking its fares off the books: no cut, but each
// such fare is caught with probability CATCH and fined FINE. The habit is
// inherited (one child in twenty switches) and a newcomer has it one time
// in ten. With the defaults a fare is worth about 26, so the cut is about 5
// and the fine expected at CATCH=0.05 is 2.5, at 0.2 it is 10: does the
// black market spread where it pays and die where it does not? Each day:
// share of black cars, fines, fares.
//
//   CUT=0.2 FINE=50 node tools/blackmarket.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const cut = +(process.env.CUT || 0.2), fine = +(process.env.FINE || 50);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const caught of (process.env.CATCH || "0.05,0.2").split(",").map(Number)) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const rng = new Rng(+seed + 5);
  const spawn = w.spawn.bind(w), birth = w.birth.bind(w);
  let parentOf = null;
  w.birth = (p) => { parentOf = p; const c = birth(p); parentOf = null; return c; };
  w.spawn = (...a) => {
    const d = spawn(...a);
    d.black = parentOf ? (rng.next() < 0.05 ? !parentOf.black : parentOf.black) : rng.next() < 0.1;
    return d;
  };
  for (const d of w.cars) d.black = rng.next() < 0.1;
  let fines = 0;
  const pay = w.pay.bind(w);
  w.pay = (d) => {
    const before = d.cash, kind = d.job && d.job.kind;
    pay(d);
    const fare = d.cash - before;
    if (!kind || fare <= 0) return;
    if (!d.black) { d.cash -= cut * fare; w.events.earned -= cut * fare; }
    else if (rng.next() < caught) { d.cash -= fine; fines++; }
  };
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0;
    fines = 0;
    for (let t = 0; t < perDay; t++) { const f = w.events.trips; w.step(); fares += w.events.trips >= f ? w.events.trips - f : w.events.trips; }
    out.push(`${Math.round((100 * w.cars.filter((d) => d.black).length) / w.cars.length)}% f${fines} ${fares}`);
  }
  console.log(`${map} s${seed} catch ${caught}: ${out.join(" | ")}`);
}
