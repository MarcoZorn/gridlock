import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
// The same population re-scored generation after generation without ever
// evolving: what its fitness does when nothing changes, against a run that
// carries on evolving from it. If the frozen one holds and the evolving one
// falls, evolution itself is losing ground.
//
//   GENS=100 node tools/frozen.mjs docs/trained.json
const file = process.argv[2] || "docs/trained.json", gens = +(process.env.GENS || 100);
const w = CityWorld.fromJSON(JSON.parse(fs.readFileSync(file, "utf8")));
const frozen = w.pop.genomes.map((g) => g.clone());
w.pop.evolve = () => {};   // no selection, no mutation
const means = [];
for (let g = 0; g < gens; g++) {
  w.pop.genomes = frozen.map((x) => x.clone());
  w.pop.generation++;
  w.newGeneration();
  means.push(w.runGeneration().mean);
}
const block = (a, b) => (means.slice(a, b).reduce((s, x) => s + x, 0) / (b - a)).toFixed(1);
console.log(`${file} frozen for ${gens} generations: mean fitness by 20s ${Array.from({ length: gens / 20 }, (_, i) => block(i * 20, i * 20 + 20)).join(" ")}`);
