import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// An airport: all day, every day, a share of new fares go to one junction,
// the one farthest from the middle of the map, and are paid by distance
// like any other, so they are the long ones. Each day: cars, fares, money
// earned, mean trip, crashes per car and the Gini, with and without the airport.
//
//   SHARE=0.1 node tools/airport.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.1), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const perDay = DAY / DT;
for (const airport of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const c = w.city, mx = c.nodes.reduce((a, n) => a + n.x, 0) / c.nodes.length, my = c.nodes.reduce((a, n) => a + n.y, 0) / c.nodes.length;
  let A = 0;
  c.nodes.forEach((n, i) => { if (Math.hypot(n.x - mx, n.y - my) > Math.hypot(c.nodes[A].x - mx, c.nodes[A].y - my)) A = i; });
  // its own random stream, so the city's is the same with and without
  let r = 4242;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fare = w.randomFare.bind(w);
  if (airport) w.randomFare = (here, came, jam) => (here !== A && rand() < share ? c.route(here, A, came, jam) : fare(here, came, jam));
  const rows = [];
  for (let day = 1; day <= days; day++) {
    let trips = 0, ticks = 0, crashes = 0, carTicks = 0, earned = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips, k = w.events.crashes, tt = w.events.tripTicks, m = w.events.earned;
      w.step();
      trips += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      ticks += w.events.tripTicks >= tt ? w.events.tripTicks - tt : w.events.tripTicks;
      crashes += w.events.crashes >= k ? w.events.crashes - k : w.events.crashes;
      earned += w.events.earned >= m ? w.events.earned - m : w.events.earned;
      carTicks += w.cars.length;
    }
    const cars = carTicks / perDay;
    rows.push(`d${day} cars ${cars.toFixed(0)} fares ${trips} earned ${earned.toFixed(0)} trip ${(ticks / trips / 60).toFixed(0)}s crashes/car ${(crashes / cars).toFixed(0)} gini ${w.log.at(-1).gini.toFixed(2)}`);
  }
  console.log(`${map} s${seed} ${airport ? "airport" : "none   "} ${rows.join(" | ")}`);
}
