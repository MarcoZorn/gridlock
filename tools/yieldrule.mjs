import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { Genome } from "../src/genome.js";
import { bootstrap } from "./stats.mjs";
// Does yielding pay? The shipped drivers, with or without a coded rule bolted
//
//   node tools/yieldrule.mjs none|rule|wide
//   SEEDS=20 node tools/yieldrule.mjs     rule and wide against none on seeds 101.., paired, with 95% intervals
//
// on: near a junction, if a side ray sees a car closing in, brake hard.
let mode = process.argv[2] || "none";
const act = Genome.prototype.activate;
let forced = 0, calls = 0;
Genome.prototype.activate = function (inp, out) {
  act.call(this, inp, out);
  if (mode === "none") return out;
  calls++;
  const nearJunction = inp[18] < (mode === "wide" ? 0.5 : 0.3);
  // rays 0,1 and 3,4 look left and right of the nose; car distance is 3i+1, closing 3i+2
  const side = [0, 1, 3, 4].some((i) => inp[3 * i + 1] < 0.5 && inp[3 * i + 2] > 0.05);
  if (nearJunction && side) { out[1] = -1; forced++; }
  return out;
};
// POP=runs/x/state.json MAP=crossroads to try another population on another map
// JPRICE=10 makes a crash inside a junction cost ten times as much
import { Driver } from "../src/driver.js";
if (process.env.JPRICE) {
  const crash = Driver.prototype.crash, k = +process.env.JPRICE;
  Driver.prototype.crash = function (speed, scale = 1) {
    return crash.call(this, speed, this.city.junctionAt(this.x, this.y) >= 0 ? scale * k : scale);
  };
}
const pop = Population.fromJSON(JSON.parse(fs.readFileSync(process.env.POP || "docs/trained.json", "utf8")).pop);
const graph = process.env.MAP ? JSON.parse(fs.readFileSync(`maps/${process.env.MAP}.json`, "utf8")) : null;
// one arm over some seeds: sums over every car of every generation
function arm(m, seeds) {
  mode = m; forced = 0; calls = 0;
  let trips = 0, crashes = 0, n = 0, km = 0, fit = 0;
  for (const seed of seeds) {
    const e = new CityWorld({ seed, popSize: 120, traffic: true, density: 40, graph });
    for (let g = 0; g < 6; g++) {
      e.pop.genomes = pop.genomes; e.pop.generation = g; e.newGeneration();
      while (e.step()) {}
      for (const c of [...e.finished, ...e.cars]) { trips += c.trips; crashes += c.crashes; km += c.dist; fit += c.fitness(); n++; }
    }
  }
  return { trips, crashes, n, km, fit, forced, calls };
}
const line = (m, r) => `junction price x${process.env.JPRICE || 1} ${m.padEnd(6)} fitness ${(r.fit / r.n).toFixed(0)}  trips/car ${(r.trips / r.n).toFixed(2)}  crashes/car ${(r.crashes / r.n).toFixed(2)}  crashes per 1000 units ${(1000 * r.crashes / r.km).toFixed(2)}  rule fired ${(100 * r.forced / Math.max(1, r.calls)).toFixed(1)}% of ticks`;
if (!process.env.SEEDS) console.log(line(mode, arm(mode, [77, 91, 101])));
else {
  const n = +process.env.SEEDS, rows = [];
  for (let i = 0; i < n; i++) {
    const b = arm("none", [101 + i]), r = arm("rule", [101 + i]), w = arm("wide", [101 + i]);
    const m = (x) => ({ fit: x.fit / x.n, trips: x.trips / x.n, crashes: x.crashes / x.n });
    rows.push({ rule: [m(r), m(b)], wide: [m(w), m(b)] });
  }
  console.log(`junction price x${process.env.JPRICE || 1}, ${n} seeds, yielding rule against none: mean paired change, 95% interval, seeds up/down`);
  for (const arm_ of ["rule", "wide"]) for (const [k, name] of [["fit", "fitness"], ["trips", "trips per car"], ["crashes", "crashes per car"]]) {
    const ch = rows.map((r) => r[arm_][0][k] / r[arm_][1][k] - 1), mean = ch.reduce((a, b) => a + b, 0) / n, [lo, hi] = bootstrap(ch), f = (v) => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}%`;
    console.log(`  ${arm_.padEnd(5)} ${name.padEnd(16)} ${f(mean).padStart(8)}  [${f(lo)}, ${f(hi)}]  ${ch.filter((v) => v > 0).length} up / ${ch.filter((v) => v < 0).length} down${lo > 0 || hi < 0 ? "" : "  (not distinguishable from zero)"}`);
  }
}
