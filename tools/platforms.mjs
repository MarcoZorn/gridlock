import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Two platforms. A share of the passengers book through B, the rest through
// A, and each keeps its own commission. A car drives for its parent's
// platform, one child in twenty switches. Where do the drivers end up?
// The ideal free distribution from ecology says: in proportion to what each
// platform pays out in all, (passenger share) x (1 - commission).
//
//   B=0.5 CA=0.1 CB=0.3 node tools/platforms.mjs turin 7   (SWITCH=0.01: fewer switch)
const [map = "turin", seed = 7] = process.argv.slice(2);
Object.assign(ECON, { platformB: +(process.env.B || 0.5), commissionA: +(process.env.CA || 0.1), commissionB: +(process.env.CB || 0.3), switchPlatform: +(process.env.SWITCH || 0.05) });
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
const payA = (1 - ECON.platformB) * (1 - ECON.commissionA), payB = ECON.platformB * (1 - ECON.commissionB);
const half = DAY / DT / 2, shares = [];
for (let t = 0; t < 12 * half; t++) {
  w.step();
  if (t % half === half - 1) shares.push((100 * w.cars.filter((d) => d.platform === 1).length / w.cars.length).toFixed(0));
}
console.log(`${map} s${seed}, B books ${ECON.platformB}, commission A ${ECON.commissionA} B ${ECON.commissionB}, switch ${ECON.switchPlatform}: drivers on B by half-day ${shares.join(" ")}%; ideal free distribution ${(100 * payB / (payA + payB)).toFixed(0)}%`);
