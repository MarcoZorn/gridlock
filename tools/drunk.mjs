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
// SEEDS=20: twenty seeds (101..), the FOG/DELAY/SHARE setting against none on the same
// seeds, and the paired change in crashes per 1000 units and in distance per tick with a
// 95% bootstrap interval. Without SEEDS: three fixed seeds and one line.
const share = +(process.env.SHARE || 0), noise = +(process.env.NOISE || 0.5), density = 60, fog = +(process.env.FOG || 1), delay = +(process.env.DELAY || 0);
// POP=runs/x/state.json: any other raised population instead of the shipped one
const pop = Population.fromJSON(JSON.parse(fs.readFileSync(process.env.POP || "docs/trained.json", "utf8")).pop);

// one arm over some seeds: [distance, crashes] for drunk and sober cars, ticks, mean sight
export function run(seeds, fog, delay, share) {
  let x = 12345; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const sum = { drunk: [0, 0], sober: [0, 0] };   // [distance, crashes]
  let ticks = 0, range = 0, made = 0;
  for (const seed of seeds) {
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
  return { sum, ticks, range, made };
}
export const rate = ([d, k]) => (d ? (1000 * k / d).toFixed(2) : "-");
export const crashRate = (r) => 1000 * (r.sum.sober[1] + r.sum.drunk[1]) / (r.sum.sober[0] + r.sum.drunk[0]);
export const speed = (r) => (r.sum.sober[0] + r.sum.drunk[0]) / r.ticks;

// 95% interval of the mean, by resampling the seeds (deterministic stream)
export function bootstrap(xs, reps = 4000) {
  let r = 12345;
  const rnd = () => ((r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const means = [];
  for (let k = 0; k < reps; k++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)]; means.push(s / xs.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)], means[Math.floor(0.975 * reps)]];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.SEEDS) {
    const r = run([77, 91, 105], fog, delay, share), { sum, ticks, range, made } = r;
    console.log(`share ${share} noise ${noise} fog ${fog} delay ${delay}: crashes per 1000 units, sober ${rate(sum.sober)}, drunk ${rate(sum.drunk)}; sight ${(range / made).toFixed(0)}, distance per tick ${((sum.sober[0] + sum.drunk[0]) / ticks).toFixed(1)}`);
  } else {
    const n = +process.env.SEEDS, rows = [];
    for (let i = 0; i < n; i++) {
      const base = run([101 + i], 1, 0, 0), test = run([101 + i], fog, delay, share);
      rows.push([crashRate(test) / crashRate(base) - 1, speed(test) / speed(base) - 1]);
    }
    console.log(`share ${share} noise ${noise} fog ${fog} delay ${delay} against none, ${n} seeds: mean change, 95% interval, seeds up/down`);
    for (const [k, name] of [[0, "crashes per 1000 units"], [1, "distance per tick"]]) {
      const ch = rows.map((r) => r[k]), m = ch.reduce((a, b) => a + b, 0) / n, [lo, hi] = bootstrap(ch);
      const f = (v) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}%`;
      console.log(`  ${name.padEnd(24)} ${f(m).padStart(8)}  [${f(lo)}, ${f(hi)}]  ${ch.filter((v) => v > 0).length} up / ${ch.filter((v) => v < 0).length} down${lo > 0 || hi < 0 ? "" : "  (not distinguishable from zero)"}`);
    }
  }
}
