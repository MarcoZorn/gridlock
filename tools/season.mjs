import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A tourist season: passenger demand doubles for day three only, then goes
// back. Does the economy boom and then bust, with the cars born in the good
// day going broke when it ends? Cars, deaths and fares each half-day, against
// the same economy with no season.
//
//   BOOM=2 node tools/season.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), boom = +(process.env.BOOM || 2);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
const days = 7, half = DAY / DT / 2, base = ECON.demand;
for (const season of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const cars = [], deaths = [], fares = [];
  let lastT = 0, lastD = 0;
  for (let t = 0; t < days * 2 * half; t++) {
    ECON.demand = season && t >= 6 * half && t < 8 * half ? base * boom : base;
    w.step();
    const i = Math.floor(t / half), nt = w.events.trips, nd = w.events.deaths;
    fares[i] = (fares[i] || 0) + (nt >= lastT ? nt - lastT : nt); deaths[i] = (deaths[i] || 0) + (nd >= lastD ? nd - lastD : nd);
    lastT = nt; lastD = nd;
    if (t % half === half - 1) cars[i] = w.cars.length;
  }
  ECON.demand = base;
  const from = 4;   // from day two
  console.log(`${map} s${seed} ${season ? "season" : "none  "} by half-day from day 2: cars ${cars.slice(from).join(" ")} | deaths ${deaths.slice(from).join(" ")} | fares ${fares.slice(from).join(" ")}`);
}
