import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Evolve the traffic code itself, the drivers voting with their survival. A
// code is five rules: a speed camera (none, 25, 35, 50), traffic lights
// (off, on), a congestion charge (0, 0.05, 0.1), insurance (off, on) and a
// minimum fare (0, 10, 20). A code is scored by how many cars are alive at
// the end of DAYS days of a fresh city run under it; a (1+LAMBDA) search
// changes one rule at a time and keeps the change when at least as many
// cars live. The best code is then tried on cities the search never saw,
// against no rules at all: cars alive and fares.
//
//   ITERS=10 LAMBDA=3 DAYS=1 node tools/code.mjs turin 101
const [map = "turin", seed = 101] = process.argv.slice(2);
const iters = +(process.env.ITERS || 10), lambda = +(process.env.LAMBDA || 3), days = +(process.env.DAYS || 1);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const RULES = { camera: [0, 25, 35, 50], lights: [0, 1], charge: [0, 0.05, 0.1], insure: [0, 1], minFare: [0, 10, 20] };
const names = Object.keys(RULES);
const show = (g) => names.map((k, i) => `${k} ${RULES[k][g[i]]}`).join(", ");
function run(g, s, d = days) {
  const minFare = ECON.minFare;
  ECON.minFare = RULES.minFare[g[4]];
  const w = new EcoWorld({ seed: s, founders, graph });
  w.speedLimit = RULES.camera[g[0]];
  w.control = RULES.lights[g[1]] ? "lights" : "none";
  w.congestion = RULES.charge[g[2]];
  w.insurance = RULES.insure[g[3]];
  let fares = 0;
  for (let t = 0; t < d * DAY / DT; t++) { const f = w.events.trips; w.step(); fares += w.events.trips >= f ? w.events.trips - f : w.events.trips; }
  ECON.minFare = minFare;
  return { cars: w.cars.length, fares };
}
const rng = new Rng(+seed);
let parent = names.map(() => 0), best = run(parent, +seed);
console.log(`start: ${show(parent)}: ${best.cars} cars`);
for (let it = 1; it <= iters; it++) {
  for (let k = 0; k < lambda; k++) {
    const child = [...parent], i = rng.int(names.length), opts = RULES[names[i]].length;
    child[i] = (child[i] + 1 + rng.int(opts - 1)) % opts;   // a different value of one rule
    const r = run(child, +seed);
    if (r.cars >= best.cars) { parent = child; best = r; }
  }
  console.log(`gen ${it}: ${show(parent)}: ${best.cars} cars`);
}
const none = names.map(() => 0), test = [3, 5, 7, 11].map((s) => [run(none, s, 2), run(parent, s, 2)]);
console.log(`unseen cities, two days, no rules against the evolved code: ${test.map(([a, b]) => `${a.cars}/${b.cars} cars ${a.fares}/${b.fares} fares`).join(" | ")}`);
