import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Unions: a car with a union card refuses passenger fares that pay less than
// a floor and drives on empty instead, leaving the short trip to others. Half
// the newcomers carry a card, children keep their parent's, one in twenty
// switches. Does the card spread?
//
//   FLOOR=6 node tools/unions.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
ECON.union = +(process.env.FLOOR || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
const half = DAY / DT / 2, shares = [], fares = [];
const pay = w.pay.bind(w);
w.pay = (d) => { if (d.job.kind === "passenger") fares.push(d.routeLen * ECON.passengerRate); pay(d); };
for (let t = 0; t < 12 * half; t++) {
  w.step();
  if (t % half === half - 1) shares.push((100 * w.cars.filter((d) => d.union).length / w.cars.length).toFixed(0));
}
fares.sort((a, b) => a - b);
const below = fares.filter((f) => f < ECON.union).length;
console.log(`${map} s${seed}, floor ${ECON.union}: union cars by half-day ${shares.join(" ")}%; median fare ${fares[fares.length >> 1]?.toFixed(1)}, ${(100 * below / fares.length).toFixed(0)}% of fares carried below the floor; fares carried ${fares.length}`);
