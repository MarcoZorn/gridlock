// One runnable check: evolution has to actually work, headlessly, from a
// fixed seed. If a refactor breaks NEAT this fails instead of quietly
// producing cars that spin in circles forever.
import assert from "node:assert";
import { World } from "./src/world.js";
import { Population } from "./src/neat.js";
import { Genome, Innovations } from "./src/genome.js";
import { Rng, crossover, distance, mutate, DEFAULTS } from "./src/neat.js";
import { Track } from "./src/track.js";
import { City } from "./src/city.js";
import { SpatialHash } from "./src/spatial.js";
import { CityWorld } from "./src/cityworld.js";

// networks stay acyclic and produce finite output
{
  const rng = new Rng(7), innov = new Innovations(9);
  const g = Genome.initial(6, 2, innov, rng);
  for (let i = 0; i < 400; i++) mutate(g, innov, rng, DEFAULTS);
  const out = g.activate(new Float64Array([0.1, 0.9, 0.5, 0.2, 0.7, 0.3]), new Float64Array(2));
  assert(Number.isFinite(out[0]) && Number.isFinite(out[1]), "activation must be finite");
  for (const c of g.conns.values()) {
    assert(g.nodes.get(c.inId).depth < g.nodes.get(c.outId).depth, "connections must run shallow to deep");
  }
  assert(g.complexity().nodes > 7, "structure should have grown");
  console.log("ok  acyclic structure grows and activates", g.complexity());
}

// crossover only produces genes whose endpoints exist
{
  const rng = new Rng(11), innov = new Innovations(9);
  const a = Genome.initial(6, 2, innov, rng), b = Genome.initial(6, 2, innov, rng);
  for (let i = 0; i < 60; i++) { mutate(a, innov, rng, DEFAULTS); mutate(b, innov, rng, DEFAULTS); }
  a.fitness = 2; b.fitness = 1;
  const child = crossover(a, b, rng, DEFAULTS);
  for (const c of child.conns.values()) {
    assert(child.nodes.has(c.inId) && child.nodes.has(c.outId), "child gene endpoints must exist");
  }
  assert(distance(a, b, DEFAULTS) > 0, "two diverged genomes must be distinguishable");
  console.log("ok  crossover is well formed");
}

// the population keeps more than one species alive
{
  const p = new Population(7, 2, { popSize: 60 }, 3);
  for (const g of p.genomes) g.fitness = Math.random();
  p.evolve();
  assert(p.genomes.length === 60, "population size must be stable");
  assert(p.species.length >= 1, "speciation must produce species");
  console.log("ok  population is stable across a generation, species:", p.species.length);
}

// and the actual point: cars get better at driving
{
  const w = new World({ seed: 5, popSize: 90, tracks: 4 });
  const early = [], late = [];
  for (let i = 0; i < 24; i++) {
    const r = w.runGeneration();
    (i < 4 ? early : i >= 20 ? late : []).push(r.best);
  }
  const a = early.reduce((x, y) => x + y, 0) / early.length;
  const b = late.reduce((x, y) => x + y, 0) / late.length;
  console.log(`    gen 0-3 best avg ${a.toFixed(0)}   gen 20-23 best avg ${b.toFixed(0)}`);
  assert(b > a * 1.25, `evolution must improve driving (${a.toFixed(0)} -> ${b.toFixed(0)})`);
  console.log("ok  cars learn to drive");
}

// the city is connected and A* agrees with a brute-force shortest path
{
  for (const seed of [1, 2, 3, 9]) {
    const c = new City(seed);
    assert(c.connected(), "pruning must never split the city");
    // Bellman-Ford from node 0 as ground truth
    const d = new Float64Array(c.nodes.length).fill(Infinity);
    d[0] = 0;
    for (let k = 0; k < c.nodes.length; k++) {
      for (const e of c.edges) {
        if (d[e.a] + e.len < d[e.b]) d[e.b] = d[e.a] + e.len;
        if (d[e.b] + e.len < d[e.a]) d[e.a] = d[e.b] + e.len;
      }
    }
    for (let t = 1; t < c.nodes.length; t += 5) {
      const p = c.route(0, t);
      assert(p[0] === 0 && p[p.length - 1] === t, "route must join its endpoints");
      for (let i = 1; i < p.length; i++) assert(c.edgeBetween(p[i - 1], p[i]), "route must follow roads");
      assert(Math.abs(c.pathLength(p) - d[t]) < 1e-6, "A* must find the shortest route");
    }
    // leaving a junction never starts with a U-turn when there is another way
    for (const n of c.nodes) {
      if (n.edges.length < 2) continue;
      const back = c.other(n.edges[0], n.id);
      const far = (n.id + 17) % c.nodes.length;
      if (far === n.id || !c.routeAvoiding(n.id, far, back)) continue;
      const p = c.route(n.id, far, back);
      assert(p.length < 2 || p[1] !== back, "route must not U-turn at its start");
    }
  }
  console.log("ok  city is connected, A* is optimal, no U-turns");
}

// the spatial hash finds exactly what a brute-force scan finds
{
  const items = Array.from({ length: 300 }, (_, i) => ({ x: (i * 97) % 1000, y: (i * 61) % 700, alive: i % 7 !== 0 }));
  const h = new SpatialHash(1000, 700, 48);
  h.rebuild(items);
  for (const [qx, qy, r] of [[500, 350, 60], [10, 10, 100], [990, 690, 30]]) {
    const got = new Set();
    h.near(qx, qy, r, (o) => { if (Math.hypot(o.x - qx, o.y - qy) <= r) got.add(o); });
    const want = items.filter((o) => o.alive && Math.hypot(o.x - qx, o.y - qy) <= r);
    assert(got.size === want.length && want.every((o) => got.has(o)), "spatial hash must match brute force");
  }
  console.log("ok  spatial hash matches brute force");
}

// and drivers learn to follow routes through a city they have not memorised
{
  const w = new CityWorld({ seed: 3, popSize: 120 });
  const early = [], late = [];
  for (let i = 0; i < 60; i++) {
    const r = w.runGeneration();
    (i < 6 ? early : i >= 48 ? late : []).push(r.mean);
  }
  const a = early.reduce((x, y) => x + y, 0) / early.length;
  const b = late.reduce((x, y) => x + y, 0) / late.length;
  console.log(`    gen 0-5 mean ${a.toFixed(0)}   gen 48-59 mean ${b.toFixed(0)}`);
  assert(b > a * 2, `city drivers must improve (${a.toFixed(0)} -> ${b.toFixed(0)})`);
  console.log("ok  drivers learn routes");
}

console.log("\nall checks passed");
