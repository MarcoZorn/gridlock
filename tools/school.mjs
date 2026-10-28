import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// School runs: every day from 7:30 to 8:30 and from 15:00 to 16:00, a share
// of new fares go to one of two schools, the junctions nearest a third and
// two thirds of the way across the map. A football match every day, twice,
// at the same places. Each day: fares in the school hours and in the whole
// day, with and without, to see whether the city adapts to a crowd it meets
// every day.
//
//   SHARE=0.4 node tools/school.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.4), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const hour = DAY / DT / 24;
const inSchool = (t) => { const h = (t % (24 * hour)) / hour; return (h >= 7.5 && h < 8.5) || (h >= 15 && h < 16); };
for (const school of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const c = w.city, xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const nearest = (x, y) => c.nodes.reduce((b, n, i) => (Math.hypot(n.x - x, n.y - y) < Math.hypot(c.nodes[b].x - x, c.nodes[b].y - y) ? i : b), 0);
  const schools = [nearest(x0 + (x1 - x0) / 3, my), nearest(x0 + 2 * (x1 - x0) / 3, my)];
  // its own random stream, so the city's is the same with and without
  let r = 777;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fare = w.randomFare.bind(w);
  let on = false;
  w.randomFare = (here, came, jam) => {
    if (!on || rand() >= share) return fare(here, came, jam);
    const s = schools[rand() < 0.5 ? 0 : 1];
    return s === here ? fare(here, came, jam) : c.route(here, s, came, jam);
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    let all = 0, peak = 0;
    for (let t = 0; t < 24 * hour; t++) {
      const tick = (day - 1) * 24 * hour + t;
      on = school && inSchool(tick);
      const f = w.events.trips;
      w.step();
      const n = w.events.trips >= f ? w.events.trips - f : w.events.trips;
      all += n;
      if (inSchool(tick)) peak += n;
    }
    rows.push(`d${day} ${peak}/${all}`);
  }
  console.log(`${map} s${seed} ${school ? "school" : "none  "} fares in school hours / all day: ${rows.join(" ")}`);
}
