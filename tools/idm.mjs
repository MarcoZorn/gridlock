import fs from "node:fs";
import { CityWorld, DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// How well does the Intelligent Driver Model, the standard car-following
// equation, describe the evolved drivers? Samples of speed, the gap to the
// car straight ahead, how fast it closes, and the acceleration that followed,
// on roads (not in junctions), from the shipped drivers in two unseen
// cities. Then a random search for the IDM parameters that fit best, and
// how much of the variance in acceleration they explain.
//
//   node tools/idm.mjs        (CLOSE=1: only when following closely)
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const S = [];   // [v, gap or Infinity, closing speed, acceleration]
let x = 7; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
for (const seed of [77, 91]) {
  const genomes = Array.from({ length: 60 }, (_, i) => pop.genomes[i % pop.genomes.length]);
  const e = new CityWorld({ seed, popSize: 60, traffic: true, density: 60 });
  e.pop.genomes = genomes; e.newGeneration();
  // SMOOTH=15: the state 15 ticks ago and the mean acceleration since, so
  // tick-to-tick pulsing of the pedals averages out
  const k = +(process.env.SMOOTH || 1), hist = new Map();
  let t = 0;
  while (e.step()) {
    t++;
    for (const c of e.cars) {
      if (!hist.has(c)) hist.set(c, []);
      const h = hist.get(c);
      if (!c.alive || c.towing > 0 || c.city.junctionAt(c.x, c.y) >= 0) { h.length = 0; continue; }
      const mid = c.carRay.length >> 1, ahead = c.carRay[mid] < c.p.rayRange;
      h.push([c.v, ahead ? c.carRay[mid] : Infinity, ahead ? c.closing[mid] * 110 : 0]);
      if (h.length > k) {
        const [v0, gap, dv] = h.shift();
        if (t % 3 === 0) S.push([v0, gap, dv, (c.v - v0) / (k * DT)]);
      }
    }
  }
}
// CLOSE=1: only moments with a car within 40 units ahead
const pool = process.env.CLOSE ? S.filter((s) => s[1] < 40) : S;
const data = pool.filter(() => rnd() < 30000 / pool.length);
const meanA = data.reduce((a, s) => a + s[3], 0) / data.length, varA = data.reduce((a, s) => a + (s[3] - meanA) ** 2, 0);
const err = ([V0, A, B, T, S0]) => {
  let e = 0;
  for (const [v, s, dv, a] of data) {
    const star = S0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(A * B)));
    const m = A * (1 - (Math.max(0, v) / V0) ** 4 - (s === Infinity ? 0 : (star / Math.max(1, s)) ** 2));
    e += (Math.max(-400, m) - a) ** 2;
  }
  return e;
};
const span = [[30, 150], [10, 300], [10, 500], [0, 3], [0, 30]];
let best = null, bestE = Infinity;
for (let i = 0; i < 4000; i++) {
  const p = best && i > 1000 ? best.map((b, k) => Math.min(span[k][1], Math.max(span[k][0], b + (rnd() - 0.5) * (span[k][1] - span[k][0]) * 0.1))) : span.map(([lo, hi]) => lo + rnd() * (hi - lo));
  const e = err(p);
  if (e < bestE) { bestE = e; best = p; }
}
const close = data.filter((s) => s[1] < 40).length;
console.log(`${data.length} samples (${close} within 40 units of a car ahead); IDM fit: top speed ${best[0].toFixed(0)}, accel ${best[1].toFixed(0)}, comfortable braking ${best[2].toFixed(0)}, headway ${best[3].toFixed(2)} s, jam gap ${best[4].toFixed(1)}; explains ${(100 * (1 - bestE / varA)).toFixed(0)}% of the variance in acceleration`);
// how the accelerations are spread: a smooth controller sits near zero, a
// bang-bang one at the extremes
const q = data.map((s) => s[3]).sort((a, b) => a - b), at = (f) => q[Math.floor(f * (q.length - 1))].toFixed(0);
console.log(`acceleration percentiles 5/25/50/75/95: ${at(0.05)} ${at(0.25)} ${at(0.5)} ${at(0.75)} ${at(0.95)}`);
// For scale, any straight line through speed, closeness (1/gap) and closing
// speed: how much could these three numbers explain at most, linearly?
const X = data.map(([v, g, dv]) => [1, v, g === Infinity ? 0 : 1 / Math.max(1, g), dv]), y = data.map((s) => s[3]);
const M = X[0].map((_, i) => X[0].map((_, j) => X.reduce((a, r) => a + r[i] * r[j], 0))), b = X[0].map((_, i) => X.reduce((a, r, n) => a + r[i] * y[n], 0));
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const f = M[j][i] / M[i][i]; for (let k = i; k < 4; k++) M[j][k] -= f * M[i][k]; b[j] -= f * b[i]; }
const w = [0, 0, 0, 0]; for (let i = 3; i >= 0; i--) w[i] = (b[i] - M[i].slice(i + 1).reduce((a, m, k) => a + m * w[i + 1 + k], 0)) / M[i][i];
const lin = y.reduce((a, yy, n) => a + (yy - X[n].reduce((s2, xx, k) => s2 + xx * w[k], 0)) ** 2, 0);
console.log(`a straight line through the same three numbers explains ${(100 * (1 - lin / varA)).toFixed(0)}%`);
