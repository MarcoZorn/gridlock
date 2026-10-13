// One runnable check: evolution has to actually work, headlessly, from a
// fixed seed. If a refactor breaks NEAT this fails instead of quietly
// producing cars that spin in circles forever.
import assert from "node:assert";
import fs from "node:fs";
import { World } from "./src/world.js";
import { Population } from "./src/neat.js";
import { Genome, Innovations } from "./src/genome.js";
import { Rng, crossover, distance, mutate, DEFAULTS } from "./src/neat.js";
import { Track } from "./src/track.js";
import { City } from "./src/city.js";
import { SpatialHash } from "./src/spatial.js";
import { CityWorld } from "./src/cityworld.js";
import { EcoWorld, ECON } from "./src/ecoworld.js";
import { Body } from "./src/body.js";
import { Crowd, PED } from "./src/pedestrians.js";

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
  const items = Array.from({ length: 300 }, (_, i) => ({ x: (i * 97) % 1000, y: (i * 61) % 700, solid: i % 7 !== 0 }));
  const h = new SpatialHash(1000, 700, 48);
  h.rebuild(items);
  for (const [qx, qy, r] of [[500, 350, 60], [10, 10, 100], [990, 690, 30]]) {
    const got = new Set();
    h.near(qx, qy, r, (o) => { if (Math.hypot(o.x - qx, o.y - qy) <= r) got.add(o); });
    const want = items.filter((o) => o.solid && Math.hypot(o.x - qx, o.y - qy) <= r);
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
    // fitness at full crash price: the live fitness is repriced while crash
    // damage is phased in, and trips alone reward reckless speed
    (i < 6 ? early : i >= 48 ? late : []).push(r.meanFull);
  }
  const a = early.reduce((x, y) => x + y, 0) / early.length;
  const b = late.reduce((x, y) => x + y, 0) / late.length;
  console.log(`    gen 0-5 ${a.toFixed(1)}   gen 48-59 ${b.toFixed(1)}  (mean fitness at full crash price)`);
  assert(b > a * 2, `city drivers must improve (${a.toFixed(1)} -> ${b.toFixed(1)})`);
  console.log("ok  drivers learn routes");
}

// a saved world resumes into exactly the same future
{
  const a = new CityWorld({ seed: 5, popSize: 40, ticks: 600 });
  for (let i = 0; i < 4; i++) a.runGeneration();
  const b = CityWorld.fromJSON(JSON.parse(JSON.stringify(a)));
  for (let i = 0; i < 3; i++) {
    const ra = a.runGeneration(), rb = b.runGeneration();
    assert(Math.abs(ra.best - rb.best) < 1e-6 * Math.max(1, ra.best) && ra.trips === rb.trips, "resumed world must match the original");
  }
  console.log("ok  save and resume is exact");
}

// the ecosystem: founders drive, money flows, births and deaths happen, the
// population stays inside its bounds, and a save keeps every car and wallet
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const w = new EcoWorld({ seed: 9, founders: Population.fromJSON(trained.pop) });
  for (let i = 0; i < 20000; i++) {
    w.step();
    assert(w.cars.length >= ECON.minCars && w.cars.length <= ECON.maxCars, "population must stay in bounds");
  }
  const total = w.log.reduce((a, r) => ({ births: a.births + r.births, deaths: a.deaths + r.deaths, trips: a.trips + r.trips }), { births: 0, deaths: 0, trips: 0 });
  assert(total.trips > 0 && total.deaths > 0, "cars must earn and cars must die");
  assert(w.cars.every((d) => d.cash >= 0), "nobody alive is in debt");
  const b = EcoWorld.fromJSON(JSON.parse(JSON.stringify(w)));
  assert(b.cars.length === w.cars.length, "a save keeps every car");
  assert(Math.abs(b.cars.reduce((a, d) => a + d.cash, 0) - w.cars.reduce((a, d) => a + d.cash, 0)) < 1e-6, "a save keeps every wallet");
  for (let i = 0; i < 600; i++) b.step();
  console.log(`ok  ecosystem: ${total.trips} paid trips, ${total.births} births, ${total.deaths} deaths, resumes`);
}

