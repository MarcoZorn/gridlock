import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { gini } from "../src/ecoworld.js";
// Ants against cars: a road network by stigmergy. Every fare delivered
// leaves a unit of pheromone on each road of its route; pheromone halves
// every HALF hours; and every route is chosen by length times
// (1 - A x pheromone), pheromone measured against the most-marked road, so
// a busy road looks shorter and draws more. Nobody plans the trunk roads;
// do they appear, and do they help? Against plain shortest paths (A=0):
// each day, fares, seconds a fare, car crashes per 1000 units, and the Gini
// of distance driven per road (0 every road alike, 1 all on one).
//
//   A=0.5 HALF=1 node tools/ants.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const A = +(process.env.A || 0.5), half = +(process.env.HALF || 1);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT, hour = Math.round(perDay / 24);
for (const a of [0, A]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, E = c.edges.length, n = c.nodes.length;
  const pher = new Float64Array(E), used = new Float64Array(E);
  let top = 1;
  if (a) {
    // ponytail: Dijkstra with a linear scan, O(n^2) a route; fine at a few hundred junctions
    c.routeAvoiding = function (from, to, ban, jam = 0) {
      const g = new Float64Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      g[from] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && g[i] < Infinity && (u < 0 || g[i] < g[u])) u = i;
        if (u < 0) return null;
        if (u === to) break;
        done[u] = 1;
        for (const e of this.nodes[u].edges) {
          const m = this.other(e, u);
          if (u === from && m === ban) continue;
          if (e.oneway && e.a !== u) continue;
          if (this.closed && this.closed.has(e.id)) continue;
          const cost = (jam && this.load ? e.len * (1 + jam * this.load[e.id]) : e.len) * (1 - a * pher[e.id] / top);
          if (g[u] + cost < g[m]) { g[m] = g[u] + cost; came[m] = u; }
        }
      }
      const path = [to];
      while (path[0] !== from) path.unshift(came[path[0]]);
      return path;
    };
  }
  const pay = w.pay.bind(w);
  w.pay = (d) => {
    const r = d.route, kind = d.job && d.job.kind;
    pay(d);
    if (!kind || !r) return;
    for (let i = 1; i < r.length; i++) { const e = c.edgeBetween(r[i - 1], r[i]); if (e) pher[e.id]++; }
    top = Math.max(1, ...pher);
  };
  const out = [];
  for (let day = 1; day <= days; day++) {
    used.fill(0);
    let fares = 0, ticks = 0, hits = 0, dist = 0;
    for (let t = 0; t < perDay; t++) {
      const ev = w.events, f = ev.trips, k = ev.tripTicks, h = ev.carCrashes;
      w.step();
      const nv = w.events, fresh = nv !== ev;   // events are reset now and then inside step()
      fares += fresh ? nv.trips : nv.trips - f;
      ticks += fresh ? nv.tripTicks : nv.tripTicks - k;
      hits += fresh ? nv.carCrashes : nv.carCrashes - h;
      for (const d of w.cars) {
        const s = Math.abs(d.v) * DT;
        dist += s;
        const e = d.route && c.edgeBetween(d.route[d.seg], d.route[d.seg + 1]);
        if (e) used[e.id] += s;
      }
      if ((t + 1) % (half * hour) === 0) for (let i = 0; i < E; i++) pher[i] /= 2;
    }
    out.push(`${fares} ${Math.round((ticks / Math.max(1, fares)) * DT)}s ${(1000 * hits / dist).toFixed(2)} g${gini([...used]).toFixed(2)}`);
  }
  console.log(`${map} s${seed} A=${a}: ${out.join(" | ")}`);
}
