import fs from "node:fs";
import { City } from "../src/city.js";
import { Rng } from "../src/neat.js";
// Wardrop and the price of anarchy, on the real street graph with textbook
// traffic: each road takes len x (1 + 0.15 (flow / lanes)^4) to cross (BPR).
// Three ways to load the same trips:
//   shortest  every trip on its shortest path, traffic ignored (the evolved
//             drivers, whose jam gene sits near zero, route like this)
//   selfish   Wardrop user equilibrium: nobody can switch to a faster path
//   optimum   system optimum: total travel time as low as it goes
// Both equilibria by Frank-Wolfe; A* does the all-or-nothing step, fed the
// road costs through city.load with jam = 1.
//
//   PAIRS=300 node tools/wardrop.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), pairs = +(process.env.PAIRS || 300);
const c = new City(+seed * 31, { graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
const E = c.edges, rng = new Rng(+seed);
const trips = [];
while (trips.length < pairs) {
  // same rule as a fare: somewhere at least 300 away
  const a = rng.int(c.nodes.length), b = rng.int(c.nodes.length), A = c.nodes[a], B = c.nodes[b];
  if (Math.hypot(A.x - B.x, A.y - B.y) < 300) continue;
  const p = c.route(a, b);
  if (p) trips.push({ a, b, p });
}

const time = (e, x) => e.len * (1 + 0.15 * (x / e.lanes) ** 4);
const marginal = (e, x) => e.len * (1 + 0.75 * (x / e.lanes) ** 4);
const total = (x) => E.reduce((s, e) => s + x[e.id] * time(e, x[e.id]), 0);

function load(q, cost) {
  const y = new Float64Array(E.length);
  if (cost) { c.load = new Float32Array(E.length); for (const e of E) c.load[e.id] = cost[e.id] / e.len - 1; }
  for (const t of trips) {
    const p = cost ? c.route(t.a, t.b, -1, 1) : t.p;
    for (let i = 1; i < p.length; i++) y[c.edgeBetween(p[i - 1], p[i]).id] += q;
  }
  return y;
}

// Frank-Wolfe on the convex objective whose gradient is `f`: road time for
// the user equilibrium, marginal cost for the optimum.
function solve(q, f, iters = +(process.env.ITERS || 60)) {
  let x = load(q, null);
  for (let k = 0; k < iters; k++) {
    const y = load(q, E.map((e) => f(e, x[e.id])));
    let lo = 0, hi = 1;
    for (let b = 0; b < 30; b++) {
      const m = (lo + hi) / 2;
      let d = 0;
      for (const e of E) d += (y[e.id] - x[e.id]) * f(e, x[e.id] + m * (y[e.id] - x[e.id]));
      if (d > 0) hi = m; else lo = m;
    }
    for (let i = 0; i < x.length; i++) x[i] += lo * (y[i] - x[i]);
  }
  return x;
}

// Demand is set by how full the busiest road would be if everyone took the
// shortest path: flow over lanes, where 1 is the road's capacity.
const unit = load(1, null), peak = Math.max(...E.map((e) => unit[e.id] / e.lanes));
console.log(`${map} s${seed}, ${pairs} trips`);
console.log("busiest  shortest/opt  selfish/opt (price of anarchy)");
for (const v of [0.5, 1, 1.5, 2, 3, 4, 6]) {
  const q = v / peak, opt = total(solve(q, marginal)), short = total(load(q, null)) / opt, self = total(solve(q, time)) / opt;
  console.log(`${String(v).padStart(7)}  ${short.toFixed(3).padStart(12)}  ${self.toFixed(3).padStart(11)}`);
  // nothing beats the optimum; if something does, the solver has not converged
  if (short < 0.998 || self < 0.998) process.exitCode = 1;
}
