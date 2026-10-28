import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Gentrification: one district, the north-east quarter of the map, pulls
// more of the city's fares every day; its pull as a destination grows by
// GROW times a day while the rest of the city keeps the same weight each.
// The same booked demand is shared out differently: does the fleet follow
// the money in, and do the fares left outside get carried, or does the
// economy shrink to the district? Each day: all fares, the share of those
// handed out that go into the district, money earned and cars; GROW=1 is
// the control.
//
//   GROW=1.6 node tools/gentrify.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), grow = +(process.env.GROW || 1.6), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const hour = DAY / DT / 24;
for (const k of [1, grow]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const inD = c.nodes.map((n) => n.x >= mx && n.y < my);   // north-east: y grows downward
  const district = c.nodes.map((_, i) => i).filter((i) => inD[i]), rest = c.nodes.map((_, i) => i).filter((i) => !inD[i]);
  // its own random stream, so control and gentrified city draw alike
  let r = 777;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  let weight = 1;
  const into = { in: 0, out: 0 };   // fares handed out, by where they go
  w.randomFare = (from, came = -1, jam = 0) => {
    const a = c.nodes[from], share = (weight * district.length) / (weight * district.length + rest.length);
    let to, tries = 0;
    do { const set = rand() < share ? district : rest; to = set[Math.floor(rand() * set.length)]; tries++; }
    while (to === from || (tries < 50 && Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < 300));
    into[inD[to] ? "in" : "out"]++;
    return c.route(from, to, came, jam);
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    weight = k ** (day - 1);
    into.in = into.out = 0;
    let earned = 0, trips = 0;
    for (let t = 0; t < 24 * hour; t++) {
      const f = w.events.trips, e = w.events.earned;
      w.step();
      const n = w.events.trips >= f ? w.events.trips - f : w.events.trips;
      trips += n;
      earned += w.events.earned >= e ? w.events.earned - e : w.events.earned;
    }
    const tot = into.in + into.out || 1;
    rows.push(`d${day} ${trips} (${Math.round((100 * into.in) / tot)}% in) $${Math.round(earned)} ${w.cars.length}c`);
  }
  console.log(`${map} s${seed} x${k} ${district.length}/${c.nodes.length} nodes: ${rows.join(" | ")}`);
}
