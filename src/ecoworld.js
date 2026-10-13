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
  freightRate: 0.004,   // per unit of route, per unit of freight carried
  freightMin: 2,        // a vehicle needs this much room to take freight at all
  freightMax: 10,       // the biggest load a single job ever has
  crashCost: 9,         // per (impact share)^2 per unit of mass
  towFee: 3,            // for a car that got lost and had to be fetched
  redFine: 2,
  minCars: 24,          // below this, immigrants arrive
  maxCars: 120,         // a hard ceiling for the sake of the frame rate
  demand: 1.0,          // passenger fares per second at a demand factor of 1 (a day averages 0.69)
  freightDemand: 0.25,  // freight jobs per second during business hours
  fareQueue: 20,        // fares waiting beyond this go to another firm
  wearDist: 40000,      // upkeep doubles every this many units on the odometer
};

// One city day is 24 minutes of simulation, a minute per hour. Demand has a
// morning and an evening peak and a quiet night.
export const DAY = 24 * 60;
// Passenger demand follows commuting; freight moves in business hours, flat from 7 to 19, and barely at night.
export function freightAt(t) {
  const h = ((t / 60) % 24 + 24) % 24;
  return h >= 7 && h < 19 ? 1 : 0.15;
}

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
    this.baseEdges = this.city.edges.length;   // anything past this was built in the editor
    this.cfg = { ...DEFAULTS, pWeight: 0.5, weightStep: 0.15 };
    this.innov = founders ? founders.innov : new Innovations(N_INPUTS + 1 + N_OUTPUTS);
    this.founders = founders ? founders.genomes : null;
    this.hash = new SpatialHash(this.city.w, this.city.h);
    this.cars = [];
    this.tick = 0;
    this.nextId = 0;
    this.species = [];          // { id, brain, body, size, born }
    this.nextSpecies = 0;
    this.threshold = 0.8;       // nudged so the number of species stays readable
    this.log = [];              // telemetry rows
    this.events = { births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0, freight: 0, tripTicks: 0 };
    this.passengers = ECON.fareQueue / 2;  // fares waiting for a car
    this.freight = ECON.fareQueue / 2;     // loads waiting for a vehicle with room
    for (let i = 0; i < startCars; i++) this.immigrate();
  }

  get control() { return this.city.control; }
  set control(c) { this.city.control = c; }

  randomFare(from, cameFrom = -1, jam = 0) {
    const c = this.city, n = c.nodes.length, a = c.nodes[from];
    let to, tries = 0;
    do { to = this.rng.int(n); tries++; }
    while (tries < 50 && (to === from || Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < 300));
    return c.route(from, to, cameFrom, jam);
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
      body = this.rng.next() < 0.5 ? Body.stock(this.rng) : Body.random(this.rng);
    }
    this.events.immigrants++;
    return this.spawn(brain, body, ECON.startCash, null);
  }

  spawn(brain, body, cash, parent) {
    const p = { ...body.p, maxCrashes: Infinity };
    const from = this.rng.int(this.city.nodes.length);
    const d = new Driver(brain, this.city, this.randomFare(from, -1, body.jam), this.rng.range(0.2, 0.7), p);
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
      const next = this.randomFare(here, car.route[car.route.length - 2], car.body.jam);
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

  // Two markets, each with its own limited demand. Passengers pay by
  // distance and tip for a quick ride. Freight pays by distance and load,
  // does not care how long it takes, and only goes in a vehicle with room for
  // it. A car takes freight when it has the room and a load is waiting, a
  // passenger otherwise, and if neither is waiting it drives where it was
  // sent for nothing. Because each market is finite, the more cars chase one
  // of them the less each earns there: taxis and trucks can both make a
  // living, and neither is written down anywhere as a job.
  newJob(d, first = false) {
    let kind = null, load = 0;
    if (!first) {
      // take whichever waiting job pays this vehicle more per unit of route
      const fLoad = Math.min(d.body.capacity, ECON.freightMax);
      const fPay = d.body.capacity >= ECON.freightMin && this.freight >= 1 ? ECON.freightRate * fLoad : 0;
      const pPay = this.passengers >= 1 ? ECON.passengerRate * (1 + ECON.speedBonus / 2) : 0;
      if (fPay > pPay) { kind = "freight"; load = fLoad; this.freight--; }
      else if (pPay > 0) { kind = "passenger"; this.passengers--; }
      else this.events.deadheads++;
    }
    d.job = {
      kind, load,
      start: this.tick,
      // how long a trip of this length takes at a sensible pace
      expect: d.routeLen / 45 / DT,
    };
  }

  pay(d) {
    const j = d.job, dist = d.routeLen;
    if (!j.kind) return;
    let fare;
    if (j.kind === "freight") {
      fare = dist * ECON.freightRate * j.load;
      this.events.freight++;
    } else {
      const took = Math.max(1, this.tick - j.start);
      const quick = Math.max(0, Math.min(1, j.expect / took - 0.5));
      fare = dist * ECON.passengerRate * (1 + ECON.speedBonus * quick);
    }
    d.cash += fare;
    d.earned += fare;
    this.events.trips++;
    this.events.tripTicks += this.tick - j.start;
    this.events.earned += fare;
  }

  step() {
    const c = this.city;
    c.time = this.tick * DT;
    this.passengers = Math.min(ECON.fareQueue, this.passengers + ECON.demand * demandAt(c.time) * DT);
    this.freight = Math.min(ECON.fareQueue, this.freight + ECON.freightDemand * freightAt(c.time) * DT);
    this.hash.rebuild(this.cars);
    if (this.tick % 30 === 0) c.measureLoad(this.cars);
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
        d.place(this.randomFare(from, -1, d.body.jam), this.rng.range(0.2, 0.7));
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
        const dd = distance(d.genome, s.brain, this.cfg) + 8 * d.body.distance(s.body);
        if (dd < best) { best = dd; home = s; }
      }
      if (!home || best > this.threshold) {
        home = { id: this.nextSpecies++, brain: d.genome.clone(), body: d.body, born: this.tick };
        this.species.push(home);
      }
      d.species = home.id;
      counts.set(home.id, (counts.get(home.id) || 0) + 1);
    }
    this.species = this.species.filter((s) => counts.has(s.id));
    for (const s of this.species) s.size = counts.get(s.id);
    if (this.species.length < 4) this.threshold = Math.max(0.1, this.threshold * 0.95);
    else if (this.species.length > 9) this.threshold *= 1.05;
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
    this.events = { births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0, freight: 0, tripTicks: 0 };
  }

  // After the editor changes the map: anyone whose remaining route uses a
  // closed road is re-routed from the next junction, keeping their fare.
  cityEdited() {
    const c = this.city;
    for (const d of this.cars) {
      const r = d.route;
      let blocked = false;
      for (let i = d.seg + 1; i + 1 < r.length; i++) {
        const e = c.edgeBetween(r[i], r[i + 1]);
        if (!e || c.closed.has(e.id)) { blocked = true; break; }
      }
      if (!blocked) continue;
      const tail = c.route(r[d.seg + 1], r[r.length - 1], r[d.seg], d.body.jam);
      if (!tail) continue;
      d.route = r.slice(0, d.seg + 2).concat(tail.slice(1));
      d.routeLen = c.pathLength(d.route);
    }
  }

  // A checkpoint keeps every car's brain, body, wallet and lineage, and the
  // species labels. Where each car was on the road is not kept: on resume
  // they start new fares from random places, which costs the city a minute
  // of traffic and saves a great deal of fragile state.
  toJSON() {
    return {
      v: 1, seed: this.seed, citySeed: this.city.seed, control: this.control, tick: this.tick, rng: this.rng.s,
      innov: this.innov.toJSON(), cfg: this.cfg, nextId: this.nextId, nextSpecies: this.nextSpecies, threshold: this.threshold,
      passengers: this.passengers, freight: this.freight,
      closed: [...this.city.closed], added: this.city.edges.slice(this.baseEdges).map((e) => [e.a, e.b, e.lanes]),
      founders: this.founders ? this.founders.map((g) => g.toJSON()) : null,
      cars: this.cars.map((d) => ({
        brain: d.genome.toJSON(), body: d.body.toJSON(), cash: d.cash, id: d.id, born: d.born, parent: d.parent,
        generation: d.generation, children: d.children, earned: d.earned, species: d.species, dist: d.dist,
      })),
      species: this.species.map((s) => ({ id: s.id, brain: s.brain.toJSON(), body: s.body.toJSON(), born: s.born, size: s.size })),
      log: this.log,
    };
  }

  static fromJSON(j) {
    const w = new EcoWorld({ seed: j.seed, citySeed: j.citySeed, control: j.control, startCars: 0 });
    for (const [a, b, lanes] of j.added || []) w.city.addRoad(a, b, lanes);
    for (const id of j.closed || []) w.city.closed.add(id);
    w.tick = j.tick; w.rng.s = j.rng; w.cfg = j.cfg;
    w.innov = Innovations.fromJSON(j.innov);
    w.nextSpecies = j.nextSpecies; w.threshold = j.threshold;
    w.passengers = j.passengers; w.freight = j.freight;
    w.founders = j.founders ? j.founders.map((g) => Genome.fromJSON(g)) : null;
    w.cars = [];
    w.events = { births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0, freight: 0, tripTicks: 0 };
    for (const c of j.cars) {
      const d = w.spawn(Genome.fromJSON(c.brain), Body.fromJSON(c.body), c.cash, null);
      Object.assign(d, { id: c.id, born: c.born, parent: c.parent, generation: c.generation, children: c.children, earned: c.earned, species: c.species, dist: c.dist });
    }
    w.nextId = j.nextId;
    w.species = j.species.map((s) => ({ id: s.id, brain: Genome.fromJSON(s.brain), body: Body.fromJSON(s.body), born: s.born, size: s.size }));
    w.log = j.log || [];
    w.city.time = w.tick * DT;
    return w;
  }

  richest() {
    return this.cars.length ? this.cars.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
  }
}
