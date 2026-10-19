import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// A mass extinction: on the morning of day three, a random four in five of
// the cars go broke at once. Is there an adaptive radiation after it, a
// burst of new species filling the empty niches, as after the dinosaurs?
// Species and cars hour by hour after it, and species alive and new species
// founded each day, against the same economy with no extinction. (A city
// hour is 3600 ticks.)
//
//   node tools/extinction.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.8);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
const days = 8, perDay = DAY / DT;
for (const hit of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const seen = new Set(), born = Array(days).fill(0), alive = Array(days).fill(0), cars = Array(days).fill(0), fares = Array(days).fill(0);
  const hourly = [];   // species alive, hour by hour, for 12 hours from the morning of day three
  let last = 0;
  for (let t = 0; t < days * perDay; t++) {
    if (hit && t === 3 * perDay) { const r = new Rng(+seed + 5); for (const d of w.cars) if (r.next() < share) d.cash = -1e6; }
    w.step();
    const day = Math.floor(t / perDay), now = w.events.trips;
    fares[day] += now >= last ? now - last : now; last = now;
    if (t % 600) continue;
    for (const s of w.species) if (!seen.has(s.id)) { seen.add(s.id); born[day]++; }
    alive[day] += w.species.length; cars[day] += w.cars.length;
    const h = (t - 3 * perDay) / 3600;
    if (h >= 0 && h <= 12 && Number.isInteger(h)) hourly.push(`${w.species.length}/${w.cars.length}`);
  }
  const per = perDay / 600, f = (a) => a.map((x) => (x / per).toFixed(1)).join(" ");
  console.log(`${map} s${seed} ${hit ? "extinction" : "none      "}  hours 0-12 after, species/cars ${hourly.join(" ")}\n    daily: species alive ${f(alive)} | new species ${born.join(" ")} | cars ${f(cars).replace(/\.\d/g, "")} | fares ${fares.join(" ")}`);
}
