import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Police and speeders: K speed cameras (a fine above LIMIT, as in
// tools/limits.mjs) on a city whose drivers keep evolving. ARM=fixed puts
// them on K roads chosen at random and leaves them there; ARM=patrol moves
// them every city hour to the K roads with the most speeding in the hour
// before, police that learn where the speeders are; ARM=none has none.
// Each day: speeding (seconds over the limit anywhere, per car), seconds
// fined per car, fares and crashes per car. Does the chase settle, or do the
// drivers keep moving the problem?
//
//   ARM=patrol K=68 node tools/police.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const arm = process.env.ARM || "patrol", K = +(process.env.K || 68), limit = +(process.env.LIMIT || 35), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
const c = w.city, n = c.edges.length, rng = new Rng(+seed * 31 + 1);   // its own stream, so the city's is untouched
const place = (ids) => { w.limits = Array(n).fill(0); for (const i of ids) w.limits[i] = limit; };
const shuffled = [...Array(n).keys()].sort(() => rng.next() - 0.5);
if (arm !== "none") place(shuffled.slice(0, K));
const perDay = DAY / DT, hour = perDay / 24;
let seen = new Float64Array(n);
for (let day = 1; day <= days; day++) {
  let over = 0, fined = 0, fares = 0, crashes = 0, carTicks = 0;
  for (let t = 0; t < perDay; t++) {
    const f = w.events.trips, k = w.events.crashes, s = w.events.speeding || 0;
    w.step();
    fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
    crashes += w.events.crashes >= k ? w.events.crashes - k : w.events.crashes;
    fined += (w.events.speeding || 0) >= s ? (w.events.speeding || 0) - s : w.events.speeding || 0;
    carTicks += w.cars.length;
    for (const d of w.cars) {
      if (Math.abs(d.v) <= limit || d.seg + 1 >= d.route.length) continue;
      over += DT;
      const e = c.edgeBetween(d.route[d.seg], d.route[d.seg + 1]);
      if (e) seen[e.id] += DT;
    }
    if (arm === "patrol" && (t + 1) % hour === 0) {
      place([...seen.keys()].sort((a, b) => seen[b] - seen[a]).slice(0, K));
      seen = new Float64Array(n);
    }
  }
  const cars = carTicks / perDay;
  console.log(`${map} s${seed} ${arm} day ${day}: cars ${cars.toFixed(0)} speeding ${(over / cars).toFixed(1)} s/car fined ${(fined / cars).toFixed(1)} s/car fares ${fares} crashes/car ${(crashes / cars).toFixed(0)}`);
}
