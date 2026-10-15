import fs from "node:fs";
import { City } from "../src/city.js";
import { Rng } from "../src/neat.js";
// Percolation: close random roads one at a time; what share of junctions can
// still reach, and be reached from, the biggest connected piece, obeying the arrows?
//
//   node tools/percolation.mjs turin        (TARGETED=1: busiest roads first)
const map = process.argv[2];
const c = new City(1, map === "grid" ? {} : { graph: JSON.parse(fs.readFileSync(map.endsWith(".json") ? map : `maps/${map}.json`, "utf8")) });
const strongest = (open) => {
  // biggest strongly connected piece among open roads (Kosaraju)
  const n = c.nodes.length, out = c.nodes.map(() => []), inn = c.nodes.map(() => []);
  for (const e of c.edges) if (open[e.id]) { out[e.a].push(e.b); inn[e.b].push(e.a); if (!e.oneway) { out[e.b].push(e.a); inn[e.a].push(e.b); } }
  const seen = new Uint8Array(n), order = [];
  for (let s = 0; s < n; s++) { if (seen[s]) continue; const st = [[s, 0]]; seen[s] = 1; while (st.length) { const top = st.at(-1); if (top[1] < out[top[0]].length) { const m = out[top[0]][top[1]++]; if (!seen[m]) { seen[m] = 1; st.push([m, 0]); } } else { order.push(top[0]); st.pop(); } } }
  const comp = new Int32Array(n).fill(-1); let best = 0;
  for (let k = n - 1; k >= 0; k--) { const s = order[k]; if (comp[s] >= 0) continue; let size = 0; const st = [s]; comp[s] = s; while (st.length) { const v = st.pop(); size++; for (const m of inn[v]) if (comp[m] < 0) { comp[m] = s; st.push(m); } } best = Math.max(best, size); }
  return best / n;
};
// TARGETED=1: close the busiest roads first, by how many shortest routes
// between 300 random pairs of junctions use them (sampled betweenness)
const targeted = !!process.env.TARGETED;
let busy = null;
if (targeted) {
  busy = new Array(c.edges.length).fill(0);
  const r = new Rng(9);
  for (let k = 0; k < 300; k++) {
    const a = r.int(c.nodes.length), b = r.int(c.nodes.length);
    const path = a === b ? null : c.route(a, b);
    if (path) for (let i = 0; i + 1 < path.length; i++) busy[c.edgeBetween(path[i], path[i + 1]).id]++;
  }
}
const rows = [];
for (let trial = 0; trial < (targeted ? 1 : 20); trial++) {
  const rng = new Rng(100 + trial), open = new Array(c.edges.length).fill(true);
  const order = targeted ? c.edges.map((e) => e.id).sort((x, y) => busy[y] - busy[x]) : c.edges.map((e) => e.id).sort(() => rng.next() - 0.5);
  order.forEach((id, k) => { open[id] = false; const f = (k + 1) / order.length; const bin = Math.round(f * 20); if (Math.abs(f * 20 - bin) < 0.5 / order.length * 20 + 1e-9) (rows[bin] ||= []).push(strongest(open)); });
}
const at = (p) => { const r = rows[Math.round(p * 20)] || []; return r.length ? (100 * r.reduce((a, b) => a + b, 0) / r.length).toFixed(0) + "%" : "-"; };
console.log(map.padEnd(10), targeted ? "busiest first" : "at random", "share of the city still all connected, with this many roads closed: 5%", at(0.05), " 10%", at(0.1), " 20%", at(0.2), " 30%", at(0.3), " 50%", at(0.5));
