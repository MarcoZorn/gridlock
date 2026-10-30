// One runnable check: evolution has to actually work, headlessly, from a
// fixed seed. If a refactor breaks NEAT this fails instead of quietly
// producing cars that spin in circles forever.
import assert from "node:assert";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { World } from "./src/world.js";
import { Population } from "./src/neat.js";
import { Genome, Innovations } from "./src/genome.js";
import { Rng, crossover, distance, mutate, DEFAULTS } from "./src/neat.js";
import { Track } from "./src/track.js";
import { City } from "./src/city.js";
import { SpatialHash } from "./src/spatial.js";
import { CityWorld } from "./src/cityworld.js";
import { EcoWorld, ECON, gini, econParam, applyEcon } from "./src/ecoworld.js";
import { Body } from "./src/body.js";
import { HandBrain } from "./src/hand.js";
import { tape, replay } from "./tools/tapecars.mjs";
import { RETEST, PLANS, bullets, claimFor } from "./tools/reap.mjs";
import { arm as crashArm } from "./tools/crashkinds.mjs";
import { summary as crashSummary } from "./tools/crashmap.mjs";
import { info as roadInfo } from "./tools/roadinfo.mjs";
import { binomial, share as sideShare, wilson as sideWilson } from "./tools/sides.mjs";
import { describe as describeLine } from "./src/lineage.js";
import { Rewind } from "./src/rewind.js";
import { Crowd, PED } from "./src/pedestrians.js";
import { editNeuron } from "./src/netview.js";

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

// a save carries on exactly: the restored economy, pedestrians included,
// stays step for step with the one it was saved from
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const w = new EcoWorld({ seed: 5, founders: Population.fromJSON(trained.pop), pedestrians: 30 });
  for (let i = 0; i < 3000; i++) w.step();
  const b = EcoWorld.fromJSON(JSON.parse(JSON.stringify(w)));
  const sig = (x) => [x.cars.length, x.events.trips, x.events.crashes, x.rng.s, x.cars.reduce((a, d) => a + d.cash + d.x + d.y, 0), x.crowd.people.length].join(" ");
  for (let i = 0; i < 3000; i++) { w.step(); b.step(); }
  assert.strictEqual(sig(b), sig(w), "a restored economy must follow the original exactly");
  console.log("ok  a save carries on exactly");
}

// common random numbers: with ECON.keyed a rule that never fires leaves the
// run identical; without it the extra coin flips shift everyone's luck
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const run = (keyed, emergency) => {
    Object.assign(ECON, { keyed, emergency });
    const w = new EcoWorld({ seed: 5, founders: Population.fromJSON(trained.pop) });
    for (let i = 0; i < 1500; i++) w.step();
    return [w.cars.length, w.events.trips, w.rng.s, w.cars.reduce((a, d) => a + d.cash + d.x + d.y, 0)].join(" ");
  };
  const [k0, k1, u0, u1] = [run(1, 0), run(1, 1e-12), run(0, 0), run(0, 1e-12)];
  Object.assign(ECON, { keyed: 0, emergency: 0 });
  assert.strictEqual(k1, k0, "a rule that never fires must not change a keyed run");
  assert.notStrictEqual(u1, u0, "unkeyed, the same rule shifts the shared stream");
  console.log("ok  keyed draws: an inert rule changes nothing");
}

// FREEZE: with ECON.freezeAt set, children are exact copies, so no body is ever new
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  Object.assign(ECON, { freezeAt: 1 });
  try {
    const w = new EcoWorld({ seed: 9, founders: Population.fromJSON(trained.pop) });
    const seen = new Set(w.cars.map((c) => JSON.stringify(c.body)));
    for (let i = 0; i < 20000; i++) w.step();
    const born = w.log.reduce((a, r) => a + r.births, 0);
    assert(born > 0, "children were born");
    assert(w.cars.every((c) => seen.has(JSON.stringify(c.body))), "a frozen run makes no new bodies");
  } finally { ECON.freezeAt = 0; }
  console.log("ok  freezeAt: births copy, nothing mutates");
}

