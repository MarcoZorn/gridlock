// Ties the population to the city: hand out trips, run a generation, evolve.
import { Population, Rng } from "./neat.js";
import { City } from "./city.js";
import { Driver, BODY, N_INPUTS, N_OUTPUTS } from "./driver.js";
import { SpatialHash } from "./spatial.js";

export const DT = 1 / 60;
// One world unit is 0.4 m: a car is 4 m long and a lane 3.6 m wide.
export const M_PER_UNIT = 0.4;
const HEAT_CELL = 12;
const DAMAGE_RAMP = 100;

export class CityWorld {
  // `density` is how many cars share the streets at once. The population is
  // driven in waves of that size, so the same brains can be tested in a quiet
  // city or a packed one without changing anything about evolution.
  // `control` is what runs the junctions: "none" or "lights". It is a switch
  // on the same population, so the same brains can be compared under both.
  // `graph` replaces the rotating generated cities with one fixed map (see
  // tools/osm.mjs, or maps/crossroads.json).
  constructor({ seed = 1, popSize = 120, ticks = 3600, traffic = false, cities = 6, density = 40, pop = null, control = "none", size = null, graph = null } = {}) {
    this.seed = seed;
    this.control = control;
    this.opts = { seed, popSize, ticks, cities, size, graph };
    this.density = density;
    this.ticksPerGen = ticks;
    this.traffic = traffic;
    // Gentler weight mutation than the track demo. In a shared city a broken
    // mutant is not just a bad score, it is an obstacle for everyone else, and
    // the default (80% of weights nudged by 0.4 every generation) breaks a lot.
    //
    // Stagnation is counted over ten trips round the cities, not three. A
    // species' best is compared across generations raced in different cities,
    // so a run of hard cities looks like stagnation and the default (18
    // generations) culled species for the luck of the draw. Over five seeds,
    // 300 generations: 182 at 18, 212 at 60, 219 with no culling at all.
    this.pop = pop || new Population(N_INPUTS, N_OUTPUTS, { popSize, pWeight: 0.5, weightStep: 0.15, stagnation: 60 }, seed);
    this.rng = new Rng(seed * 7919 + 5);
    // A handful of cities, rotated per generation, for the same reason the
    // track demo rotates tracks: evolve in one city and you get drivers who
    // know that city, not drivers who can read a road.
    this.cities = graph ? [new City(seed * 31, { graph })] : Array.from({ length: cities }, (_, i) => new City(seed * 31 + i, size || {}));
    this.history = [];
    this.newGeneration();
  }

