// The species threshold's step, from scratch: the generation-based city
// with a step of 0.3 (NEAT's textbook size) against 0.02, paired by seed
// (seeds 101..). The measure is the mean of the population's mean fitness
// (priced at the final damage cost) over the last TAIL generations of GENS.
// A difference, not a ratio: fitness can be negative early on.
//
//   SEEDS=20 GENS=60 node tools/stepcmp.mjs
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { N_INPUTS, N_OUTPUTS } from "../src/driver.js";
import { bootstrap } from "./stats.mjs";

export function score(seed, step, gens, tail) {
  const pop = new Population(N_INPUTS, N_OUTPUTS, { popSize: 120, pWeight: 0.5, weightStep: 0.15, stagnation: 60, sharing: false, thresholdStep: step }, seed);
  const w = new CityWorld({ seed, popSize: 120, pop });
  for (let g = 0; g < gens; g++) w.runGeneration();
  const last = w.history.slice(-tail);
  return last.reduce((t, h) => t + h.meanFull, 0) / last.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = +(process.env.SEEDS || 20), gens = +(process.env.GENS || 60), tail = +(process.env.TAIL || 10);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const a = score(101 + i, 0.3, gens, tail), b = score(101 + i, 0.02, gens, tail);
    rows.push({ a, b, d: b - a });
    console.error(`seed ${101 + i}: step 0.3 ${a.toFixed(1)}, step 0.02 ${b.toFixed(1)}`);
  }
  const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length, d = rows.map((r) => r.d), [lo, hi] = bootstrap(d);
  const f = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
  console.log(`threshold step 0.02 against 0.3, from scratch, ${n} seeds, mean fitness over generations ${gens - tail + 1}-${gens}: 0.3 ${m(rows.map((r) => r.a)).toFixed(1)}, 0.02 ${m(rows.map((r) => r.b)).toFixed(1)}`);
  console.log(`  difference ${f(m(d))}  [${f(lo)}, ${f(hi)}]  ${d.filter((x) => x > 0).length} up / ${d.filter((x) => x < 0).length} down${lo > 0 || hi < 0 ? "" : "  (not distinguishable from zero)"}`);
}
