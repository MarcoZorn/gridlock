import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Cars that build roads. After a fare, a car with at least RICH in its wallet
// looks back along the route it just drove for the buildable street
// (City.buildable) between two of its junctions that would have cut most
// off; if the cut is longer than the street itself, it pays PRICE a unit of
// length and the street is built, open to everyone. Nobody plans: every
// street is one car's shortcut, paid for out of money that would otherwise
// raise a child. Against the same city with no building. Each day: fares,
// streets built, money spent on them.
//
//   PRICE=0.05 RICH=34 node tools/builders.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const price = +(process.env.PRICE || 0.05), rich = +(process.env.RICH || ECON.birthCash);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const arm of (process.env.ARMS || "none,build").split(",")) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, N = c.nodes.length;
  let can = null, built = 0, spent = 0;
  const index = () => { can = new Map(c.buildable().map(([a, b, len]) => [a * N + b, len])); };
  if (arm === "build") index();
  const pay = w.pay.bind(w);
  w.pay = (d) => {
    const route = d.route, kind = d.job && d.job.kind;
    pay(d);
    if (arm !== "build" || !kind || d.cash < rich || !route || route.length < 3) return;
    // distance along the route from its start, junction by junction
    const at = [0];
    for (let i = 1; i < route.length; i++) at.push(at[i - 1] + Math.hypot(c.nodes[route[i]].x - c.nodes[route[i - 1]].x, c.nodes[route[i]].y - c.nodes[route[i - 1]].y));
    let best = null, cut = 0;
    for (let i = 0; i < route.length; i++) for (let j = i + 2; j < route.length; j++) {
      const a = Math.min(route[i], route[j]), b = Math.max(route[i], route[j]), len = can.get(a * N + b);
      if (len !== undefined && at[j] - at[i] - len > Math.max(cut, len)) { cut = at[j] - at[i] - len; best = [a, b, len]; }
    }
    if (!best || d.cash - price * best[2] < 0) return;
    if (w.build(best[0], best[1])) { d.cash -= price * best[2]; spent += price * best[2]; built++; index(); }
  };
  const out = [];
  for (let day = 1; day <= days; day++) {
    let n = 0;
    const b0 = built, s0 = spent;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips;
      w.step();
      n += w.events.trips >= f ? w.events.trips - f : w.events.trips;
    }
    out.push(`${n} +${built - b0} $${Math.round(spent - s0)}`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(5)}: ${out.join(" | ")}`);
}
