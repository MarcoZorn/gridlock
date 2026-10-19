import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Kin selection: do relatives crash into each other less than strangers do?
// Every crash between two cars, against how often relatives are near each
// other anyway (all pairs within 40 units, every 10 s). Kin: parent and
// child, or siblings. Days two to five.
//
//   node tools/kin.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
const kin = (a, b) => a.parent === b.id || b.parent === a.id || (a.parent >= 0 && a.parent === b.parent);
const same = (a, b) => a.species === b.species;
const perDay = DAY / DT, c = { crash: [0, 0, 0], near: [0, 0, 0] };   // [pairs, kin, same species]
let on = false;
w.onPair = (a, b) => { if (!on || a.isPed || b.isPed) return; c.crash[0]++; if (kin(a, b)) c.crash[1]++; if (same(a, b)) c.crash[2]++; };
for (let t = 0; t < 5 * perDay; t++) {
  on = t >= 2 * perDay;
  w.step();
  if (!on || t % 600) continue;
  const cars = w.cars;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 1600) continue;
    c.near[0]++; if (kin(a, b)) c.near[1]++; if (same(a, b)) c.near[2]++;
  }
}
const pct = (x, i) => (100 * x[i] / x[0]).toFixed(1);
console.log(`${map} s${seed}: ${c.crash[0]} crashes between cars, ${pct(c.crash, 1)}% between kin (${pct(c.near, 1)}% of near pairs are kin), ${pct(c.crash, 2)}% same species (${pct(c.near, 2)}% of near pairs)`);