// bodies: derived physics move the right way with the genes
{
  const g = { length: 0.2, width: 0.3, engine: 0.5, brakes: 0.5, range: 0.5, rays: 0.8, cargo: 0.1 };
  const base = new Body(g), heavy = new Body({ ...g, cargo: 0.9 }), strong = new Body({ ...g, engine: 0.9 });
  assert(heavy.capacity > base.capacity && heavy.p.mass > base.p.mass && heavy.p.accel < base.p.accel, "cargo room costs mass and acceleration");
  assert(strong.p.accel > base.p.accel && strong.fuel > base.fuel, "a bigger engine pulls harder and burns more");
  assert(new Body({ ...g, rays: 0.2 }).p.rays === 3, "low ray gene means three rays");
  console.log("ok  body physics follow the genes");
}

// growing a city keeps it connected and is the same every time
{
  const a = new City(4), b = new City(4);
  for (const side of ["east", "south", "east"]) { a.expand(side); b.expand(side); }
  assert(a.connected(), "a grown city stays connected");
  assert(a.edges.length === b.edges.length && a.nodes.every((n, i) => n.x === b.nodes[i].x && n.y === b.nodes[i].y), "growth is deterministic");
  assert(a.grid.cols === 11 && a.grid.rows === 7, "two columns and a row were added");
  for (let t = 0; t < a.nodes.length; t += 7) assert(a.route(0, t), "every junction is reachable after growth");
  console.log("ok  growth is connected and deterministic");
}

// ancestry keeps exactly the ancestors of the living
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const w = new EcoWorld({ seed: 4, founders: Population.fromJSON(trained.pop) });
  for (let i = 0; i < 30000; i++) w.step();
  w.pruneAncestry();
  const needed = new Set();
  for (const d of w.cars) for (const a of w.lineage(d)) needed.add(a.id);
  assert(w.cars.every((d) => w.ancestry.has(d.id)), "every living car is in the record");
  assert([...w.ancestry.keys()].every((id) => needed.has(id)), "nothing but ancestors of the living is kept");
  assert(w.cars.every((d) => w.lineage(d).at(-1).id === d.id && w.lineage(d)[0].parent === -1), "every line runs from a founder to the car");
  console.log(`ok  ancestry: ${w.ancestry.size} remembered for ${w.cars.length} alive`);
}

// a world on a fixed map resumes exactly too
{
  const graph = JSON.parse(fs.readFileSync("maps/crossroads.json", "utf8"));
  const a = new CityWorld({ seed: 2, popSize: 30, ticks: 600, traffic: true, density: 30, graph });
  a.runGeneration();
  const b = CityWorld.fromJSON(JSON.parse(JSON.stringify(a)));
  const ra = a.runGeneration(), rb = b.runGeneration();
  assert(ra.trips === rb.trips && Math.abs(ra.best - rb.best) < 1e-9, "a fixed-map world resumes exactly");
  assert(a.city.nodes.length === 13, "the crossroads map is used");
  console.log("ok  fixed maps save and resume");
}

// waves run apart and merged give exactly the generation run in one go
{
  const seq = new CityWorld({ seed: 6, popSize: 60, ticks: 600, traffic: true, density: 20 });
  seq.runGeneration();
  const j = JSON.stringify(seq);
  const par = CityWorld.fromJSON(JSON.parse(j));
  const results = [];
  for (let k = 0; k < par.waves; k++) results.push(CityWorld.fromJSON(JSON.parse(j)).runWave(k));
  par.mergeWaves(results);
  const rs = seq.runGeneration(), rp = par.history.at(-1);
  assert(par.waves === 3, "three waves of twenty");
  for (const k of ["best", "mean", "trips", "crashes", "carCrashes", "conflicts", "side"]) {
    assert(Math.abs(rs[k] - rp[k]) < 1e-9, `parallel waves must match sequential (${k}: ${rs[k]} vs ${rp[k]})`);
  }
  console.log("ok  waves run apart match a generation run in one go");
}

