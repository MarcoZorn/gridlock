// Turn an OpenStreetMap extract (Overpass JSON, ways with their nodes) into
// a gridlock road graph.
//
//   node tools/osm.mjs extract.json maps/name.json "Place name"
//
// Every way node becomes a junction, so bends are kept as gentle junctions
// rather than straightened out; nodes closer together than MERGE units are
// welded into one, and only the largest connected piece of the network is
// kept. One-way streets are treated as two-way: nothing in the simulation
// knows about direction yet.
//
// Map data © OpenStreetMap contributors, ODbL.
import fs from "node:fs";

const [src, dst, name = "OpenStreetMap extract"] = process.argv.slice(2);
if (!src || !dst) { console.error("usage: node tools/osm.mjs extract.json out.json [name]"); process.exit(1); }

const M_PER_UNIT = 0.4, MERGE = 12, MARGIN = 40;
const LANES = { primary: 2, secondary: 2, tertiary: 1, residential: 1, unclassified: 1, living_street: 1 };

const els = JSON.parse(fs.readFileSync(src, "utf8")).elements;
const osmNodes = new Map(els.filter((e) => e.type === "node").map((e) => [e.id, e]));
const ways = els.filter((e) => e.type === "way" && e.tags && LANES[e.tags.highway] !== undefined);

// equirectangular projection about the middle of the extract: fine at city scale
const lats = [...osmNodes.values()].map((n) => n.lat), lons = [...osmNodes.values()].map((n) => n.lon);
const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2, lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
const R = 6371000, kx = Math.cos((lat0 * Math.PI) / 180);
const project = (n) => [((n.lon - lon0) * Math.PI / 180) * R * kx / M_PER_UNIT, -((n.lat - lat0) * Math.PI / 180) * R / M_PER_UNIT];

// weld nearby points: each OSM node maps to a graph node
const pts = [], of = new Map();
const node = (id) => {
  if (of.has(id)) return of.get(id);
  const [x, y] = project(osmNodes.get(id));
  let k = pts.findIndex(([px, py]) => Math.hypot(px - x, py - y) < MERGE);
  if (k < 0) { k = pts.length; pts.push([x, y]); }
  of.set(id, k);
  return k;
};

const edges = new Map();
for (const w of ways) {
  const per = w.tags.lanes ? Math.max(1, Math.min(2, Math.ceil(+w.tags.lanes / 2))) : LANES[w.tags.highway];
  for (let i = 1; i < w.nodes.length; i++) {
    if (!osmNodes.has(w.nodes[i - 1]) || !osmNodes.has(w.nodes[i])) continue;
    const a = node(w.nodes[i - 1]), b = node(w.nodes[i]);
    if (a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    edges.set(key, [Math.min(a, b), Math.max(a, b), Math.max(per, edges.get(key)?.[2] || 0)]);
  }
}

// keep the largest connected piece
const adj = pts.map(() => []);
for (const [a, b] of edges.values()) { adj[a].push(b); adj[b].push(a); }
const comp = new Int32Array(pts.length).fill(-1);
let best = -1, bestSize = 0;
for (let s = 0; s < pts.length; s++) {
  if (comp[s] >= 0 || !adj[s].length) continue;
  const stack = [s]; comp[s] = s; let size = 0;
  while (stack.length) { const n = stack.pop(); size++; for (const m of adj[n]) if (comp[m] < 0) { comp[m] = s; stack.push(m); } }
  if (size > bestSize) { bestSize = size; best = s; }
}
const keep = pts.map((_, i) => comp[i] === best);
const idx = new Map();
const nodes = [];
pts.forEach((p, i) => { if (keep[i]) { idx.set(i, nodes.length); nodes.push(p); } });
const minX = Math.min(...nodes.map((p) => p[0])), minY = Math.min(...nodes.map((p) => p[1]));
const out = {
  name,
  attribution: "Map data © OpenStreetMap contributors, ODbL",
  nodes: nodes.map(([x, y]) => [Math.round(x - minX + MARGIN), Math.round(y - minY + MARGIN)]),
  edges: [...edges.values()].filter(([a, b]) => keep[a] && keep[b]).map(([a, b, l]) => [idx.get(a), idx.get(b), l]),
};
fs.writeFileSync(dst, JSON.stringify(out));
console.log(`${name}: ${out.nodes.length} junctions, ${out.edges.length} roads`);
