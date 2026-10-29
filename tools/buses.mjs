import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { Driver } from "../src/driver.js";
// Buses on a fixed route, against the taxis. BUSES vehicles shuttle for
// ever between two termini, the junctions nearest a quarter and three
// quarters of the way across the map, on the shortest route between them.
// They are driven by founders' brains, take up road and can crash, but are
// paid by the city: they never earn, breed or go broke. A passenger whose
// start and end both lie within REACH of the line takes the bus SHARE of
// the time, and the taxi that would have carried them is handed another
// fare instead. Each day: taxi fares, bus riders, taxis, car crashes per
// 1000 units, buses replaced so far; against no buses.
//
//   BUSES=6 SHARE=0.5 REACH=300 node tools/buses.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const nBus = +(process.env.BUSES || 6), share = +(process.env.SHARE || 0.5), reach = +(process.env.REACH || 300);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const on of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const nearest = (x, y) => c.nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.y - y) < Math.hypot(c.nodes[b].x - x, c.nodes[b].y - y) ? i : b), 0);
  const ends = [nearest(x0 + (x1 - x0) / 4, my), nearest(x0 + (3 * (x1 - x0)) / 4, my)];
  const line = [c.route(ends[0], ends[1]), c.route(ends[1], ends[0])];
  const near = new Set(c.nodes.map((n, i) => i).filter((i) => line[0].some((k) => Math.hypot(c.nodes[k].x - c.nodes[i].x, c.nodes[k].y - c.nodes[i].y) < reach)));
  const buses = new Set();
  if (on && process.env.DEBUG) console.error(`line ${line[0].length} junctions, ${near.size} of ${c.nodes.length} within reach`);
  let riders = 0, replaced = 0, r = 4242, newBus = null;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  if (on) {
    newBus = (k) => {
      const b = w.immigrate();
      buses.add(b);
      b.setRoute = Driver.prototype.setRoute.bind(b);   // no fares: a bus never takes a job
      b.job = { kind: null, start: w.tick, crashes: 0, expect: 1 };
      b.place(line[k % 2], k / nBus);
      // on to the far terminus from wherever it is (a towed bus is dropped anywhere)
      b.onArrive = (car, here) => c.route(here, here === ends[1] ? ends[0] : ends[1]) || line[0];
    };
    for (let k = 0; k < nBus; k++) newBus(k);
    const fare = w.randomFare.bind(w);
    w.randomFare = (here, came, jam) => {
      for (let tries = 0; tries < 20; tries++) {
        const route = fare(here, came, jam);
        if (!route || !near.has(route[0]) || !near.has(route.at(-1)) || rand() >= share) return route;
        riders++;   // this one took the bus; the taxi is handed someone else
      }
      return fare(here, came, jam);
    };
  }
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, hits = 0, dist = 0;
    riders = 0;
    for (let t = 0; t < perDay; t++) {
      for (const b of buses) b.cash = ECON.startCash;   // paid by the city
      // a bus lost to crashes is replaced, the line keeps its timetable
      if (on && t % 600 === 0) { const alive = new Set(w.cars); for (const b of [...buses]) if (!alive.has(b)) { buses.delete(b); newBus(buses.size); replaced++; } }
      const ev = w.events, f = ev.trips, h = ev.carCrashes;
      w.step();
      const nv = w.events, fresh = nv !== ev;   // events are reset now and then inside step()
      fares += fresh ? nv.trips : nv.trips - f;
      hits += fresh ? nv.carCrashes : nv.carCrashes - h;
      for (const d of w.cars) dist += Math.abs(d.v) * DT;
    }
    const alive = [...buses].filter((b) => w.cars.includes(b)).length;
    out.push(`${fares} r${riders} ${w.cars.length - alive}t ${(1000 * hits / dist).toFixed(2)}${on ? ` +${replaced}b` : ""}`);
  }
  console.log(`${map} s${seed} ${on ? "buses" : "none "}: ${out.join(" | ")}`);
}
