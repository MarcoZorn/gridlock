import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// A city that grows where demand is unmet: every night ROADS new streets are
// built, each the short link between two nearby junctions that would have
// cut the most distance off the day's actual fares. Against the same number
// of streets placed at random among the same candidates (more road is more
// road), and against no building. Candidates: unlinked junctions 60-260 apart,
// the new street crossing no other and passing no third junction. Demand on
// the real maps is already at its cap, so building does not add passengers.
// Each day: fares, mean seconds per fare, and streets built so far.
//
//   ROADS=3 node tools/grow.mjs turin 7     (ARMS=demand for one arm)
const [map = "turin", seed = 7] = process.argv.slice(2), roads = +(process.env.ROADS || 3), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
// shortest distances from every junction, one-way streets respected
// ponytail: n Dijkstras with a linear scan, O(n^3); fine at a few hundred junctions
function allPairs(c) {
  const n = c.nodes.length, D = [];
  for (let s = 0; s < n; s++) {
    const d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
    d[s] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i;
      if (d[u] === Infinity) break;
      done[u] = 1;
      for (const e of c.nodes[u].edges) {
        if (e.oneway && e.a !== u) continue;
        const v = c.other(e, u);
        if (d[u] + e.len < d[v]) d[v] = d[u] + e.len;
      }
    }
    D.push(d);
  }
  return D;
}
for (const arm of (process.env.ARMS || "none,random,demand").split(",")) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const c = w.city, rng = new Rng(+seed + 99);
  let fares = [];
  const orig = w.randomFare.bind(w);
  w.randomFare = (from, came, jam) => { const r = orig(from, came, jam); if (r) fares.push([from, r[r.length - 1]]); return r; };
  const out = [];
  let built = 0;
  for (let day = 1; day <= days; day++) {
    if (day > 1 && arm !== "none") {
      for (let k = 0; k < roads; k++) {
        const cand = c.buildable();
        let pick;
        if (arm === "random") pick = cand[rng.int(cand.length)];
        else {
          const D = allPairs(c), sample = fares.slice(-1500);
          let best = -1;
          for (const [a, b, len] of cand) {
            let save = 0;
            for (const [s, t] of sample) save += Math.max(0, D[s][t] - Math.min(D[s][a] + len + D[b][t], D[s][b] + len + D[a][t]));
            if (save > best) { best = save; pick = [a, b, len]; }
          }
        }
        if (pick && w.build(pick[0], pick[1])) built++;
      }
    }
    fares = [];
    let n = 0, ticks = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips, k = w.events.tripTicks;
      w.step();
      n += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      ticks += w.events.tripTicks >= k ? w.events.tripTicks - k : w.events.tripTicks;
    }
    out.push(`${n} ${Math.round((ticks / Math.max(1, n)) * DT)}s`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(6)} +${built}: ${out.join(" | ")}`);
}
