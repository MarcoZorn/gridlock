import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A football match: on day three, from 17:00 to 19:00, a share of all new
// fares go to one junction, the stadium (the one nearest the middle of the
// map). Then it is over and fares go anywhere again. Each city hour from
// 15:00 to 24:00 that day: fares delivered, crashes, and cars standing
// still within 150 units of the stadium, and cars at the end of the hour,
// against the same city with no match.
//
//   SHARE=0.5 node tools/match.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.5);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
const hour = DAY / DT / 24, day3 = 2 * 24 * hour, from = 15, to = 24;
for (const match of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const c = w.city, mx = c.nodes.reduce((a, n) => a + n.x, 0) / c.nodes.length, my = c.nodes.reduce((a, n) => a + n.y, 0) / c.nodes.length;
  let S = 0;
  c.nodes.forEach((n, i) => { if (Math.hypot(n.x - mx, n.y - my) < Math.hypot(c.nodes[S].x - mx, c.nodes[S].y - my)) S = i; });
  // its own random stream, so the city's is the same with and without the match
  let r = 12345;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fare = w.randomFare.bind(w);
  let on = false;
  w.randomFare = (here, came, jam) => (on && here !== S && rand() < share ? c.route(here, S, came, jam) : fare(here, came, jam));
  const rows = [];
  for (let t = 0; t < day3 + to * hour; t++) {
    on = match && t >= day3 + 17 * hour && t < day3 + 19 * hour;
    const trips = w.events.trips, crashes = w.events.crashes;
    w.step();
    if (t < day3 + from * hour) continue;
    const h = Math.floor((t - day3) / hour), row = (rows[h - from] ||= { fares: 0, crashes: 0, still: 0, cars: 0 });
    // events reset every telemetry row, so count the steps, not the totals
    row.fares += w.events.trips >= trips ? w.events.trips - trips : w.events.trips;
    row.crashes += w.events.crashes >= crashes ? w.events.crashes - crashes : w.events.crashes;
    row.cars = w.cars.length;
    if (t % 600 === 0) row.still += w.cars.filter((d) => Math.abs(d.v) < 5 && Math.hypot(d.x - c.nodes[S].x, d.y - c.nodes[S].y) < 150).length / (hour / 600);
  }
  const col = (k) => rows.map((x) => (k === "still" ? x[k].toFixed(0) : x[k])).join(" ");
  console.log(`${map} s${seed} ${match ? "match" : "none "} hours ${from}-${to - 1}: fares ${col("fares")} | crashes ${col("crashes")} | still near stadium ${col("still")} | cars ${col("cars")}`);
}
