// Turn an OpenStreetMap extract (Overpass JSON elements: ways and their nodes)
// into a gridlock road graph. Shared by tools/osm.mjs and the eco page.
// See tools/osm.mjs for what it keeps and why.

const M_PER_UNIT = 0.4, MERGE = 12, MARGIN = 40, SIGNAL = 60;   // 60 units is 24 m
const LANES = { primary: 2, secondary: 2, tertiary: 1, residential: 1, unclassified: 1, living_street: 1 };

export function osmToGraph(els, name = "OpenStreetMap extract") {
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
  const edges = new Map(), kmh = new Map();   // pair key -> posted limit, km/h
  const speedOf = (t) => { const m = /^(\d+)\s*(mph)?$/.exec(t.maxspeed || ""); return m ? +m[1] * (m[2] ? 1.609 : 1) : 0; };
  for (const w of ways) {
    const per = w.tags.lanes ? Math.max(1, Math.min(2, Math.ceil(+w.tags.lanes / 2))) : LANES[w.tags.highway];
    const dir = direction(w.tags);
    for (let i = 1; i < w.nodes.length; i++) {
      if (!osmNodes.has(w.nodes[i - 1]) || !osmNodes.has(w.nodes[i])) continue;
      let a = node(w.nodes[i - 1]), b = node(w.nodes[i]);
      if (a === b) continue;
      if (dir < 0) [a, b] = [b, a];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`, old = edges.get(key);
      if (speedOf(w.tags)) kmh.set(key, Math.max(kmh.get(key) || 0, speedOf(w.tags)));
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
  const kept = [...edges.entries()].filter(([, [a, b]]) => keep[a] && keep[b]);
  const map = {
    name,
    attribution: "Map data © OpenStreetMap contributors, ODbL",
    nodes: nodes.map(([x, y]) => [Math.round(x - minX + MARGIN), Math.round(y - minY + MARGIN)]),
    edges: kept.map(([, [a, b, l, one]]) => (one ? [idx.get(a), idx.get(b), l, 1] : [idx.get(a), idx.get(b), l])),
  };
  // posted speed limits (maxspeed), km/h, by index into map.edges
  const limits = kept.map(([key], i) => [i, Math.round(kmh.get(key) || 0)]).filter(([, v]) => v);
  if (limits.length) map.maxspeed = limits;
  // Traffic signals (highway=traffic_signals) usually sit on the approach, a
  // few metres before the junction: each goes to the nearest junction of
  // three or more roads within SIGNAL units, if there is one.
  const deg = new Map();
  for (const [a, b] of map.edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
  const signals = new Set();
  for (const e of els) {
    if (e.type !== "node" || e.tags?.highway !== "traffic_signals") continue;
    const [x, y] = project(e), sx = x - minX + MARGIN, sy = y - minY + MARGIN;
    let best = -1, d0 = SIGNAL;
    map.nodes.forEach(([nx, ny], i) => { const d = Math.hypot(nx - sx, ny - sy); if ((deg.get(i) || 0) >= 3 && d < d0) { d0 = d; best = i; } });
    if (best >= 0) signals.add(best);
  }
  if (signals.size) map.signals = [...signals].sort((a, b) => a - b);
  return { map, opened };
}
