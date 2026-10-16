import fs from "node:fs";
import { City } from "../src/city.js";
import { Rng } from "../src/neat.js";
// A city planner genome: one gene per road, two-way, one-way, or one-way the
// other way. Barcelona's arrows evolved from scratch (every road two-way) by
// a (1+1) search, kept only if every junction can still reach every other.
// Fitness is the traffic model of tools/wardrop.mjs, per direction: a two-way
// road gives each direction its lanes, a one-way road gives its one direction
// the whole width (twice the lanes), as the sim does. Trips take the shortest
// path, as the evolved drivers do. Scored on trips the search never saw,
// against the real arrows and against no arrows at all.
//
//   LOAD=2 ITERS=400 node tools/oneway.mjs barcelona 7
const [map = "barcelona", seed = 7] = process.argv.slice(2);
const loadAt = +(process.env.LOAD || 2), iters = +(process.env.ITERS || 400), pairs = +(process.env.PAIRS || 300);
const c = new City(+seed * 31, { graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
const E = c.edges, rng = new Rng(+seed);
const real = E.map((e) => (e.oneway ? 1 : 0));
const apply = (g) => E.forEach((e, i) => c.setRoad(e, g[i]));

const odPairs = (n) => {
  const t = [];
  while (t.length < n) {
    const a = rng.int(c.nodes.length), b = rng.int(c.nodes.length), A = c.nodes[a], B = c.nodes[b];
    if (Math.hypot(A.x - B.x, A.y - B.y) >= 300) t.push([a, b]);
  }
  return t;
};
const train = odPairs(pairs), test = odPairs(pairs);

// flow per road and direction; cap is the lanes that direction gets
function cost(trips, q) {
  const fwd = new Float64Array(E.length), back = new Float64Array(E.length);
  for (const [a, b] of trips) {
    const p = c.route(a, b);
    for (let i = 1; i < p.length; i++) {
      const e = c.edgeBetween(p[i - 1], p[i]);
      (e.a === p[i - 1] ? fwd : back)[e.id] += q;
    }
  }
  let t = 0;
  for (const e of E) {
    const cap = e.oneway ? 2 * e.lanes : e.lanes;
    for (const x of [fwd[e.id], back[e.id]]) t += x * e.len * (1 + 0.15 * (x / cap) ** 4);
  }
  return { t, peak: Math.max(...E.map((e) => Math.max(fwd[e.id], back[e.id]) / (e.oneway ? 2 * e.lanes : e.lanes))) };
}

// demand: the busiest road at LOAD times its capacity with no arrows at all
const none = E.map(() => 0);
apply(none);
const q = loadAt / cost(train, 1).peak;
let best = none.slice(), bestT = cost(train, q).t;
const start = bestT;
for (let it = 0; it < iters; it++) {
  const cand = best.slice();
  for (let k = 1 + rng.int(3); k > 0; k--) cand[rng.int(E.length)] = rng.int(3);
  apply(cand);
  if (!c.stronglyConnected()) continue;
  const t = cost(train, q).t;
  if (t <= bestT) { best = cand; bestT = t; }
}

const score = (g) => (apply(g), cost(test, q).t);
const tNone = score(none), tReal = score(real), tBest = score(best);
const ones = best.filter((s) => s).length, agree = best.filter((s, i) => s && real[i] && s === real[i]).length;
const realOnes = real.filter((s) => s).length;
console.log(`${map} s${seed} load ${loadAt}: train ${(bestT / start).toFixed(3)} of no arrows`);
console.log(`unseen trips, total time vs no arrows: real arrows ${(tReal / tNone).toFixed(3)}, evolved ${(tBest / tNone).toFixed(3)}`);
console.log(`one-way roads: real ${realOnes}, evolved ${ones}; evolved one-ways on a real one-way, same direction: ${agree}, against it: ${best.filter((s, i) => s && real[i] && s !== real[i]).length}`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(best));
// the search only keeps what does not make the training trips slower
if (bestT > start) process.exitCode = 1;
