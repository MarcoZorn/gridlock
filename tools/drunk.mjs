import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Drunk drivers: a share of the shipped drivers get noise on their steering
// and throttle. Do they only hurt themselves, or the sober cars around them?
// Crashes per 1000 units driven, for drunk and sober cars separately.
//
//   SHARE=0.2 NOISE=0.5 node tools/drunk.mjs
// FOG=0.5 shortens every car's sight to half its range.
//   FOG=0.5 node tools/drunk.mjs
const share = +(process.env.SHARE || 0), noise = +(process.env.NOISE || 0.5), density = 60, fog = +(process.env.FOG || 1);
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
let x = 12345; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const sum = { drunk: [0, 0], sober: [0, 0] };   // [distance, crashes]
let ticks = 0, range = 0, made = 0;
for (const seed of [77, 91, 105]) {
  const genomes = Array.from({ length: 120 }, (_, i) => pop.genomes[i % pop.genomes.length]);
  const e = new CityWorld({ seed, popSize: 120, traffic: true, density });
  const drunk = new Set(), startWave = e.startWave.bind(e);
  // every wave of cars is made in startWave, so impair them there
  e.startWave = () => {
    startWave();
    for (const c of e.cars) {
      range += c.p.rayRange * fog; made++;
      if (fog !== 1) c.p = { ...c.p, rayRange: c.p.rayRange * fog };
      if (rnd() >= share) continue;
      drunk.add(c);
      const base = c.genome;
      c.genome = Object.create(base);
      c.genome.activate = (inp, out) => { base.activate(inp, out); out[0] += noise * gauss(); out[1] += noise * gauss(); };
    }
  };
  for (let g = 0; g < 3; g++) {
    e.pop.genomes = genomes; e.pop.generation = g; e.newGeneration();
    while (e.step()) ticks++;
    for (const c of [...e.finished, ...e.cars]) { const s = sum[drunk.has(c) ? "drunk" : "sober"]; s[0] += c.dist; s[1] += c.crashes; }
  }
}
const rate = ([d, k]) => (d ? (1000 * k / d).toFixed(2) : "-");
console.log(`share ${share} noise ${noise} fog ${fog}: crashes per 1000 units, sober ${rate(sum.sober)}, drunk ${rate(sum.drunk)}; sight ${(range / made).toFixed(0)}, distance per tick ${((sum.sober[0] + sum.drunk[0]) / ticks).toFixed(1)}`);
