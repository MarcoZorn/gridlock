import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Road rage: a car that has just crashed drives badly for a while, with
// noise on its steering and throttle as in tools/drunk.mjs. Does one crash
// lead to the next, in other cars? Crashes per 1000 units driven, and the
// first-crash rate: crashes per 1000 units of cars that had never crashed,
// so it is untouched by a raging car's own extra crashes. If it rises with
// rage, the anger spreads to the cars around.
//
//   RAGE=300 NOISE=2 node tools/rage.mjs
const rage = +(process.env.RAGE || 0), noise = +(process.env.NOISE || 2), density = 60;
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
let x = 12345; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const all = [0, 0], first = [0, 0];   // [distance, crashes]
let now = 0, raging = 0;
for (const seed of [77, 91, 105]) {
  const genomes = Array.from({ length: 120 }, (_, i) => pop.genomes[i % pop.genomes.length]);
  const e = new CityWorld({ seed, popSize: 120, traffic: true, density });
  const startWave = e.startWave.bind(e);
  e.startWave = () => {
    startWave();
    for (const c of e.cars) {
      c.until = -1;
      const base = c.genome;
      c.genome = Object.create(base);
      c.genome.activate = (inp, out) => { base.activate(inp, out); if (now < c.until) { out[0] += noise * gauss(); out[1] += noise * gauss(); } };
    }
  };
  for (let g = 0; g < 3; g++) {
    e.pop.genomes = genomes; e.pop.generation = g; e.newGeneration();
    for (;;) {
      const before = e.cars.map((c) => [c, c.dist, c.crashes]);
      const going = e.step();
      now++;
      for (const [c, d, k] of before) {
        const dd = c.dist - d, dk = c.crashes - k;
        all[0] += dd; all[1] += dk;
        if (now - 1 < c.until) raging += dd;
        if (k === 0) { first[0] += dd; first[1] += Math.min(1, dk); }
        if (dk) c.until = now + rage;
      }
      if (!going) break;
    }
  }
}
const rate = ([d, k]) => (d ? (1000 * k / d).toFixed(2) : "-");
console.log(`rage ${rage} noise ${noise}: crashes per 1000 units ${rate(all)}, first crashes per 1000 units ${rate(first)}; share of distance raging ${(raging / all[0]).toFixed(3)}`);