// HAND: the hand-written driver makes trips on a generated city, crashes less than
// four times a km, and neither mutation nor a save changes it
{
  Object.assign(ECON, { freezeAt: 1 });
  try {
    const w = new EcoWorld({ seed: 3, founders: HandBrain.founders() });
    for (let i = 0; i < 20000; i++) w.step();
    const trips = w.cars.reduce((a, d) => a + d.trips, 0), crashes = w.cars.reduce((a, d) => a + d.crashes, 0);
    const km = w.cars.reduce((a, d) => a + d.dist, 0) / 1000;
    assert(trips > 50, `the hand driver makes trips (${trips})`);
    assert(crashes / km < 4, `and rarely crashes (${crashes} in ${km.toFixed(0)} km)`);
    assert(w.cars.every((c) => c.genome.hand), "every child is the hand driver");
    const again = EcoWorld.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    assert(again.cars.every((c) => c.genome.hand), "a save keeps it");
  } finally { ECON.freezeAt = 0; }
  console.log("ok  hand driver: drives, does not evolve, survives a save");
}

// TAPE (racing cars): a saved population resumed with its own random stream carries on
// exactly as the original did; a fresh stream does not
{
  const w = new World({ seed: 5 });
  while (w.pop.generation < 6) w.runGeneration();
  const snap = JSON.parse(JSON.stringify(w.pop.toJSON()));
  for (let i = 0; i < 3; i++) w.runGeneration();   // then the fourth, stopped before it breeds, like replay()
  const lead = (x) => { const c = x.leader(); return [c.fitness(), JSON.stringify(c.genome.toJSON())]; };
  while (w.step()) {}
  const same = replay(5, snap, 0, 4), other = replay(5, snap, 99991, 4);
  assert.deepStrictEqual([same.fitness(), JSON.stringify(same.genome.toJSON())], lead(w), "same stream: same champion");
  assert.notStrictEqual(JSON.stringify(other.genome.toJSON()), lead(w)[1], "fresh stream: another champion");
  assert.strictEqual(tape(5, 6).generation, 6, "tape stops at the generation asked for");
  console.log("ok  racing-car tape: a save resumes exactly");
}

// REAP: the README's bullets parse, every re-test names real ECON rules, and a claim opens only under five
{
  const bs = bullets(fs.readFileSync("README.md", "utf8")), claims = fs.readFileSync("docs/claims.jsonl", "utf8").trim().split("\n").map(JSON.parse);
  assert(bs.length >= 10 && bs.some((b) => b.tested) && bs.some((b) => !b.tested), `README bullets parsed (${bs.length})`);
  for (const r of RETEST) {
    assert(bs.some((b) => b.title.startsWith(r.title)), `README still has the bullet "${r.title}"`);
    for (const kv of r.rules.split(",")) assert(kv.split("=")[0] in ECON, `${kv} is an ECON rule`);
  }
  const open = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, status: "open" }));
  assert.strictEqual(claimFor(RETEST[0], open(5)), null, "five open claims: nothing new opens");
  assert.strictEqual(claimFor(RETEST[0], open(2)).id, "C3", "under five: the next id");
  assert(claims.every((c) => c.id && c.cmd && c.predicted), "every claim has a command and a prediction");
  for (const b of bs) if (!b.tested && !RETEST.some((r) => b.title.startsWith(r.title))) assert(PLANS.some((p) => b.title.startsWith(p.title)), `a plan for "${b.title}"`);
  for (const p of PLANS) assert(p.tool === "new" || fs.existsSync(p.tool), `${p.tool} exists`);
  console.log("ok  reaper: bullets parse, re-tests use real rules, five-open rule holds");
}

// METHOD: the findings page's method section quotes the bootstrap size the trial tool really uses
{
  const page = fs.readFileSync("findings.html", "utf8"), trial = fs.readFileSync("tools/trial.mjs", "utf8");
  const reps = trial.match(/function bootstrap\(xs, reps = (\d+)\)/)[1];
  assert(page.includes('id="method"'), "findings page has its method section");
  assert(page.includes(`${reps} times`), `and says ${reps} bootstrap resamples, as trial.mjs does`);
  assert(/twenty seeds/.test(page) && /Wilson/.test(page), "and names the paired seeds and the Wilson interval");
  console.log("ok  findings page: method section agrees with the trial tool");
}

