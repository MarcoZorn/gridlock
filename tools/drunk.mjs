import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Drunk drivers: a share of the shipped drivers get noise on their steering
// and throttle. Do they only hurt themselves, or the sober cars around them?
// Crashes per 1000 units driven, for drunk and sober cars separately.
//
//   SHARE=0.2 NOISE=0.5 node tools/drunk.mjs
// FOG=0.5 shortens every car's sight to half its range. DELAY=10 makes the
// impaired share act on what they saw 10 ticks ago (old drivers), not noise.
//   FOG=0.5 node tools/drunk.mjs
const share = +(process.env.SHARE || 0), noise = +(process.env.NOISE || 0.5), density = 60, fog = +(process.env.FOG || 1), delay = +(process.env.DELAY || 0);
// POP=runs/x/state.json: any other raised population instead of the shipped one
const pop = Population.fromJSON(JSON.parse(fs.readFileSync(process.env.POP || "docs/trained.json", "utf8")).pop);
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
      if (delay) {
        const past = Array.from({ length: delay }, () => [0, 0]);
        let k = 0;
        c.genome.activate = (inp, out) => { base.activate(inp, out); const p = past[k]; past[k] = [out[0], out[1]]; k = (k + 1) % delay; out[0] = p[0]; out[1] = p[1]; };
      } else c.genome.activate = (inp, out) => { base.activate(inp, out); out[0] += noise * gauss(); out[1] += noise * gauss(); };
    }
  };
  for (let g = 0; g < 3; g++) {
    e.pop.genomes = genomes; e.pop.generation = g; e.newGeneration();
    while (e.step()) ticks++;
    for (const c of [...e.finished, ...e.cars]) { const s = sum[drunk.has(c) ? "drunk" : "sober"]; s[0] += c.dist; s[1] += c.crashes; }
  }
}
const rate = ([d, k]) => (d ? (1000 * k / d).toFixed(2) : "-");
console.log(`share ${share} noise ${noise} fog ${fog} delay ${delay}: crashes per 1000 units, sober ${rate(sum.sober)}, drunk ${rate(sum.drunk)}; sight ${(range / made).toFixed(0)}, distance per tick ${((sum.sober[0] + sum.drunk[0]) / ticks).toFixed(1)}`);
