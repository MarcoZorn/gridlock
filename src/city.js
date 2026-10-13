// The city: a road graph, and the tarmac it implies.
//
// Everything in here is coded, not evolved. Where the roads go, how wide they
// are, and how you get from A to B are fixed facts of the world. What the cars
// evolve is how to drive the route they are handed.
import { Rng } from "./neat.js";

export const LANE_W = 9;
export const LIGHT = { green: 5, allRed: 1.5, get cycle() { return (this.green + this.allRed) * 2; } };
const CELL = 4;

// A jittered grid. A perfect grid reads as a spreadsheet; nudging every
// junction a little gives streets that meet at slightly wrong angles, which is
// both more like a real city and harder to drive, since no turn is exactly 90.
export class City {
  constructor(seed = 1, { cols = 9, rows = 6, spacing = 150, jitter = 0.22, prune = 0.18 } = {}) {
    const rng = new Rng(seed * 2246822519 + 3);
    this.seed = seed;
    const margin = 60;
    this.w = (cols - 1) * spacing + margin * 2;
    this.h = (rows - 1) * spacing + margin * 2;

    this.nodes = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const edge = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
        const jx = edge ? 0 : rng.range(-jitter, jitter) * spacing;
        const jy = edge ? 0 : rng.range(-jitter, jitter) * spacing;
        this.nodes.push({ id: this.nodes.length, x: margin + i * spacing + jx, y: margin + j * spacing + jy, edges: [] });
      }
    }

    // One or two arterial rows and columns. They are wider, so they carry more
    // lanes, which matters later when everyone wants the same road.
    const artRows = new Set([1 + rng.int(rows - 2)]);
    const artCols = new Set([1 + rng.int(cols - 2)]);
    if (cols > 6) artCols.add(1 + rng.int(cols - 2));

    const id = (i, j) => j * cols + i;
    const cand = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (i + 1 < cols) cand.push([id(i, j), id(i + 1, j), artRows.has(j)]);
        if (j + 1 < rows) cand.push([id(i, j), id(i, j + 1), artCols.has(i)]);
      }
    }
    this.edges = [];
    for (const [a, b, art] of cand) this.addEdge(a, b, art ? 2 : 1);

    // Knock out side streets at random, but never one that would split the
    // city in two. Removing an edge can leave a junction with a single road,
    // and that is where dead ends come from: nobody draws them on purpose.
    const order = this.edges.filter((e) => e.lanes === 1).map((e) => e.id);
    for (let k = order.length - 1; k > 0; k--) {
      const r = rng.int(k + 1);
      [order[k], order[r]] = [order[r], order[k]];
    }
    const target = Math.round(order.length * prune);
    let removed = 0;
    for (const eid of order) {
      if (removed >= target) break;
      const e = this.edges[eid];
      if (this.degree(e.a) <= 1 || this.degree(e.b) <= 1) continue;
      e.dead = true;
      if (this.connected()) removed++;
      else e.dead = false;
    }
    this.edges = this.edges.filter((e) => !e.dead);
    this.edges.forEach((e, i) => (e.id = i));
    for (const n of this.nodes) n.edges = [];
    for (const e of this.edges) { this.nodes[e.a].edges.push(e); this.nodes[e.b].edges.push(e); }

    this.bake();

    // Traffic lights at every junction where three or more roads meet. The
    // roads are split into two groups by axis (roughly "north-south" and
    // "east-west" for that junction) which take turns, with an all-red gap
    // between them. Offsets are random so the city does not pulse in step.
    this.control = "none";
    this.time = 0;
    for (const n of this.nodes) {
      if (n.edges.length < 3) continue;
      const axis = (e) => {
        const m = this.nodes[this.other(e, n.id)];
        return Math.atan2(m.y - n.y, m.x - n.x);
      };
      const a0 = axis(n.edges[0]);
      const group = new Map();
      for (const e of n.edges) {
        const d = Math.abs(Math.sin(axis(e) - a0));   // 0 along the first road's axis, 1 across it
        group.set(this.other(e, n.id), d < 0.7 ? 0 : 1);
      }
      n.light = { group, offset: rng.range(0, LIGHT.cycle) };
    }
  }

  // Is the light green for a car driving into junction `node` from `from`?
  // Junctions without a light, and every junction when lights are off, are
  // always "green": nothing stops you, for better or worse.
  green(node, from) {
    const n = this.nodes[node];
    if (this.control !== "lights" || !n.light) return true;
    const t = (this.time + n.light.offset) % LIGHT.cycle;
    const g = n.light.group.get(from);
    if (g === 0) return t < LIGHT.green;
    return t >= LIGHT.green + LIGHT.allRed && t < LIGHT.green * 2 + LIGHT.allRed;
  }

  addEdge(a, b, lanes) {
    const na = this.nodes[a], nb = this.nodes[b];
    const e = { id: this.edges.length, a, b, lanes, hw: lanes * LANE_W, len: Math.hypot(nb.x - na.x, nb.y - na.y) };
    this.edges.push(e);
    na.edges.push(e); nb.edges.push(e);
    return e;
  }

  degree(n) { return this.nodes[n].edges.filter((e) => !e.dead).length; }
  other(e, n) { return e.a === n ? e.b : e.a; }

  connected() {
    const seen = new Uint8Array(this.nodes.length);
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
      const n = stack.pop();
      for (const e of this.nodes[n].edges) {
        if (e.dead) continue;
        const m = this.other(e, n);
        if (!seen[m]) { seen[m] = 1; count++; stack.push(m); }
      }
    }
    return count === this.nodes.length;
  }

  // Same trick as a drawn track: bake every road into a grid once, then any
  // "am I on tarmac" question is a single array read. The roads are capsules
  // (a segment with round ends), so junctions fill themselves in for free.
  bake() {
    this.gw = Math.ceil(this.w / CELL);
    this.gh = Math.ceil(this.h / CELL);
    this.mask = new Uint8Array(this.gw * this.gh);
    for (const e of this.edges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      const r = e.hw + 2;
      const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r) / CELL));
      const x1 = Math.min(this.gw - 1, Math.ceil((Math.max(a.x, b.x) + r) / CELL));
      const y0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r) / CELL));
      const y1 = Math.min(this.gh - 1, Math.ceil((Math.max(a.y, b.y) + r) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const px = (gx + 0.5) * CELL, py = (gy + 0.5) * CELL;
          if (segDist(px, py, a.x, a.y, b.x, b.y) <= e.hw + 2) this.mask[gy * this.gw + gx] = 1;
        }
      }
    }
    // Junctions get a wider apron than the roads that meet there, the way real
    // corners are rounded off. Without it a turn has to fit inside the overlap
    // of two road ends, which means crawling, and evolution almost never finds
    // a brain that brakes that hard before it has learned to turn at all.
    this.junction = new Int16Array(this.gw * this.gh).fill(-1);
    for (const n of this.nodes) {
      const r = Math.max(...n.edges.map((e) => e.hw)) + 8;
      const x0 = Math.max(0, Math.floor((n.x - r) / CELL)), x1 = Math.min(this.gw - 1, Math.ceil((n.x + r) / CELL));
      const y0 = Math.max(0, Math.floor((n.y - r) / CELL)), y1 = Math.min(this.gh - 1, Math.ceil((n.y + r) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          if (Math.hypot((gx + 0.5) * CELL - n.x, (gy + 0.5) * CELL - n.y) <= r) {
            this.mask[gy * this.gw + gx] = 1;
            this.junction[gy * this.gw + gx] = n.id;
          }
        }
      }
      n.r = r;
    }
    // Roundabout islands, used only when the junctions are run as
    // roundabouts: a solid disc in the middle of every 3+ way junction.
    this.island = new Uint8Array(this.gw * this.gh);
    for (const n of this.nodes) {
      if (n.edges.length < 3) continue;
      n.island = n.r * 0.38;
      const r = n.island;
      const x0 = Math.max(0, Math.floor((n.x - r) / CELL)), x1 = Math.min(this.gw - 1, Math.ceil((n.x + r) / CELL));
      const y0 = Math.max(0, Math.floor((n.y - r) / CELL)), y1 = Math.min(this.gh - 1, Math.ceil((n.y + r) / CELL));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          if (Math.hypot((gx + 0.5) * CELL - n.x, (gy + 0.5) * CELL - n.y) <= r) this.island[gy * this.gw + gx] = 1;
        }
      }
    }
  }

  contains(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    const c = ((y / CELL) | 0) * this.gw + ((x / CELL) | 0);
    return this.mask[c] === 1 && !(this.roundabouts && this.island[c] === 1);
  }

  get roundabouts() { return this.control === "roundabouts"; }

  // Which junction apron a point is in, or -1.
  junctionAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.junction[((y / CELL) | 0) * this.gw + ((x / CELL) | 0)];
  }

  edgeBetween(a, b) {
    for (const e of this.nodes[a].edges) if (this.other(e, a) === b) return e;
    return null;
  }

  // A*, with straight-line distance as the heuristic. On a road graph that is
  // admissible (no road is shorter than the crow flies), so the first time the
  // goal comes off the open set the path is optimal. A binary heap would win
  // past a few thousand nodes; at fifty, a linear scan is faster to read.
  // ponytail: O(n) open-set scan, swap for a heap if cities grow past ~2k nodes.
  //
  // `cameFrom` is the junction the car just drove in from. Leaving by the same
  // road is a U-turn, which no car can make inside a junction, so the first
  // step may not go back there unless there is no other way out.
  route(from, to, cameFrom = -1) {
    if (from === to) return [from];
    if (cameFrom >= 0 && this.nodes[from].edges.length > 1) {
      const p = this.routeAvoiding(from, to, cameFrom);
      if (p) return p;
    }
    return this.routeAvoiding(from, to, -1);
  }

  routeAvoiding(from, to, ban) {
    const n = this.nodes.length, goal = this.nodes[to];
    const g = new Float64Array(n).fill(Infinity);
    const f = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const open = new Set([from]);
    g[from] = 0;
    f[from] = Math.hypot(goal.x - this.nodes[from].x, goal.y - this.nodes[from].y);
    while (open.size) {
      let cur = -1;
      for (const k of open) if (cur < 0 || f[k] < f[cur]) cur = k;
      if (cur === to) {
        const path = [to];
        while (path[0] !== from) path.unshift(came[path[0]]);
        return path;
      }
      open.delete(cur);
      for (const e of this.nodes[cur].edges) {
        const m = this.other(e, cur);
        if (cur === from && m === ban) continue;
        const t = g[cur] + e.len;
        if (t < g[m]) {
          g[m] = t;
          came[m] = cur;
          const nm = this.nodes[m];
          f[m] = t + Math.hypot(goal.x - nm.x, goal.y - nm.y);
          open.add(m);
        }
      }
    }
    return null;
  }

  pathLength(path) {
    let d = 0;
    for (let i = 1; i < path.length; i++) {
      const a = this.nodes[path[i - 1]], b = this.nodes[path[i]];
      d += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return d;
  }
}

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
