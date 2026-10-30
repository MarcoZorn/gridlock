import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { bootstrap } from "./stats.mjs";
// Two platforms. A share of the passengers book through B, the rest through
// A, and each keeps its own commission. A car drives for its parent's
// platform, one child in twenty switches. Where do the drivers end up?
// The ideal free distribution from ecology says: in proportion to what each
// platform pays out in all, (passenger share) x (1 - commission).
//
//   B=0.5 CA=0.1 CB=0.3 node tools/platforms.mjs turin 7   (SWITCH=0.01: fewer switch)
// SEEDS=20: seeds 101.., each run six days in its own process; the share of drivers on B at the
// end (the mean of the last day's samples) less the ideal free distribution, in points,
// with a 95% bootstrap interval.
const [map = "turin", seed = 7] = process.argv.slice(2);
Object.assign(ECON, { platformB: +(process.env.B || 0.5), commissionA: +(process.env.CA || 0.1), commissionB: +(process.env.CB || 0.3), switchPlatform: +(process.env.SWITCH || 0.05) });
const payA = (1 - ECON.platformB) * (1 - ECON.commissionA), payB = ECON.platformB * (1 - ECON.commissionB);
const ideal = 100 * payB / (payA + payB);

// drivers on B, in percent, every half day for six days
export function shares(map, seed) {
  const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
  const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
  const w = new EcoWorld({ seed: +seed, founders, graph });
  const half = DAY / DT / 2, out = [];
  for (let t = 0; t < 12 * half; t++) {
    w.step();
    if (t % half === half - 1) out.push(100 * w.cars.filter((d) => d.platform === 1).length / w.cars.length);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "one") {
    console.log(JSON.stringify(shares(process.argv[3], process.argv[4])));
  } else if (!process.env.SEEDS) {
    console.log(`${map} s${seed}, B books ${ECON.platformB}, commission A ${ECON.commissionA} B ${ECON.commissionB}, switch ${ECON.switchPlatform}: drivers on B by half-day ${shares(map, seed).map((x) => x.toFixed(0)).join(" ")}%; ideal free distribution ${ideal.toFixed(0)}%`);
  } else {
    const n = +process.env.SEEDS, seeds = Array.from({ length: n }, (_, i) => 101 + i), res = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, os.cpus().length - 2)) }, async () => {
      while (next < seeds.length) {
        const s = seeds[next++];
        const txt = await new Promise((ok) => { let o = ""; const p = spawn("node", ["tools/platforms.mjs", "one", map, String(s)], { env: process.env }); p.stdout.on("data", (b) => (o += b)); p.on("exit", () => ok(o)); });
        try { const xs = JSON.parse(txt); res.push({ seed: s, end: (xs.at(-1) + xs.at(-2)) / 2 }); } catch { console.error(`seed ${s} failed`); }
      }
    }));
    res.sort((a, b) => a.seed - b.seed);
    const d = res.map((r) => r.end - ideal), m = d.reduce((a, b) => a + b, 0) / d.length, [lo, hi] = bootstrap(d), f = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
    console.log(`${map}, B books ${ECON.platformB}, commission A ${ECON.commissionA} B ${ECON.commissionB}, switch ${ECON.switchPlatform}, ${res.length} seeds: drivers on B at the end ${(res.reduce((a, r) => a + r.end, 0) / res.length).toFixed(1)}% against the ideal free distribution ${ideal.toFixed(1)}%`);
    console.log(`  difference ${f(m)} points  [${f(lo)}, ${f(hi)}]  ${d.filter((x) => x > 0).length} above / ${d.filter((x) => x < 0).length} below`);
  }
}