  // One shared chain of destinations per generation. Every car drives the same
  // trips in the same order, so a fitness difference is a driving difference
  // and not a luck-of-the-draw-on-routes difference.
  makeChain(len) {
    const c = this.city, n = c.nodes.length;
    const chain = [this.rng.int(n)];
    while (chain.length < len) {
      const prev = c.nodes[chain[chain.length - 1]];
      let pick, tries = 0;
      do {
        pick = this.rng.int(n);
        tries++;
      } while (tries < 50 && Math.hypot(c.nodes[pick].x - prev.x, c.nodes[pick].y - prev.y) < 300);
      chain.push(pick);
    }
    this.routes = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const prev = this.routes[i - 1];
      this.routes.push(c.route(chain[i], chain[i + 1], prev ? prev[prev.length - 2] : -1));
    }
    return chain;
  }

  // A fare from `from` to somewhere at least `minDist` away, never starting
  // with a U-turn back to `cameFrom`.
  fare(from, cameFrom = -1, minDist = 300) {
    const c = this.city, n = c.nodes.length, a = c.nodes[from], rng = this.waveRng || this.rng;
    let to, tries = 0;
    do { to = rng.int(n); tries++; }
    while (tries < 50 && (to === from || Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < minDist));
    return c.route(from, to, cameFrom);
  }

  // Heatmaps live on the city, not the generation, so they build up over
  // every generation that drives there and show where trouble keeps happening.
  heatOf(city) {
    if (!city.heat) {
      const w = Math.ceil(city.w / HEAT_CELL), h = Math.ceil(city.h / HEAT_CELL);
      city.heat = { w, h, cell: HEAT_CELL, crash: new Float32Array(w * h), slow: new Float32Array(w * h) };
    }
    return city.heat;
  }

  heatAdd(grid, x, y, v) {
    const h = this.heat, gx = (x / h.cell) | 0, gy = (y / h.cell) | 0;
    if (gx >= 0 && gy >= 0 && gx < h.w && gy < h.h) grid[gy * h.w + gx] += v;
  }

  newGeneration() {
    this.genRng = this.rng.s;   // a save restarts this generation exactly
    this.city = this.cities[this.pop.generation % this.cities.length];
    this.city.control = this.control;
    this.heat = this.heatOf(this.city);
    this.hash = new SpatialHash(this.city.w, this.city.h);
    this.finished = [];
    this.wave = 0;
    if (this.traffic) {
      // Every wave draws its fares from its own random stream, seeded now.
      // That makes a wave's outcome depend only on its seed and its drivers,
      // so waves can run in any order, or all at once on separate threads,
      // and give the same generation.
      const n = Math.max(1, Math.min(this.density, this.pop.genomes.length));
      this.waves = Math.ceil(this.pop.genomes.length / n);
      this.waveSeeds = Array.from({ length: this.waves }, () => this.rng.int(2 ** 31));
      this.startWave();
    } else {
      this.chain = this.makeChain(12);
      const onArrive = (d) => this.routes[d.trips] || null;
      this.cars = this.pop.genomes.map((g) => {
        const d = new Driver(g, this.city, this.routes[0]);
        d.onArrive = onArrive;
        return d;
      });
    }
    this.cars.forEach((d, i) => (d.id = i));
    this.carCrashes = 0;
    this.side = { sum: 0, abs: 0, n: 0 };
    this.conflicts = new Set();     // crossing pairs met inside a junction
    this.conflictCrashes = 0;       // ...of which ended in a collision
    this.wireCars();
    this.tick = 0;
    this.done = false;
  }

  // In traffic every car has its own fares from its own corner of town.
  // Scores are no longer strictly comparable, which is the price of sharing
  // the road; over a minute of driving the luck mostly averages out.
  startWave() {
    const n = Math.max(1, Math.min(this.density, this.pop.genomes.length));
    const genomes = this.pop.genomes.slice(this.wave * n, (this.wave + 1) * n);
    this.waveRng = new Rng(this.waveSeeds[this.wave] + 1);
    const onArrive = (d, here) => this.fare(here, d.route[d.route.length - 2]);
    this.cars = genomes.map((g, i) => {
      const d = new Driver(g, this.city, this.fare(this.waveRng.int(this.city.nodes.length)), this.waveRng.range(0.15, 0.75));
      d.genomeIndex = this.wave * n + i;
      d.onArrive = onArrive;
      d.id = i;
      return d;
    });
    this.waves = Math.ceil(this.pop.genomes.length / n);
    this.tick = 0;
    this.wireCars();
  }

  wireCars() {
    for (const d of this.cars) d.onCrash = (c) => this.heatAdd(this.heat.crash, c.x, c.y, 1);
  }

  collide() {
    this.carCrashes += collideCars(this.cars, this.hash, (a, b) => {
      if (this.onCarCrash) this.onCarCrash(a, b);
      if (crossing(a, b) && this.city.junctionAt(a.x, a.y) >= 0) this.conflictCrashes++;
    });
  }

  // Right of way, measured: two cars in the same junction at the same time on
  // crossing paths is a conflict. Each pair counts once per junction per
  // generation, however long they share it. The share of conflicts that end
  // without a collision is how well the population has worked out who goes.
  junctionConflicts() {
    const by = new Map();
    for (const c of this.cars) {
      if (!c.solid) continue;
      const j = this.city.junctionAt(c.x, c.y);
      if (j < 0) continue;
      if (!by.has(j)) by.set(j, []);
      by.get(j).push(c);
    }
    for (const [j, cs] of by) {
      for (let i = 0; i < cs.length; i++) {
        for (let k = i + 1; k < cs.length; k++) {
          if (!crossing(cs[i], cs[k])) continue;
          const a = Math.min(cs[i].id, cs[k].id), b = Math.max(cs[i].id, cs[k].id);
          this.conflicts.add(`${this.wave}:${a}:${b}:${j}`);
        }
      }
    }
  }

  step() {
    if (this.done) return false;
    const alive = this.stepCars();
    if (alive === 0 || this.tick >= this.ticksPerGen) {
      if (this.traffic && this.wave + 1 < this.waves) {
        this.finished.push(...this.cars);
        this.wave++;
        this.startWave();
      } else this.done = true;
    }
    return true;
  }

  // One tick for the cars on the road now; returns how many are still alive.
  stepCars() {
    let hash = null;
    if (this.traffic) { this.hash.rebuild(this.cars); hash = this.hash; }
    let alive = 0;
    this.city.time = this.tick * DT;
    const sample = this.tick % 6 === 0;
    for (const c of this.cars) {
      c.step(DT, hash);
      if (c.alive) {
        alive++;
        if (c.solid && Math.abs(c.v) < 15) this.heatAdd(this.heat.slow, c.x, c.y, 1);
        if (sample && c.solid && c.v > 20 && this.city.junctionAt(c.x, c.y) < 0) this.sampleSide(c);
      }
    }
    if (this.traffic) {
      this.collide();
      if (this.tick % 3 === 0) this.junctionConflicts();
    }
    this.tick++;
    return alive;
  }

  // Run wave `k` of the current generation to its end, on its own, and
  // return what the generation needs from it. This is what a worker thread
  // runs; the main thread then merges the waves with mergeWaves().
  runWave(k) {
    this.wave = k;
    this.carCrashes = 0; this.conflictCrashes = 0; this.conflicts = new Set();
    this.side = { sum: 0, abs: 0, n: 0 };
    this.startWave();
    while (this.stepCars() > 0 && this.tick < this.ticksPerGen) {}
    return {
      cars: this.cars.map((d) => ({
        gi: d.genomeIndex, banked: d.banked, best: d.best, trips: d.trips, damage: d.damage, crashes: d.crashes,
        dist: d.dist, waitTicks: d.waitTicks, ticks: d.ticks, tripTicks: d.tripTicks, redRuns: d.redRuns,
      })),
      carCrashes: this.carCrashes, conflictCrashes: this.conflictCrashes, conflicts: this.conflicts.size, side: this.side,
    };
  }

  // Put waves run elsewhere back together as if they had run here, then
  // finish the generation as usual.
  mergeWaves(results) {
    const genomes = this.pop.genomes;
    this.finished = [];
    this.cars = results.flatMap((r) => r.cars.map((c) => Object.assign(Object.create(Driver.prototype), c, { genome: genomes[c.gi] })));
    this.carCrashes = results.reduce((a, r) => a + r.carCrashes, 0);
    this.conflictCrashes = results.reduce((a, r) => a + r.conflictCrashes, 0);
    this.conflictCount = results.reduce((a, r) => a + r.conflicts, 0);
    this.side = results.reduce((a, r) => ({ sum: a.sum + r.side.sum, abs: a.abs + r.side.abs, n: a.n + r.side.n }), { sum: 0, abs: 0, n: 0 });
    this.done = true;
    this.finish();
    this.conflictCount = undefined;
  }

  // Crash damage is phased in over the first generations. Charge full price
  // from the start and the first brains, which all crash constantly, score
  // so close to zero that selection has nothing to grip; some seeds never
  // recover. Let them learn to get somewhere first, then make it expensive.
  damageCost() {
    return BODY.damageCost * Math.min(1, this.pop.generation / DAMAGE_RAMP);
  }

  finish() {
    this.cars = [...this.finished, ...this.cars];
    this.finished = [];
    const cost = this.damageCost();
    const fits = this.cars.map((c) => c.fitness(cost));
    this.cars.forEach((c, i) => (c.genome.fitness = fits[i]));
    this.history.push({ ...this.stats(),
      gen: this.pop.generation,
      best: Math.max(...fits),
      mean: fits.reduce((a, b) => a + b, 0) / fits.length,
      // the same drivers priced at the final damage cost, so generations
      // before and after the ramp can be compared
      meanFull: this.cars.reduce((t, c) => t + c.fitness(BODY.damageCost), 0) / this.cars.length,
      bestTrips: Math.max(...this.cars.map((c) => c.trips)),
      traffic: this.traffic,
      density: this.traffic ? this.density : 1,
      species: this.pop.species.length,
    });
    this.pop.evolve();
    this.newGeneration();
  }

  // Which side of the road do moving cars keep to, outside junctions? Lateral
  // offset is measured relative to the direction of travel, so positive is
  // right of the centreline. Nothing in the code prefers either side; if the
  // average drifts away from zero under traffic, the population picked one.
  sampleSide(c) {
    const f = c.frame(), hw = c.edgeHW(f);
    if (f.along < 0 || f.along > f.len) return;
    const s = f.lateral / hw;
    this.side.sum += s; this.side.abs += Math.abs(s); this.side.n++;
  }

  // The numbers that say how the city as a whole is doing, as opposed to how
  // fit any one driver is.
  stats(cars = [...this.finished, ...this.cars]) {
    let trips = 0, crashes = 0, dist = 0, wait = 0, ticks = 0, tripTicks = 0, n = 0, red = 0;
    for (const c of cars) {
      red += c.redRuns;
      trips += c.trips; crashes += c.crashes; dist += c.dist; wait += c.waitTicks; ticks += c.ticks;
      for (const t of c.tripTicks) { tripTicks += t; n++; }
    }
    const km = (dist * M_PER_UNIT) / 1000;
    const minutes = (ticks * DT) / 60;
    return {
      trips, crashes, carCrashes: this.carCrashes, redRuns: red, control: this.control,
      throughput: minutes ? trips / minutes : 0,         // trips per car-minute
      tripTime: n ? (tripTicks / n) * DT : 0,             // seconds
      crashesPerKm: km ? crashes / km : 0,
      waitShare: ticks ? wait / ticks : 0,                // share of time stopped in junctions
      side: this.side.n ? this.side.sum / this.side.n : 0, // mean lateral offset, + is right
      conflicts: this.conflictCount ?? this.conflicts.size,
      conflictCrashes: this.conflictCrashes,
      yielded: (this.conflictCount ?? this.conflicts.size) ? 1 - Math.min(1, this.conflictCrashes / (this.conflictCount ?? this.conflicts.size)) : null,
      offCentre: this.side.n ? this.side.abs / this.side.n : 0,
    };
  }

  // A saved world is its population plus the few settings that rebuild the
  // rest: the cities come back from their seeds, and the generation in
  // progress restarts.
  toJSON() {
    return {
      v: 2, opts: this.opts, traffic: this.traffic, density: this.density, control: this.control,
      rng: this.genRng ?? this.rng.s, pop: this.pop.toJSON(), history: this.history,
    };
  }

  static fromJSON(j) {
    const w = new CityWorld({ ...j.opts, traffic: j.traffic, density: j.density, control: j.control || "none", pop: Population.fromJSON(j.pop) });
    w.rng.s = j.rng;
    w.history = j.history || [];
    w.newGeneration();
    return w;
  }

  runGeneration() {
    while (this.step()) {}
    this.finish();
    return this.history[this.history.length - 1];
  }

  leader() {
    let best = null, bf = -Infinity;
    for (const c of this.cars) {
      const f = c.fitness(0) + (c.alive ? 1 : 0);
      if (f > bf) { bf = f; best = c; }
    }
    return best;
  }
}

