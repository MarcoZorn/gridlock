// The city with the fitness function taken out.
//
// There are no generations and no scores. Every car has a wallet. Fares pay
// in, fuel, upkeep and crash damage pay out. A car that saves enough has a
// child, a mutated copy of its brain and its body, and pays to raise it. A
// car whose wallet goes negative is gone. That is the whole rule set, the
// same "stay solvent" that runs primordial; what the cars become is whatever
// the city's prices make sustainable.
import { Rng, mutate, crossover, distance, DEFAULTS } from "./neat.js";
import { Genome, Innovations } from "./genome.js";
import { City } from "./city.js";
import { Driver, BODY, N_INPUTS, N_OUTPUTS } from "./driver.js";
import { Body, TRAITS } from "./body.js";
import { SpatialHash } from "./spatial.js";
import { collideCars, DT } from "./cityworld.js";

// The economy, in one place so it can be tuned without hunting.
export const ECON = {
  startCash: 14,
  birthCash: 34,        // a car this rich has a child...
  childCost: 16,        // ...pays this to raise it...
  childCash: 13,        // ...and the child starts with this
  passengerRate: 0.012, // per unit of route, for the passenger
  speedBonus: 0.6,      // passengers tip for a quick trip, up to this share extra
  freightRate: 0.006,   // per unit of route, per unit of freight carried
  freightMax: 4,        // the most freight a single job ever has
  crashCost: 9,         // per (impact share)^2 per unit of mass
  towFee: 3,            // for a car that got lost and had to be fetched
  redFine: 2,
  minCars: 24,          // below this, immigrants arrive
  maxCars: 120,         // a hard ceiling for the sake of the frame rate
  demand: 1.2,          // paid fares per second at a demand factor of 1 (a day averages 0.69)
  fareQueue: 20,        // fares waiting beyond this go to another firm
  wearDist: 40000,      // upkeep doubles every this many units on the odometer
};

// One city day is 24 minutes of simulation, a minute per hour. Demand has a
// morning and an evening peak and a quiet night.
export const DAY = 24 * 60;
export function demandAt(t) {
  const h = ((t / 60) % 24 + 24) % 24;
  const peak = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  return 0.35 + 1.1 * peak(8.5, 1.5) + 0.9 * peak(18, 2) + 0.4 * peak(13, 3);
}

const SPECIES_EVERY = 600;   // ticks between speciation passes

export class EcoWorld {
  // `founders` is a Population from the generation-based city: a no-fitness
  // world cannot start from random brains, because a car that cannot finish
  // a trip never earns, never breeds, and nothing ever gets selected. The
  // founders only have to be able to drive; what they become is up to the
  // economy.
  constructor({ seed = 1, citySeed = seed, control = "none", startCars = 50, founders = null } = {}) {
    this.seed = seed;
    this.rng = new Rng(seed * 104729 + 7);
    this.city = new City(citySeed);
    this.city.control = control;
    this.cfg = { ...DEFAULTS, pWeight: 0.5, weightStep: 0.15 };
    this.innov = founders ? founders.innov : new Innovations(N_INPUTS + 1 + N_OUTPUTS);
    this.founders = founders ? founders.genomes : null;
    this.hash = new SpatialHash(this.city.w, this.city.h);
    this.cars = [];
    this.tick = 0;
    this.nextId = 0;
    this.species = [];          // { id, brain, body, size, born }
    this.nextSpecies = 0;
    this.log = [];              // telemetry rows
    this.events = { births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0 };
    this.queue = ECON.fareQueue / 2;   // paid fares waiting for a car
    for (let i = 0; i < startCars; i++) this.immigrate();
  }

  get control() { return this.city.control; }
  set control(c) { this.city.control = c; }

  randomFare(from, cameFrom = -1) {
    const c = this.city, n = c.nodes.length, a = c.nodes[from];
    let to, tries = 0;
    do { to = this.rng.int(n); tries++; }
    while (tries < 50 && (to === from || Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < 300));
    return c.route(from, to, cameFrom);
  }