// LINEAGE (generation page): ancestry is tracked without touching the evolution, and walks back one
// generation per step
{
  const w = new World({ seed: 4 });
  for (let i = 0; i < 12; i++) w.runGeneration();
  assert.strictEqual(w.pop.rng.s, 828470956, "tracking ancestry draws no random numbers: the stream ends where it did before");
  assert.strictEqual(JSON.stringify(w.pop.genomes.map((g) => g.toJSON())).length, 74245, "and the population is the same");
  const chain = w.pop.lineage(w.leader().genome);
  assert(chain.length >= 10, `the leader's line goes back (${chain.length} entries)`);
  chain.forEach((a, i) => {
    if (i) assert.strictEqual(a.gen, chain[i - 1].gen + 1, "one generation per step");
    if (i) assert.strictEqual(a.parents[0], chain[i - 1].id, "the first parent is the previous entry");
    if (i < chain.length - 1) assert(a.fitness >= 0 && a.species > 0, "every past ancestor has a fitness and a species");
  });
  assert.strictEqual(chain.at(-1).gen, w.pop.generation, "the line ends in the current generation");
  assert(/species \d+/.test(describeLine(chain)) && /generations of ancestors known/.test(describeLine(chain)), "and the card names its species, even before the generation is speciated");
  const again = Population.fromJSON(JSON.parse(JSON.stringify(w.pop.toJSON())));
  assert.deepStrictEqual(again.lineage(again.genomes[0]), [], "a save starts a fresh ancestry");
  console.log("ok  lineage: ancestry tracked, evolution untouched");
}

// CONTRIBUTING: names files and rules that exist
{
  const c = fs.readFileSync("CONTRIBUTING.md", "utf8"), road = fs.readFileSync("ROADMAP.md", "utf8");
  for (const f of ["test.mjs", "docs/NOTEBOOK.md", "docs/claims.jsonl", "tools/trial.mjs", "tools/replay.mjs", "ROADMAP.md"]) assert(c.includes(f) && fs.existsSync(f), `CONTRIBUTING names ${f}, which exists`);
  assert(/At most five open claims/.test(c) && /At most five open claims/.test(road), "and the five-claim rule is the ROADMAP's");
  console.log("ok  CONTRIBUTING agrees with the repo");
}

