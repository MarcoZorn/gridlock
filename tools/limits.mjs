import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Speed limits per road: one gene per road, a camera at LIMIT or none. A
// (1+1) search keeps a flip of a few roads when the economy's last day has
// more fares and fewer crashes, each as a share of the start's (crashes
// weigh W). Scored on seeds the
// search never saw against no cameras and cameras everywhere.
//
//   DAYS=2 ITERS=30 node tools/limits.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const limit = +(process.env.LIMIT || 35), days = +(process.env.DAYS || 2), iters = +(process.env.ITERS || 30), W = +(process.env.W || 1);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const perDay = DAY / DT;

function run(genes, s) {
  const w = new EcoWorld({ seed: s, founders, graph });
  w.limits = genes.map((g) => g * limit);
  let fares = 0, crashes = 0;
  for (let t = 0; t < days * perDay; t++) {
    const f = w.events.trips, k = w.events.crashes;
    w.step();
    // events reset at dawn; only the last day counts
    if (t >= (days - 1) * perDay) { fares += Math.max(0, w.events.trips - f); crashes += Math.max(0, w.events.crashes - k); }
  }
  return { fares, crashes };
}

const n = graph.edges ? graph.edges.length : new EcoWorld({ seed: 1, graph }).city.edges.length;
const rng = new Rng(+seed), none = Array(n).fill(0), all = Array(n).fill(1);
let best = none.slice(), bestR = run(best, +seed);
const start = bestR, fit = (r) => r.fares / start.fares - W * r.crashes / start.crashes;
for (let it = 0; it < iters; it++) {
  const cand = best.slice();
  for (let k = 1 + rng.int(Math.max(1, n >> 4)); k > 0; k--) { const i = rng.int(n); cand[i] ^= 1; }
  const r = run(cand, +seed);
  if (fit(r) >= fit(bestR)) { best = cand; bestR = r; }
  console.error(`it ${it}: ${r.fares}/${r.crashes} best ${bestR.fares}/${bestR.crashes} cams ${best.filter(Boolean).length}`);
}
const tot = (g) => [11, 12, 13].map((s) => run(g, +seed + s)).reduce((a, r) => ({ fares: a.fares + r.fares, crashes: a.crashes + r.crashes }), { fares: 0, crashes: 0 });
// the control: as many cameras, on roads picked at random
const rand = best.slice().sort(() => rng.next() - 0.5);
const tn = tot(none), ta = tot(all), tb = tot(best), tr = tot(rand), fmt = (r) => `${r.fares} fares ${r.crashes} crashes`;
console.log(`${map} s${seed} limit ${limit} W ${W}: train ${start.fares}/${start.crashes} -> ${bestR.fares}/${bestR.crashes}, ${best.filter(Boolean).length} of ${n} roads camera'd`);
console.log(`unseen seeds, last day of ${days}: none ${fmt(tn)}; everywhere ${fmt(ta)}; evolved ${fmt(tb)}; as many at random ${fmt(tr)}`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(best));
