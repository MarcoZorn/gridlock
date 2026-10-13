// Turn an OpenStreetMap extract (Overpass JSON, ways with their nodes) into
// a gridlock road graph.
//
//   node tools/osm.mjs extract.json maps/name.json "Place name"
//
// Every way node becomes a junction, so bends are kept as gentle junctions
// rather than straightened out; nodes closer together than MERGE units are
// welded into one, and only the largest connected piece of the network is
// kept. One-way streets stay one-way (`[a, b, lanes, 1]` runs from a to b
// only), and the piece kept is the largest one where every junction can
// still be reached from every other, obeying the arrows.
//
// Map data © OpenStreetMap contributors, ODbL.
import fs from "node:fs";

const [src, dst, name = "OpenStreetMap extract"] = process.argv.slice(2);
if (!src || !dst) { console.error("usage: node tools/osm.mjs extract.json out.json [name]"); process.exit(1); }

const M_PER_UNIT = 0.4, MERGE = 12, MARGIN = 40;
const LANES = { primary: 2, secondary: 2, tertiary: 1, residential: 1, unclassified: 1, living_street: 1 };

const raw = fs.readFileSync(src, "utf8");
if (!raw.trimStart().startsWith("{")) {
  // Overpass answers errors (busy, timeout) with an HTML page, not JSON
  console.error(`${src} is not Overpass JSON; the server probably refused the query, try again later`);
  process.exit(1);
}
const els = JSON.parse(raw).elements;
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

// oneway=yes/1/true, or a roundabout, runs the way the way is drawn; -1 against it
const direction = (t) => (t.oneway === "-1" ? -1 : ["yes", "1", "true"].includes(t.oneway) || (t.junction === "roundabout" && t.oneway !== "no") ? 1 : 0);

// one entry per pair of junctions: [a, b, lanes, oneway], a to b in the
// direction of travel when one-way; two ways drawn over the same pair in
// opposite directions make a two-way road
const edges = new Map();
for (const w of ways) {
  const per = w.tags.lanes ? Math.max(1, Math.min(2, Math.ceil(+w.tags.lanes / 2))) : LANES[w.tags.highway];
  const dir = direction(w.tags);
  for (let i = 1; i < w.nodes.length; i++) {
    if (!osmNodes.has(w.nodes[i - 1]) || !osmNodes.has(w.nodes[i])) continue;
    let a = node(w.nodes[i - 1]), b = node(w.nodes[i]);
    if (a === b) continue;
    if (dir < 0) [a, b] = [b, a];
    const key = a < b ? `${a}-${b}` : `${b}-${a}`, old = edges.get(key);
    const lanes = Math.max(per, old?.[2] || 0);
    if (!old) edges.set(key, dir ? [a, b, lanes, 1] : [Math.min(a, b), Math.max(a, b), lanes, 0]);
    else if (!dir || !old[3] || old[0] !== a) edges.set(key, [old[0], old[1], lanes, 0]);
    else old[2] = lanes;
  }
}

// Largest strongly connected piece (Kosaraju, iteratively): the junctions
// from which every other one can be reached, obeying the arrows.
function strongest() {
  const out = pts.map(() => []), inn = pts.map(() => []);
  for (const [a, b, , one] of edges.values()) {
    out[a].push(b); inn[b].push(a);
    if (!one) { out[b].push(a); inn[a].push(b); }
  }
  const order = [], seen = new Uint8Array(pts.length);
  for (let s = 0; s < pts.length; s++) {
    if (seen[s] || !out[s].length) continue;
    const stack = [[s, 0]]; seen[s] = 1;
    while (stack.length) {
      const top = stack.at(-1), [n, i] = top;
      if (i < out[n].length) { top[1]++; const m = out[n][i]; if (!seen[m]) { seen[m] = 1; stack.push([m, 0]); } }
      else { order.push(n); stack.pop(); }
    }
  }
  const comp = new Int32Array(pts.length).fill(-1), size = new Map();
  for (let k = order.length - 1; k >= 0; k--) {
    const s = order[k];
    if (comp[s] >= 0) continue;
    const stack = [s]; comp[s] = s; let n0 = 0;
    while (stack.length) { const n = stack.pop(); n0++; for (const m of inn[n]) if (comp[m] < 0) { comp[m] = s; stack.push(m); } }
    size.set(s, n0);
  }
  const best = [...size].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return pts.map((_, i) => comp[i] === best);
}

// A one-way street that leaves the extract and comes back to it somewhere
// else, or not at all, would be a trap: cars go in and there is no way back
// inside the map. Out there they would turn round, or go round the block, so
// a one-way road joining the main piece to a street that cannot get back to
// it is made two-way, a layer at a time, until every street is in.
let keep = strongest(), opened = 0;
for (;;) {
  let changed = false;
  for (const e of edges.values()) {
    if (e[3] && keep[e[0]] !== keep[e[1]]) { e[3] = 0; opened++; changed = true; }
  }
  if (!changed) break;
  keep = strongest();
}

const idx = new Map();
const nodes = [];
pts.forEach((p, i) => { if (keep[i]) { idx.set(i, nodes.length); nodes.push(p); } });
const minX = Math.min(...nodes.map((p) => p[0])), minY = Math.min(...nodes.map((p) => p[1]));
const map = {
  name,
  attribution: "Map data © OpenStreetMap contributors, ODbL",
  nodes: nodes.map(([x, y]) => [Math.round(x - minX + MARGIN), Math.round(y - minY + MARGIN)]),
  edges: [...edges.values()].filter(([a, b]) => keep[a] && keep[b]).map(([a, b, l, one]) => (one ? [idx.get(a), idx.get(b), l, 1] : [idx.get(a), idx.get(b), l])),
};
fs.writeFileSync(dst, JSON.stringify(map));
console.log(`${name}: ${map.nodes.length} junctions, ${map.edges.length} roads, ${map.edges.filter((e) => e[3]).length} one-way (${opened} opened to two-way so no street is a trap)`);