  // A newcomer from outside: a fresh stock body and a brain one mutation away
  // from minimal. Immigrants keep the city from emptying in the early hours,
  // when almost nobody can make a trip pay.
  immigrate(parent = null) {
    let brain, body;
    if (parent) {
      brain = mutate(parent.genome.clone(), this.innov, this.rng, this.cfg);
      body = parent.body.mutate(this.rng);
    } else {
      const base = this.founders ? this.rng.pick(this.founders).clone() : Genome.initial(N_INPUTS, N_OUTPUTS, this.innov, this.rng);
      brain = mutate(base, this.innov, this.rng, this.cfg);
      body = Body.stock(this.rng);
    }
    this.events.immigrants++;
    return this.spawn(brain, body, ECON.startCash, null);
  }

  spawn(brain, body, cash, parent) {
    const p = { ...body.p, maxCrashes: Infinity };
    const from = this.rng.int(this.city.nodes.length);
    const d = new Driver(brain, this.city, this.randomFare(from), this.rng.range(0.2, 0.7), p);
    d.id = this.nextId++;
    d.body = body;
    d.cash = cash;
    d.born = this.tick;
    d.parent = parent ? parent.id : -1;
    d.generation = parent ? parent.generation + 1 : 0;
    d.children = 0;
    d.earned = 0;
    d.species = parent ? parent.species : -1;
    this.newJob(d, true);
    d.onArrive = (car, here) => {
      this.pay(car);
      const next = this.randomFare(here, car.route[car.route.length - 2]);
      return next;
    };
    // newJob has to run after setRoute, which arrive() calls with our return
    // value; wrap setRoute once so every new route gets a fresh job.
    const setRoute = d.setRoute.bind(d);
    d.setRoute = (r) => { setRoute(r); this.newJob(d); };
    let lastDamage = 0;
    d.onCrash = (car) => {
      const hit = car.damage - lastDamage;
      lastDamage = car.damage;
      const cost = hit * car.p.mass * ECON.crashCost;
      car.cash -= cost;
      this.events.crashes++;
    };
    this.cars.push(d);
    return d;
  }

  // Every trip is a passenger plus whatever freight fits. The passenger pays
  // by distance and tips for speed; the freight pays by distance and load and
  // does not care how long it takes. Small and fast and big and slow are both
  // ways to make a living, and neither is coded as a job.
  //
  // Only if there is a fare waiting, though. Otherwise the car drives to
  // wherever it was sent for nothing, burning fuel: more cars than the city
  // has work for means everyone earns less.
  newJob(d, first = false) {
    const want = this.rng.range(0, ECON.freightMax);
    // a new car's first drive is to its first pickup and uses no fare
    const paid = !first && this.queue >= 1;
    if (paid) this.queue--;
    else if (!first) this.events.deadheads++;
    d.job = {
      paid,
      load: Math.min(want, d.body.capacity),
      start: this.tick,
      // how long a trip of this length takes at a sensible pace
      expect: d.routeLen / 45 / DT,
    };
  }

  pay(d) {
    const j = d.job, dist = d.routeLen;
    if (!j.paid) return;
    const took = Math.max(1, this.tick - j.start);
    const quick = Math.max(0, Math.min(1, j.expect / took - 0.5));
    const fare = dist * ECON.passengerRate * (1 + ECON.speedBonus * quick) + dist * ECON.freightRate * j.load;
    d.cash += fare;
    d.earned += fare;
    this.events.trips++;
    this.events.earned += fare;
  }

