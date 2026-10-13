// Ties the population to the city: hand out trips, run a generation, evolve.
import { Population, Rng } from "./neat.js";
import { City } from "./city.js";
import { Driver, BODY, N_INPUTS, N_OUTPUTS } from "./driver.js";
import { SpatialHash } from "./spatial.js";

export const DT = 1 / 60;
const DAMAGE_RAMP = 100;

export class CityWorld {
  constructor({ seed = 1, popSize = 120, ticks = 3600, traffic = false, cities = 6 } = {}) {
    this.seed = seed;
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

  newGeneration() {
    this.city = this.cities[this.pop.generation % this.cities.length];
    this.hash = new SpatialHash(this.city.w, this.city.h);
    this.chain = this.makeChain(12);
    const onArrive = (d) => this.routes[d.trips] || null;
    this.cars = this.pop.genomes.map((g) => {
      const d = new Driver(g, this.city, this.routes[0]);
      d.onArrive = onArrive;
      return d;
    });
    this.tick = 0;
    this.done = false;
  }

  step() {
    if (this.done) return false;
    let hash = null;
    if (this.traffic) { this.hash.rebuild(this.cars); hash = this.hash; }
    let alive = 0;
    for (const c of this.cars) { c.step(DT, hash); if (c.alive) alive++; }
    this.tick++;
    if (alive === 0 || this.tick >= this.ticksPerGen) this.done = true;
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
    const cost = this.damageCost();
    const fits = this.cars.map((c) => c.fitness(cost));
    this.cars.forEach((c, i) => (c.genome.fitness = fits[i]));
    const trips = this.cars.reduce((t, c) => t + c.trips, 0);
    this.history.push({
      gen: this.pop.generation,
      best: Math.max(...fits),
      mean: fits.reduce((a, b) => a + b, 0) / fits.length,
      trips,
      bestTrips: Math.max(...this.cars.map((c) => c.trips)),
      crashes: this.cars.reduce((t, c) => t + c.crashes, 0),
      species: this.pop.species.length,
    });
    this.pop.evolve();
    this.newGeneration();
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