// Cars are two discs each, front and back, of the car's width. One disc of
// the car's length would make two cars side by side in neighbouring lanes
// touch, which is exactly the situation that must be survivable.
// Two cars on crossing paths: headings between 40 and 140 degrees apart.
function crossing(a, b) {
  const d = Math.abs(Math.atan2(Math.sin(a.a - b.a), Math.cos(a.a - b.a)));
  return d > 0.7 && d < 2.44;
}

// Returns how many collisions there were. Cars need distinct `id`s.
export function collideCars(cars, h, onCarCrash) {
  let n = 0;
  h.rebuild(cars);
  for (const a of cars) {
    if (!a.solid) continue;
    const offA = (a.p.len - a.p.wid) / 2;
    const ax = Math.cos(a.a) * offA, ay = Math.sin(a.a) * offA;
    h.near(a.x, a.y, a.p.len + 10, (b) => {
      if (b === a || !b.solid || !a.solid || b.id < a.id) return;
      if (a.isPed && b.isPed) return;   // people walk round each other
      const offB = (b.p.len - b.p.wid) / 2, rr = ((a.p.wid + b.p.wid) / 2) ** 2;
      const bx = Math.cos(b.a) * offB, by = Math.sin(b.a) * offB;
      for (const sa of [1, -1]) {
        for (const sb of [1, -1]) {
          const dx = a.x + ax * sa - b.x - bx * sb, dy = a.y + ay * sa - b.y - by * sb;
          if (dx * dx + dy * dy < rr) {
            if (onCarCrash) onCarCrash(a, b);
            // Each car is charged for its own speed towards the other. Shared
            // damage made a car that was rear-ended at a standstill pay as
            // much as the one that hit it, which is noise to selection: the
            // careful driver is punished for someone else's mistake.
            const nx = b.x - a.x, ny = b.y - a.y, nl = Math.hypot(nx, ny) || 1;
            a.crash(Math.max(0, (a.vx * nx + a.vy * ny) / nl));
            b.crash(Math.max(0, -(b.vx * nx + b.vy * ny) / nl));
            n++;
            return;
          }
        }
      }
    });
  }
  return n;
}