  step() {
    const c = this.city;
    c.time = this.tick * DT;
    this.queue = Math.min(ECON.fareQueue, this.queue + ECON.demand * demandAt(c.time) * DT);
    this.hash.rebuild(this.cars);
    for (const d of this.cars) {
      const reds = d.redRuns;
      d.step(DT, this.hash);
      if (d.redRuns > reds) d.cash -= ECON.redFine;
      // running costs: being on the road, and burning fuel to move; upkeep
      // grows with the odometer, so every car wears out in the end
      const wear = 1 + d.dist / ECON.wearDist;
      d.cash -= d.body.upkeep * wear * DT + d.body.fuel * Math.abs(d.v) * DT;
      if (!d.alive && d.lost) {
        // fetched and dropped somewhere new, at a price
        d.cash -= ECON.towFee;
        d.lost = false;
        const from = this.rng.int(c.nodes.length);
        d.place(this.randomFare(from), this.rng.range(0.2, 0.7));
      }
    }
    this.events.carCrashes += collideCars(this.cars, this.hash, null);

    // births and deaths, after everyone has moved
    const born = [];
    for (const d of this.cars) {
      if (d.cash >= ECON.birthCash && this.cars.length + born.length < ECON.maxCars) {
        d.cash -= ECON.childCost;
        d.children++;
        born.push(this.birth(d));
      }
    }
    const before = this.cars.length;
    this.cars = this.cars.filter((d) => d.cash >= 0);
    this.events.deaths += before - this.cars.length;
    this.events.births += born.length;
    while (this.cars.length < ECON.minCars) {
      // descendants of whoever is doing best, or fresh stock if nobody is
      const rich = this.cars.length ? this.cars.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
      this.immigrate(rich && this.rng.next() < 0.7 ? rich : null);
    }

    this.tick++;
    if (this.tick % SPECIES_EVERY === 0) this.speciate();
    if (this.tick % 600 === 0) this.record();
  }

  // A child is its parent's brain and body, mutated, and now and then its
  // brain is crossed with another solvent car's. It starts on a random road;
  // spawning on top of the parent would just be a collision.
  birth(parent) {
    let brain;
    const mates = this.cars.filter((o) => o !== parent && o.cash > ECON.startCash && o.species === parent.species);
    if (mates.length && this.rng.next() < 0.3) {
      const m = this.rng.pick(mates);
      parent.genome.fitness = parent.earned; m.genome.fitness = m.earned;
      brain = crossover(parent.genome, m.genome, this.rng, this.cfg);
    } else brain = parent.genome.clone();
    mutate(brain, this.innov, this.rng, this.cfg);
    const child = this.spawn(brain, parent.body.mutate(this.rng), ECON.childCash, parent);
    return child;
  }

  // Species are labels, nothing more: no fitness sharing, no culling. Brain
  // distance and body distance both count, so two lineages that drive alike
  // in very different vehicles end up as different species.
  speciate() {
    const counts = new Map();
    for (const d of this.cars) {
      let home = null, best = Infinity;
      for (const s of this.species) {
        const dd = distance(d.genome, s.brain, this.cfg) + 6 * d.body.distance(s.body);
        if (dd < best) { best = dd; home = s; }
      }
      if (!home || best > 3.0) {
        home = { id: this.nextSpecies++, brain: d.genome.clone(), body: d.body, born: this.tick };
        this.species.push(home);
      }
      d.species = home.id;
      counts.set(home.id, (counts.get(home.id) || 0) + 1);
    }
    this.species = this.species.filter((s) => counts.has(s.id));
    for (const s of this.species) s.size = counts.get(s.id);
  }

  record() {
    const n = this.cars.length || 1;
    const traits = {};
    for (const t of TRAITS) traits[t] = this.cars.reduce((a, d) => a + d.body.genes[t], 0) / n;
    this.log.push({
      tick: this.tick,
      hour: ((this.city.time / 60) % 24),
      cars: this.cars.length,
      cash: this.cars.reduce((a, d) => a + d.cash, 0) / n,
      maxGen: Math.max(0, ...this.cars.map((d) => d.generation)),
      ...this.events,
      traits,
      species: this.species.map((s) => [s.id, s.size]),
    });
    this.events = { births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0 };
  }

  richest() {
    return this.cars.length ? this.cars.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
  }
}
