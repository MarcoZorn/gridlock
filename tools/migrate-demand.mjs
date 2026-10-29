import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Seasonal migrations of demand: one quarter of the map is in season and
// weighs PULL times the rest as a destination; the season moves on to the
// next quarter, round the compass, every PERIOD days. The same demand in
// total, only where it goes changes. Does the fleet follow the money round
// the city, and what does each move cost? Each day: fares and money earned,
// against PULL=1 (no season); and the share of fares into the season's
// quarter that also start there (a fare starts where its car is, so: how
// much of the fleet is already working the quarter).
//
//   PULL=4 PERIOD=1 node tools/migrate-demand.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const pull = +(process.env.PULL || 4), period = +(process.env.PERIOD || 1), days = +(process.env.DAYS || 8);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const hour = DAY / DT / 24;
for (const k of [1, pull]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  // quarters round the compass: NE, SE, SW, NW (y grows downward)
  const quarterOf = (n) => (n.x >= mx ? (n.y < my ? 0 : 1) : (n.y >= my ? 2 : 3));
  const q = c.nodes.map(quarterOf), byQ = [0, 1, 2, 3].map((i) => c.nodes.map((_, j) => j).filter((j) => q[j] === i));
  // its own random stream, so the arms draw alike
  let r = 777;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  let hot = 0, fromHot = 0, intoHot = 0;
  w.randomFare = (from, came = -1, jam = 0) => {
    const a = c.nodes[from], share = (k * byQ[hot].length) / (k * byQ[hot].length + c.nodes.length - byQ[hot].length);
    let to, tries = 0;
    do {
      const set = rand() < share ? byQ[hot] : c.nodes.map((_, j) => j).filter((j) => q[j] !== hot);
      to = set[Math.floor(rand() * set.length)]; tries++;
    } while (to === from || (tries < 50 && Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < 300));
    if (q[to] === hot) { intoHot++; if (q[from] === hot) fromHot++; }
    return c.route(from, to, came, jam);
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    hot = Math.floor((day - 1) / period) % 4;
    fromHot = intoHot = 0;
    let trips = 0, earned = 0;
    for (let t = 0; t < 24 * hour; t++) {
      const f = w.events.trips, e = w.events.earned;
      w.step();
      trips += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      earned += w.events.earned >= e ? w.events.earned - e : w.events.earned;
    }
    rows.push(`d${day} q${hot} ${trips} $${Math.round(earned)} ${Math.round((100 * fromHot) / Math.max(1, intoHot))}%`);
  }
  console.log(`${map} s${seed} pull ${k}: ${rows.join(" | ")}`);
}