// CRASHKINDS: crashes and car-car pairs are summed over days; a small city counts as collapsed
{
  const d = fs.mkdtempSync("tmp/crashkinds-");
  try {
    const write = (name, rows) => { fs.mkdirSync(`${d}/${name}`); fs.writeFileSync(`${d}/${name}/telemetry.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n")); };
    const day = (n, o) => [{ tick: n * 86400 - 1, crashes: 10, carCrashes: 4, trips: 3, cars: o.cars }, { tick: n * 86400, crashes: 20, carCrashes: 6, trips: 5, cars: o.cars }];
    write("a1", [3, 4].flatMap((n) => day(n, { cars: 100 })));
    write("a2", [3, 4].flatMap((n) => day(n, { cars: 20 })));
    const r = crashArm(`${d}/a{s}`, [1, 2], 2, 4);
    assert.strictEqual(r.runs, 2, "both runs read");
    assert.strictEqual(r.pairs, 2 * (4 + 6 + 4 + 6), "car-car pairs summed over rows in days 2-4");
    assert.strictEqual(r.crashes, 2 * (10 + 20 + 10 + 20), "crashes summed likewise");
    assert.deepStrictEqual(r.perSeed.map((x) => x.collapsed), [false, true], "the 20-car city is collapsed");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  console.log("ok  crashkinds: crashes, pairs, collapsed runs");
}

// CRASHLOG: opt-in, every crash with its kind and road, and switching it on changes nothing else
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const run = (on) => {
    ECON.crashLog = on;
    try { const w = new EcoWorld({ seed: 3, founders: Population.fromJSON(trained.pop) }); for (let i = 0; i < 6000; i++) w.step(); return w; }
    finally { ECON.crashLog = 0; }
  };
  const off = run(0), on = run(1);
  assert(!off.crashLog, "off by default: nothing is logged");
  assert(on.crashLog.length > 0 && on.crashLog.every((c) => c.length === 7 && (c[2] === "wall" || c[2] === "car") && c[3] >= 0), `crashes are logged (${on.crashLog.length}) with a kind and an impact`);
  assert.strictEqual(JSON.stringify(on.toJSON()), JSON.stringify(off.toJSON()), "and logging does not change the run");
  const d = fs.mkdtempSync("tmp/crashlog-");
  try {
    execFileSync("node", ["headless.mjs", "--eco", "--run", d, "--days", "1", "--founders", "docs/trained.json", "--seed", "3", "--crash-log"], { stdio: "pipe" });
    const rows = fs.readFileSync(`${d}/crashes.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
    assert(rows.length > 0 && rows.every((r) => r.length === 7), `headless --crash-log writes crashes.jsonl (${rows.length} lines)`);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  const sm = crashSummary([[1, 1, "car", 0.1, 5, 6, -1], [2, 2, "car", 0.3, 5, 6, 7], [3, 3, "wall", 0.2, 8, 9, -1]]);
  assert.deepStrictEqual([sm.n, sm.kinds.car, sm.kinds.wall, sm.junction, sm.roads, sm.top[0]], [3, 2, 1, 1, 2, ["5>6", 2]], "crashmap counts kinds, junctions and roads");
  const g = { nodes: [[0, 0], [30, 40], [30, 80]], edges: [[0, 1, 1, 1], [1, 2, 2, 0]], signals: [] };
  const ri = roadInfo(g, 0, 1);
  assert.deepStrictEqual([ri.length, ri.lanes, ri.oneway, ri.direction, ri.atTo.length], [50, 1, true, "with the arrow", 2], "roadinfo: length, lanes, one-way, neighbours");
  assert.strictEqual(roadInfo(g, 1, 0).direction, "against the arrow", "and which way the arrow points");
  assert.strictEqual(roadInfo(g, 0, 2), null, "and no road where there is none");
  console.log("ok  crash log: opt-in, kinds, and no effect on the run");
}

// SIDES: the share of cars keeping right, per run and day, and the coin-flip test
{
  assert(Math.abs(binomial(10, 20) - 1) < 1e-9 && Math.abs(binomial(5, 20) - 0.0414) < 1e-3 && binomial(0, 20) < 1e-5, "exact binomial two-sided p");
  assert(sideWilson(15, 20)[0] > 0.5 && sideWilson(10, 20)[0] < 0.5, "Wilson");
  const d = fs.mkdtempSync("tmp/sides-");
  try {
    fs.writeFileSync(`${d}/telemetry.jsonl`, [{ tick: 3 * 86400 + 600, sideAll: 100, sideRight: 80 }, { tick: 3 * 86400 + 1200, sideAll: 100, sideRight: 60 }, { tick: 5 * 86400, sideAll: 100, sideRight: 0 }].map((r) => JSON.stringify(r)).join("\n"));
    assert.strictEqual(sideShare(d, 4), 0.7, "day 4 counts only rows between day 3 and day 4");
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
  console.log("ok  sides: share per run, binomial, Wilson");
}

// the research tools run end to end: a two-seed trial and a two-replay
// rewind of one city hour, from clean caches, with real numbers out
{
  const sh = (cmd, env) => execFileSync("node", cmd, { env: { ...process.env, ...env }, encoding: "utf8" });
  // this run's own folders: two sessions running the tests at once must not delete each other's
  const rdir = `tmp/test-replay-${process.pid}`;
  fs.rmSync(rdir, { recursive: true, force: true });
  for (const s of [101, 102]) fs.rmSync(`runs/trial-grid-base-d1-s${s}`, { recursive: true, force: true }), fs.rmSync(`runs/trial-grid-basic_0.25-d1-s${s}`, { recursive: true, force: true });
  const tr = sh(["tools/trial.mjs", "grid", "basic=0.25"], { SEEDS: "2", DAYS: "1", FROM: "0" });
  assert(/2 seeds/.test(tr) && !/NaN/.test(tr), "trial prints intervals, not NaN:\n" + tr);
  const fr = sh(["tools/trial.mjs", "grid", "basic=0.25"], { SEEDS: "2", DAYS: "2", FROM: "1", FREEZE: "1" });
  assert(/2 seeds/.test(fr) && !/NaN/.test(fr), "frozen trial prints intervals:\n" + fr);
  const al = sh(["tools/trial.mjs", "grid"], { SEEDS: "2", DAYS: "1", FROM: "0", ALT: "maps/crossroads.json" });
  assert(/crossroads vs grid, 2 seeds/.test(al) && !/NaN/.test(al), "trial with ALT= compares two maps:\n" + al);
  const bd = sh(["tools/trial.mjs", "grid"], { SEEDS: "2", DAYS: "1", FROM: "0", BODY: "rayRange=60" });
  assert(/body rayRange=60 vs no rule, 2 seeds/.test(bd) && !/NaN/.test(bd), "trial with BODY= runs the treatment arm with that body:\n" + bd);
  const dr = sh(["tools/drunk.mjs"], { SEEDS: "2", FOG: "0.5" });
  assert(/against none, 2 seeds/.test(dr) && /distance per tick/.test(dr) && !/NaN/.test(dr), "drunk.mjs with SEEDS= prints paired intervals:\n" + dr);
  const fm = sh(["tools/families.mjs", "grid"], { SEEDS: "2", DAYS: "1", FOUNDERS: "hand" });
  assert(/hand-written drivers, 1 days, 2 seeds: a family owns over half the cars in \d of 2 runs/.test(fm), "families.mjs counts runs with a dominant family:\n" + fm);
  const sc = sh(["tools/stepcmp.mjs"], { SEEDS: "2", GENS: "4", TAIL: "2" });
  assert(/step 0.02 against 0.3, from scratch, 2 seeds/.test(sc) && !/NaN/.test(sc), "stepcmp.mjs prints a paired difference with an interval:\n" + sc);
  const pc = sh(["tools/percolation.mjs", "grid"], { ORDER0: "7" });
  assert(/with 5% of the roads closed, \d+\.\d% of the city still all connected, 95% interval \d+\.\d%-\d+\.\d% over 20 closure orders/.test(pc), "percolation.mjs prints the 5% figure with an interval:\n" + pc);
  const hd = sh(["tools/trial.mjs", "grid", "basic=0.25"], { SEEDS: "2", DAYS: "1", FROM: "0", FOUNDERS: "hand" });
  assert(/2 seeds/.test(hd) && !/NaN/.test(hd), "trial with hand-written founders prints intervals:\n" + hd);
  const rp = sh(["tools/replay.mjs", "grid", "3"], { REPS: "2", DAYS: "1", EVERY: "12", SPAN: "12", REPLAY_DIR: rdir });
  assert(/hour 0 \| [0-2]\/2 \|/.test(rp), "replay prints a win count out of its two replays:\n" + rp);
  // seed 0 is the control: same noise as the original, so it must end the same
  const d = `${rdir}/grid-s3-d1-e12`, end = JSON.parse(fs.readFileSync(`${d}/end.json`, "utf8"));
  const ctl = fs.readFileSync(`${d}/replays-evolving.jsonl`, "utf8").trim().split("\n").map(JSON.parse).find((r) => r.seed === 0);
  assert.strictEqual(ctl.won / ctl.cars, end.share, "replay with seed 0 reproduces the original run");
  assert.strictEqual(ctl.top, end.winner, "and ends with the same winning family");
  fs.rmSync(rdir, { recursive: true, force: true });
  console.log("ok  tools: trial and replay smoke, seed-0 replay reproduces the original");
}

// rewind: back to the start of this hour, then the hour before, and stepping
// on from a restore retraces the original run
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const w = new EcoWorld({ seed: 5, founders: Population.fromJSON(trained.pop) });
  const rw = new Rewind(3);
  const sig = (x) => [x.tick, x.cars.length, x.events.trips, x.rng.s, x.cars.reduce((a, d) => a + d.cash + d.x + d.y, 0)].join(" ");
  const at = {};
  while (w.tick < 8000) { w.step(); rw.record(w); if (w.tick % 3600 === 0) at[w.tick] = sig(w); }
  let b = rw.back(w);
  assert.strictEqual(sig(b), at[7200], "mid-hour: back to the start of the hour");
  b = rw.back(b);
  assert.strictEqual(sig(b), at[3600], "on the hour: back to the hour before");
  assert.strictEqual(rw.back(b), null, "nothing older than the saves");
  const c = new Rewind().back(w);
  assert.strictEqual(c, null, "no saves, no rewind");
  console.log("ok  rewind goes back hour by hour");
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

{
  // the editor's click on a road: two-way, one-way, the other way, closed
  const graph = { name: "block", nodes: [[40, 40], [240, 40], [240, 240], [40, 240], [40, 400]], edges: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 0, 1], [3, 4, 1]] };
  const c = new City(1, { graph });
  const top = c.edgeBetween(0, 1), spur = c.edgeBetween(3, 4);
  assert(c.cycleRoad(top) === 1 && c.route(1, 0).join() === "1,2,3,0", "one-way: back round the block");
  assert(c.cycleRoad(top) === 2 && c.route(0, 1).join() === "0,3,2,1", "the other way round");
  assert(c.cycleRoad(top) === 3 && c.closed.has(top.id) && !top.oneway, "then closed");
  assert(c.cycleRoad(top) === 0 && !c.closed.has(top.id) && top.a === 0, "then two-way, as it was");
  assert(c.cycleRoad(spur) === 3, "a dead end can not be one-way either way: straight to closed");
  // and a save replays it
  const w = new EcoWorld({ seed: 2, startCars: 5, graph });
  w.cycleRoad(w.city.edgeBetween(0, 1)); w.cycleRoad(w.city.edgeBetween(0, 1));
  const back = EcoWorld.fromJSON(JSON.parse(JSON.stringify(w)));
  const e = back.city.edgeBetween(0, 1);
  assert(e.oneway && e.a === 1 && e.b === 0, "a saved city keeps its one-way streets");
  console.log("ok  the editor makes streets one-way, either way, and never into a trap");
}

{
  // finish the fare: a broke car with a fare aboard stays until it delivers
  const w = new EcoWorld({ seed: 4, startCars: 30 });
  w.finishFare = 1;
  for (let i = 0; i < 1200 && !w.cars.some((d) => d.job && d.job.kind); i++) w.step();   // first trips carry nobody
  const busy = w.cars.find((d) => d.job && d.job.kind), idle = w.cars.find((d) => !d.job || !d.job.kind);
  assert(busy, "some car starts with a fare");
  busy.cash = -1;
  if (idle) idle.cash = -1;
  w.step();
  assert(w.cars.includes(busy), "a broke car with a fare aboard is still on the road");
  if (idle) assert(!w.cars.includes(idle), "a broke car with nothing aboard is gone");
  Object.assign(w, { congestion: 0.1, speedLimit: 35, freightBoom: 3, insurance: 1 });
  const back = EcoWorld.fromJSON(JSON.parse(JSON.stringify(w)));
  for (const k of ["finishFare", "congestion", "speedLimit", "freightBoom", "insurance"]) assert(back[k] === w[k], `the ${k} rule is saved with the city`);
  console.log("ok  a taxi that runs out of money still finishes the ride, and every rule is saved");
}

{
  // on a real map, with its many short bends, every pedestrian finds a road
  const c = new City(1, { graph: JSON.parse(fs.readFileSync("maps/turin.json", "utf8")) });
  const crowd = new Crowd(c, new Rng(9), 60);
  // most of Turin's roads are too short to cross, and the old pick, twenty
  // random roads, failed about 7 times in a million: these are three of the
  // random streams it failed on, plus a few hundred ordinary ones
  for (const seed of [82614, 104337, 113040, ...Array.from({ length: 300 }, (_, i) => 1000 + i)]) {
    const p = crowd.people[0];
    p.edge = undefined;
    p.pickSpot(new Rng(seed));
    assert(p.edge && Number.isFinite(p.x) && Number.isFinite(p.y), "a pedestrian always finds a road to cross");
  }
  console.log("ok  pedestrians on a real map always find a road to cross");
}

{
  // a person at the wheel: the pilot's steer and throttle replace the brain's
  const w = new EcoWorld({ seed: 2, startCars: 5 });
  const d = w.cars[0];
  for (let t = 0; t < 120; t++) w.step();
  d.pilot = (out) => { out[0] = 0; out[1] = -1; };
  for (let t = 0; t < 120; t++) w.step();
  assert(!w.cars.includes(d) || d.v <= 0, "a pilot braking hard stops the car (and backs it up)");
  assert(d.out[1] === -1, "the pilot's throttle is what the car used");
  console.log("ok  a pilot takes the wheel");
}

{
  // the brain view reads live neuron values back through the compiled slots
  const g = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop).genomes[0], inp = Array.from({ length: g.nIn }, (_, i) => Math.sin(i)), out = new Float64Array(8);
  g.activate(inp, out);
  const { buf, slot } = g._net;
  assert(g.outIds.every((id, k) => buf[slot.get(id)] === out[k]), "a neuron's live value is what the brain output");
  console.log("ok  live neuron values");
}

{
  // every economy knob survives a link; junk in a link is ignored
  const keep = { ...ECON };
  assert(econParam() === "", "a default economy needs no econ parameter");
  applyEcon("rank=0.3,ev=40,nonsense=5,carpool=abc,surge=");
  assert(ECON.rank === 0.3 && ECON.ev === 40 && !("nonsense" in ECON) && ECON.carpool === keep.carpool && ECON.surge === keep.surge, "known numbers set, the rest ignored");
  const link = econParam();
  Object.assign(ECON, keep);
  applyEcon(link);
  assert(ECON.rank === 0.3 && ECON.ev === 40 && econParam() === link, "a link puts the same economy back");
  Object.assign(ECON, keep);
  console.log("ok  economy knobs in a link");
}

{
  // a brain edited by hand: muting changes what it does, muting again undoes it
  const g = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop).genomes[0].clone();
  const inp = Array.from({ length: g.nIn }, (_, i) => Math.cos(i)), run = () => [...g.activate(inp, new Float64Array(8)).slice(0, 2)];
  const before = run(), busy = [...g.nodes.keys()].find((id) => id < g.nIn && [...g.conns.values()].some((c) => c.on && c.inId === id));
  editNeuron(g, busy, "mute");
  const muted = run();
  editNeuron(g, busy, "mute");
  assert(String(muted) !== String(before) && String(run()) === String(before), "mute changes the outputs, unmute restores them exactly");
  const w0 = [...g.conns.values()].map((c) => c.w);
  editNeuron(g, busy, "up"); editNeuron(g, busy, "down");
  assert([...g.conns.values()].every((c, i) => Math.abs(c.w - w0[i]) < 1e-12), "up then down puts the weights back");
  console.log("ok  a brain edited by hand");
}

