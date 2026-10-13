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
  constructor({ seed = 1, popSize = 120, ticks = 3600, traffic = false, cities = 6, density = 40 } = {}) {
    this.seed = seed;
    this.density = density;
    this.ticksPerGen = ticks;
    this.traffic = traffic;
    this.pop = new Population(N_INPUTS, N_OUTPUTS, { popSize }, seed);
    this.rng = new Rng(seed * 7919 + 5);
    // A handful of cities, rotated per generation, for the same reason the
    // track demo rotates tracks: evolve in one city and you get drivers who
    // know that city, not drivers who can read a road.
    this.cities = Array.from({ length: cities }, (_, i) => new City(seed * 31 + i));
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
    const c = this.city, n = c.nodes.length, a = c.nodes[from];
    let to, tries = 0;
    do { to = this.rng.int(n); tries++; }
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
    this.city = this.cities[this.pop.generation % this.cities.length];
    this.heat = this.heatOf(this.city);
    this.hash = new SpatialHash(this.city.w, this.city.h);
    this.finished = [];
    this.wave = 0;
    if (this.traffic) {
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
    const onArrive = (d, here) => this.fare(here, d.route[d.route.length - 2]);
    this.cars = genomes.map((g, i) => {
      const d = new Driver(g, this.city, this.fare(this.rng.int(this.city.nodes.length)), this.rng.range(0.15, 0.75));
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

  // Cars are two discs each, front and back, of the car's width. One disc of
  // the car's length would make two cars side by side in neighbouring lanes
  // touch, which is exactly the situation that must be survivable.
  collide() {
    const h = this.hash, off = (BODY.len - BODY.wid) / 2, rr = BODY.wid * BODY.wid;
    h.rebuild(this.cars);
    for (const a of this.cars) {
      if (!a.solid) continue;
      const ax = Math.cos(a.a) * off, ay = Math.sin(a.a) * off;
      h.near(a.x, a.y, BODY.len, (b) => {
        if (b === a || !b.solid || !a.solid || b.id < a.id) return;
        const bx = Math.cos(b.a) * off, by = Math.sin(b.a) * off;
        for (const sa of [1, -1]) {
          for (const sb of [1, -1]) {
            const dx = a.x + ax * sa - b.x - bx * sb, dy = a.y + ay * sa - b.y - by * sb;
            if (dx * dx + dy * dy < rr) {
              const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
              a.crash(rel); b.crash(rel);
              this.carCrashes++;
              return;
            }
          }
        }
      });
    }
  }

  step() {
    if (this.done) return false;
    let hash = null;
    if (this.traffic) { this.hash.rebuild(this.cars); hash = this.hash; }
    let alive = 0;
    for (const c of this.cars) {
      c.step(DT, hash);
      if (c.alive) {
        alive++;
        if (c.solid && Math.abs(c.v) < 15) this.heatAdd(this.heat.slow, c.x, c.y, 1);
      }
    }
    if (this.traffic) this.collide();
    this.tick++;
    if (alive === 0 || this.tick >= this.ticksPerGen) {
      if (this.traffic && this.wave + 1 < this.waves) {
        this.finished.push(...this.cars);
        this.wave++;
        this.startWave();
      } else this.done = true;
    }
    return true;
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
      bestTrips: Math.max(...this.cars.map((c) => c.trips)),
      traffic: this.traffic,
      density: this.traffic ? this.density : 1,
      species: this.pop.species.length,
    });
    this.pop.evolve();
    this.newGeneration();
  }

  // The numbers that say how the city as a whole is doing, as opposed to how
  // fit any one driver is.
  stats(cars = [...this.finished, ...this.cars]) {
    let trips = 0, crashes = 0, dist = 0, wait = 0, ticks = 0, tripTicks = 0, n = 0;
    for (const c of cars) {
      trips += c.trips; crashes += c.crashes; dist += c.dist; wait += c.waitTicks; ticks += c.ticks;
      for (const t of c.tripTicks) { tripTicks += t; n++; }
    }
    const km = (dist * M_PER_UNIT) / 1000;
    const minutes = (ticks * DT) / 60;
    return {
      trips, crashes, carCrashes: this.carCrashes,
      throughput: minutes ? trips / minutes : 0,         // trips per car-minute
      tripTime: n ? (tripTicks / n) * DT : 0,             // seconds
      crashesPerKm: km ? crashes / km : 0,
      waitShare: ticks ? wait / ticks : 0,                // share of time stopped in junctions
    };
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
