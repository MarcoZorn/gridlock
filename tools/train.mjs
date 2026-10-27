import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A train line: two stations, the junctions nearest a quarter and three
// quarters of the way across the map. A passenger whose trip would be long
// (over LONG units, the longest quarter on Turin) takes the train SHARE of the time, so the taxi only
// carries them to the station nearer their start. Each day: cars, fares,
// money earned, mean trip, crashes per car and the Gini, with and without.
//
//   SHARE=0.5 LONG=2000 node tools/train.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.5), long = +(process.env.LONG || 2000), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const perDay = DAY / DT;
for (const train of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const c = w.city, xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const nearest = (x, y) => c.nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.y - y) < Math.hypot(c.nodes[b].x - x, c.nodes[b].y - y) ? i : b), 0);
  const stations = [nearest(x0 + (x1 - x0) / 4, my), nearest(x0 + 3 * (x1 - x0) / 4, my)];
  // its own random stream, so the city's is the same with and without
  let r = 4242;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fare = w.randomFare.bind(w);
  if (train) w.randomFare = (here, came, jam) => {
    const route = fare(here, came, jam);
    if (!route || c.pathLength(route) < long || rand() >= share) return route;
    const s = stations.reduce((b, k) => (Math.hypot(c.nodes[k].x - c.nodes[here].x, c.nodes[k].y - c.nodes[here].y) < Math.hypot(c.nodes[b].x - c.nodes[here].x, c.nodes[b].y - c.nodes[here].y) ? k : b));
    return s === here ? route : c.route(here, s, came, jam);
  };
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
  console.log(`${map} s${seed} ${train ? "train" : "none "} ${rows.join(" | ")}`);
}