{
  // sex only on crashing: every parent has hit a car that is still alive
  const birthCash = ECON.birthCash;
  ECON.crashMate = 1; ECON.birthCash = ECON.startCash + 1;   // births come early
  const w = new EcoWorld({ seed: 3, founders: Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop) });
  const birth = w.birth.bind(w);
  let births = 0, unmated = 0;
  w.birth = (p) => { births++; if (!p.mate || !w.cars.includes(p.mate)) unmated++; const c = birth(p); assert(!p.mate, "a crash is good for one child"); return c; };
  for (let t = 0; t < 6000; t++) w.step();
  ECON.crashMate = 0; ECON.birthCash = birthCash;
  assert(births > 0 && unmated === 0, `${births} births, ${unmated} without a crash partner`);
  console.log("ok  sex only on crashing");
}

assert(gini([1, 1, 1, 1]) === 0 && Math.abs(gini([0, 0, 0, 1]) - 0.75) < 1e-9, "gini: equal is 0, one of four holding everything is 0.75");
console.log("ok  inequality measured");

{
  // the findings page renders docs/claims.jsonl: every line must carry what it shows
  const lines = fs.readFileSync("docs/claims.jsonl", "utf8").trim().split("\n");
  for (const l of lines) { const c = JSON.parse(l); for (const k of ["id", "statement", "cmd", "predicted", "status", "opened"]) assert(c[k], `${c.id} lacks ${k}`); }
  assert(fs.readFileSync("findings.html", "utf8").includes("docs/claims.jsonl"), "findings page reads the claims");
  console.log(`ok  ${lines.length} claims well-formed`);
}