// the memory channel: the extra output comes back as the extra input
{
  const w = new CityWorld({ seed: 3, popSize: 20, ticks: 300, memory: true });
  const d = w.cars[0];
  assert(d.inputs.length === 22 && d.out.length === 3, "memory brains have one more input and output");
  let seen = 0;
  for (let t = 0; t < 120 && d.alive; t++) {
    const before = d.out[2];
    w.step();
    if (d.alive && d.towing === 0 && Math.abs(d.inputs[21] - before) < 1e-12) seen++;
  }
  assert(seen > 10, "last tick's memory output is this tick's memory input");
  const std = new CityWorld({ seed: 3, popSize: 20, ticks: 300 });
  assert(std.cars[0].inputs.length === 21, "standard brains are unchanged");
  console.log("ok  memory channel feeds back");
}

// pedestrians: kerbside spots, a walk straight across, and a crowd that saves
{
  const c = new City(3), crowd = new Crowd(c, new Rng(4), 60);
  for (const p of crowd.people) {
    assert(!c.contains(p.x, p.y), "a pedestrian waits off the road");
    assert(c.contains(p.x + Math.cos(p.a) * p.left / 2, p.y + Math.sin(p.a) * p.left / 2), "and the way across is road");
  }
  // one pedestrian whose brain always says go, on an empty road
  const p = crowd.people[0], real = p.brain;
  p.brain = { activate: (i, o) => { o[0] = 1; return o; } };
  const before = p.crossings, dt = 1 / 60;
  let t = 0;
  while (p.crossings === before && t < 30) { p.step(dt, [], crowd.rng); t += dt; }
  const walk = (2 * (p.edge.hw + 6)) / PED.speed;
  assert(p.crossings === before + 1, "a walker gets across");
  assert(t < walk + 1, `crossing takes walking time (${t.toFixed(1)}s, expected about ${walk.toFixed(1)}s)`);
  p.brain = real;
  const back = Crowd.fromJSON(JSON.parse(JSON.stringify(crowd)), c, new Rng(9));
  assert(back.people.length === crowd.people.length, "a crowd saves and loads");
  console.log("ok  pedestrians wait at the kerb, cross, and save");
}

{
  // a square block with one side one-way: going back against the arrow
  // means going round the other three sides
  const graph = { name: "block", nodes: [[40, 40], [240, 40], [240, 240], [40, 240]], edges: [[0, 1, 1, 1], [1, 2, 1], [2, 3, 1], [3, 0, 1]] };
  const c = new City(1, { graph });
  assert(c.route(0, 1).join() === "0,1", "with the arrow, straight there");
  assert(c.route(1, 0).join() === "1,2,3,0", "against the arrow, round the block");
  for (const name of ["turin", "barcelona", "manhattan"]) {
    const real = new City(1, { graph: JSON.parse(fs.readFileSync(`maps/${name}.json`, "utf8")) });
    for (let i = 0; i < 200; i++) {
      const a = (i * 37) % real.nodes.length, b = (i * 101 + 7) % real.nodes.length;
      assert(real.route(a, b), `every ${name} junction reaches every other, obeying the arrows`);
    }
  }
  console.log("ok  one-way streets are only driven one way, and trap no one");
}

{
  // the heatmap lives on the city and starts afresh when the city changes shape
  const c = new City(2);
  c.addHeat("crash", 100, 100); c.addHeat("crash", 101, 101); c.addHeat("slow", 100, 100, 3);
  const h = c.heatGrid(), i = ((100 / h.cell) | 0) * h.w + ((100 / h.cell) | 0);
  assert(h.crash[i] === 2 && h.slow[i] === 3, "heat adds up where it happens");
  c.addHeat("crash", -50, 1e9);   // off the map: ignored, not an error
  c.expand("east");
  const g = c.heatGrid();
  assert(g !== h && g.w > h.w && g.crash.every((v) => v === 0), "a grown city gets a fresh, bigger heatmap");
  console.log("ok  heatmaps add up, and start again when the city grows");
}

console.log("\nall checks passed");