{
  // explain.mjs narrates a run from its telemetry: sentences present, no NaN
  const name = "explain-test", dir = `runs/${name}`;
  const traits = { length: 0.5, width: 0.5, engine: 0.5, brakes: 0.5, range: 0.5, rays: 0.5, cargo: 0.5, jam: 0.5 };
  const rows = [];
  for (let d = 0; d < 4; d++) for (let h = 1; h <= 2; h++) rows.push({ tick: d * 86400 + h * 3600, cars: 100 + d, trips: 50 + d, crashes: 5, carCrashes: 2, tripTicks: 6000, births: 3, deaths: 2, immigrants: 0, maxGen: d, gini: 0.3, traits: { ...traits, engine: 0.5 + d * 0.1 }, sideRight: 7, sideAll: 10, species: [1, 2] });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/telemetry.jsonl`, rows.map((r) => JSON.stringify(r)).join("\n"));
  try {
    const out = execFileSync("node", ["tools/explain.mjs", name], { encoding: "utf8" });
    assert(!/NaN|Infinity|undefined/.test(out), "explain: every number finite");
    for (const w of ["Over 3 days", "crashed", "A trip took", "Wealth was", "more engine", "kept to the right", "species were alive"]) assert(out.includes(w), `explain says: ${w}`);
  } finally { fs.rmSync(dir, { recursive: true }); }
  console.log("ok  explain.mjs narrates a short run");
}

// the time-lapse clock: one frame per slot, however many ticks pass between draws
{
  const { FrameClock } = await import("./src/timelapse.js");
  const c = new FrameClock(600);
  c.start(1000);
  const got = [1000, 1001, 1599, 1600, 1700, 5000, 5001, 5400].filter((t) => c.due(t));
  assert.deepStrictEqual(got, [1000, 1599, 5000, 5400], "a frame at the start, then one at each 600-tick boundary reached (1200, 4800, 5400)");
  assert.strictEqual(c.frames, 4);
  console.log("ok  time-lapse frames one per slot");
}

// the replay page's worker runs in node too, given a fetch that reads files:
// a base run with its snapshots, and a replay from one of them
{
  const out = [];
  const keep = { self: globalThis.self, fetch: globalThis.fetch };
  globalThis.self = { postMessage: (m) => { if (m.done) out.push(m); } };
  globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(new URL(u), "utf8")) });
  try {
    await import("./src/replayworker.js");
    await self.onmessage({ data: { kind: "base", map: "grid", seed: 3, days: 1, hours: [0, 6] } });
    const base = out.pop();
    assert(base.snaps[0] && base.snaps[6] && base.winner != null && base.share > 0, "the base run names a winner and keeps both snapshots");
    await self.onmessage({ data: { kind: "one", snap: base.snaps[6], seed: 1 } });
    const r = out.pop();
    assert(Number.isInteger(r.won) && r.cars > 0 && r.won <= r.cars, "a replay reports the winner's cars out of all");
  } finally { globalThis.self = keep.self; globalThis.fetch = keep.fetch; }
  console.log("ok  replay page worker: base run and a replay");
}

// lineage: every ancestor back to the founder, each with its body, the dead
// with what they earned (the eco page's lineage card draws from this)
{
  const trained = JSON.parse(fs.readFileSync("docs/trained.json", "utf8"));
  const w = new EcoWorld({ seed: 6, founders: Population.fromJSON(trained.pop) });
  for (let i = 0; i < 20000; i++) w.step();
  const d = w.cars.reduce((a, b) => (b.generation > a.generation ? b : a));
  const line = w.lineage(d);
  assert(d.generation >= 2 && line.length === d.generation + 1, `a car ${d.generation} generations deep has ${d.generation + 1} ancestors in its line, got ${line.length}`);
  assert(line[0].parent === -1 && line.at(-1).id === d.id, "from its founder to itself");
  assert(line.every((a) => Array.isArray(a.body) && a.body.length === 4 && a.body.every(Number.isFinite)), "each with its body");
  assert(line.filter((a) => a.died >= 0).every((a) => Number.isFinite(a.earned)), "and the dead with what they earned");
  console.log(`ok  lineage: ${line.length} ancestors with bodies and earnings`);
}

console.log("\nall checks passed");
