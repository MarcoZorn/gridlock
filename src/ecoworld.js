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
import { Driver, N_INPUTS, N_OUTPUTS } from "./driver.js";
import { Body, TRAITS } from "./body.js";
import { SpatialHash } from "./spatial.js";
import { collideCars, DT } from "./cityworld.js";
import { Crowd } from "./pedestrians.js";

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
  crashMass: 0,         // if set, every crash is charged as if the car had this mass, so heavy vehicles pay no more (an experiment)
  towFee: 3,            // for a car that got lost and had to be fetched
  pedestrianFine: 3,    // on top of the crash itself, for hitting someone on foot
  redFine: 2,
  minCars: 24,          // below this, immigrants arrive
  maxCars: 120,         // a hard ceiling for the sake of the frame rate
  demand: 1.0,          // passenger fares per second at a demand factor of 1 (a day averages 0.69)
  freightDemand: 0.25,  // freight jobs per second during business hours
  fareQueue: 20,        // fares waiting beyond this go to another firm
  wearDist: 40000,      // upkeep doubles every this many units on the odometer
  congestion: 0,        // a charge per second, times how full the road you are on is (an experiment, off)
  peakToll: 0,          // 1: the congestion charge applies only in the rush hours, when demand is above average (an experiment)
  fuelTax: 1,           // fuel costs this many times its price (an experiment)
  fuelMarket: 0,        // fuel's price follows demand: times the cars on the road over this many (an experiment)
  finishFare: 0,        // 1: a car with a fare aboard cannot go broke until it delivers (an experiment)
  insurance: 0,         // 1: crashes cost the driver nothing; every car pays the premium instead (an experiment)
  imitate: 0,           // share of children who copy the most successful driver's brain, not the parent's (an experiment)
  owner: 0,             // a child pays this share of its fares to its parent while the parent lives: owners and their fleets (an experiment)
  speciesBy: 0,         // species, and so who may cross brains, by 0: brain and body; 1: body alone; 2: brain alone (an experiment)
  vote: 0,             // the drivers vote on the basic income every hour: each wants more if it earns below the average, and the share moves this much toward the majority (an experiment)
  basic: 0,             // share of every fare taxed and paid back equally to every car, a basic income (an experiment)
  minFare: 0,           // no passenger fare pays less than this, a minimum wage per fare (an experiment)
  forgive: 0,           // 1: a car's first bankruptcy is forgiven, its debt wiped to zero; the second is final (an experiment)
  interest: 0,          // a car in debt sees its debt grow by this share every city hour (an experiment, with credit)
  credit: 0,            // a car may run this far into debt before it counts as broke (an experiment)
  platformB: 0,         // share of passengers who book through a second platform, B; 0: one platform (an experiment)
  commissionA: 0,       // share of each passenger fare platform A keeps
  commissionB: 0,       // ...and platform B; a car works for its parent's platform, switching now and then
  switchPlatform: 0.05, // the share of children that drive for the other platform
  reputationBy: 0,      // 0: by crash count; 1: by damage, which carries the blame of speed
  reputation: 0,        // passengers refuse a car that crashes this many times more often than the average car (an experiment)
  reviews: 0,           // 1: passengers rate the ride, five stars if it did not crash; a fare pays the car's rating over the city's (an experiment)
  licence: 0,           // a car carries passengers only once it has driven this far without a crash (an experiment)
  premium: 0.034,       // per second: about what the average car spends on crashes uninsured
  payout: 0,            // insured: a crash also pays the driver this share of its cost in cash, a claim worth more than the repair (an experiment)
  rated: 0,             // 1: insured cars pay the premium times their own claims rate over the average car's (an experiment)
  replan: 0,            // 1: at every junction a car re-plans the rest of its route on the traffic now (an experiment, off)
  speedLimit: 0,        // a speed camera everywhere: over this speed a car pays...
  speedFine: 0.3,       // ...this much a second at double the limit, in proportion below that (an experiment, off)
  union: 0,             // union cars refuse passenger fares that pay less than this; the card passes parent to child (an experiment)
};

// One city day is 24 minutes of simulation, a minute per hour. Demand has a
// morning and an evening peak and a quiet night.
export const DAY = 24 * 60;

// City sizes, in blocks. Demand and the population ceiling scale with the
// number of roads, so a bigger city supports a bigger population.
export const SIZES = { small: { cols: 9, rows: 6 }, medium: { cols: 13, rows: 9 }, large: { cols: 18, rows: 12 } };
const BASE_ROADS = 79;   // roads in a small city, the size the economy was tuned on
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

// What happened since the last telemetry row. `sideAll` / `sideRight`:
// sampled cars on two-way roads, and how many of them right of the middle;
// `pickups` / `dropoffs`: passengers taken on and passengers delivered.
// Inequality of wealth: 0 everyone equal, 1 one car has it all.
export function gini(xs) {
  const v = [...xs].sort((a, b) => a - b), n = v.length, sum = v.reduce((a, b) => a + b, 0);
  if (n < 2 || sum <= 0) return 0;
  let acc = 0;
  v.forEach((x, i) => (acc += (2 * (i + 1) - n - 1) * x));
  return acc / (n * sum);
}

const freshEvents = () => ({ births: 0, deaths: 0, immigrants: 0, trips: 0, crashes: 0, carCrashes: 0, earned: 0, deadheads: 0, freight: 0, tripTicks: 0, pedHits: 0, sideAll: 0, sideRight: 0, pickups: 0, dropoffs: 0 });

export class EcoWorld {
  // `founders` is a Population from the generation-based city: a no-fitness
  // world cannot start from random brains, because a car that cannot finish
  // a trip never earns, never breeds, and nothing ever gets selected. The
  // founders only have to be able to drive; what they become is up to the
  // economy.
  // `pedestrians` adds a second evolving population that has to cross the
  // roads (see pedestrians.js); 0 leaves the city to the cars.
  //
  // `graph` is a real street map (see tools/osm.mjs) instead of a generated city.
  constructor({ seed = 1, citySeed = seed, control = "none", startCars = 50, founders = null, pedestrians = 0, graph = null, size = "small" } = {}) {
    this.seed = seed;
    this.rng = new Rng(seed * 104729 + 7);
    this.size = SIZES[size] ? size : "small";
    this.city = new City(citySeed, { graph, ...(graph ? {} : SIZES[this.size]) });
    this.graph = graph;
    this.edits = [];   // expansions, built roads and road directions, in order, so a save can replay them
    this.congestion = ECON.congestion;   // this city's congestion charge, saved with it
    this.speedLimit = ECON.speedLimit;   // and its speed camera, 0 for none
    this.limits = null;                  // or a camera per road, by edge id (tools/limits.mjs; not saved)
    this.freightBoom = 1;                // freight pay and demand times this: at 3 trucks can evolve
    this.finishFare = ECON.finishFare;   // a car with a fare aboard finishes it before it can go broke
    this.insurance = ECON.insurance;     // crashes paid by a pool, every car pays a premium
    this.basic = ECON.basic;             // share of fares paid out as a basic income; voted on with ECON.vote
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
    this.threshold = 0.8;       // nudged so the number of species stays readable
    this.ancestry = new Map();  // id -> { parent, born, died, generation, species, children }
    this.log = [];              // telemetry rows
    this.events = freshEvents();
    this.crowd = pedestrians ? new Crowd(this.city, new Rng(seed * 7 + 1), pedestrians) : null;
    this.passengers = ECON.fareQueue / 2;  // fares waiting for a car
    this.passengersB = 0;                   // ...booked through platform B, when there is one
    this.freight = ECON.fareQueue / 2;     // loads waiting for a vehicle with room
    for (let i = 0; i < startCars; i++) this.immigrate();
  }

  get control() { return this.city.control; }
  set control(c) { this.city.control = c; }

  randomFare(from, cameFrom = -1, jam = 0) {
    const c = this.city, n = c.nodes.length, a = c.nodes[from];
    let to, tries = 0;
    // somewhere else, and far enough to be worth a fare if the city has it
    do { to = this.rng.int(n); tries++; }
    while (to === from || (tries < 50 && Math.hypot(c.nodes[to].x - a.x, c.nodes[to].y - a.y) < 300));
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
    // which platform it drives for: its parent's, now and then the other
    // (no draw at all with one platform, so other runs keep their random stream)
    d.platform = !ECON.platformB ? 0 : parent ? (this.rng.next() < ECON.switchPlatform ? 1 - parent.platform : parent.platform) : +(this.rng.next() < 0.5);
    // union card: the parent's, one child in twenty the other way; half of newcomers
    d.union = !ECON.union ? 0 : parent ? (this.rng.next() < 0.05 ? 1 - parent.union : parent.union) : +(this.rng.next() < 0.5);
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
      const cost = hit * (ECON.crashMass || car.p.mass) * ECON.crashCost;
      car.lastCrashDist = car.dist;
      car.claims = (car.claims || 0) + cost;
      if (!this.insurance) car.cash -= cost;   // insured: the pool pays, see the premium
      else car.cash += cost * ECON.payout;
      this.events.crashes++;
      this.city.addHeat("crash", car.x, car.y);
    };
    this.cars.push(d);
    this.ancestry.set(d.id, { parent: d.parent, born: this.tick, died: -1, generation: d.generation, species: d.species, children: 0 });
    if (parent && this.ancestry.has(parent.id)) this.ancestry.get(parent.id).children++;
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
  // Reputation: crashes per tick of life, against the average car's.
  // ECON.reputationBy = 1 counts damage instead, which grows with the car's
  // own speed at impact: the one that ran into the other pays the most.
  trusted(d) {
    // A licence: a clean stretch of road, once, before the first passenger.
    if (ECON.licence && !d.licensed) {
      if (d.dist - (d.lastCrashDist || 0) < ECON.licence) return false;
      d.licensed = true;
    }
    if (!ECON.reputation) return true;
    const rate = ECON.reputationBy ? (o) => o.damage / Math.max(1, this.tick - o.born) : (o) => o.crashes / Math.max(1, this.tick - o.born);
    let sum = 0;
    for (const o of this.cars) sum += rate(o);
    return rate(d) <= ECON.reputation * sum / this.cars.length;
  }

  newJob(d, first = false) {
    let kind = null, load = 0;
    if (!first) {
      // take whichever waiting job pays this vehicle more per unit of route
      const fLoad = Math.min(d.body.capacity, ECON.freightMax);
      const fPay = d.body.capacity >= ECON.freightMin && this.freight >= 1 ? ECON.freightRate * this.freightBoom * fLoad : 0;
      const onB = ECON.platformB && d.platform === 1, queue = onB ? this.passengersB : this.passengers;
      const cheap = d.union && d.routeLen * ECON.passengerRate < ECON.union;
      const pPay = queue >= 1 && !cheap && this.trusted(d) ? ECON.passengerRate * (1 + ECON.speedBonus / 2) : 0;
      if (fPay > pPay) { kind = "freight"; load = fLoad; this.freight--; }
      else if (pPay > 0) { kind = "passenger"; if (onB) this.passengersB--; else this.passengers--; this.events.pickups++; }
      else this.events.deadheads++;
    }
    d.job = {
      kind, load,
      start: this.tick,
      crashes: d.crashes,
      // how long a trip of this length takes at a sensible pace
      expect: d.routeLen / 45 / DT,
    };
  }

  pay(d) {
    const j = d.job, dist = d.routeLen;
    if (!j.kind) return;
    let fare;
    if (j.kind === "freight") {
      fare = dist * ECON.freightRate * this.freightBoom * j.load;
      this.events.freight++;
    } else {
      const took = Math.max(1, this.tick - j.start);
      const quick = Math.max(0, Math.min(1, j.expect / took - 0.5));
      fare = Math.max(ECON.minFare, dist * ECON.passengerRate * (1 + ECON.speedBonus * quick));
      if (ECON.platformB) fare *= 1 - (d.platform === 1 ? ECON.commissionB : ECON.commissionA);
      if (ECON.reviews) {
        // the share of its rides that did not crash, starting from two good ones
        const stars = (o) => ((o.clean || 0) + 2) / ((o.rides || 0) + 2);
        let sum = 0;
        for (const o of this.cars) sum += stars(o);
        fare *= stars(d) / (sum / this.cars.length);
        d.rides = (d.rides || 0) + 1;
        if (d.crashes === j.crashes) d.clean = (d.clean || 0) + 1;
      }
      this.events.dropoffs++;
    }
    this.pool = (this.pool || 0) + fare * this.basic;
    let kept = fare * (1 - this.basic);
    const owner = ECON.owner && this.cars.find((o) => o.id === d.parent);
    if (owner) { owner.cash += kept * ECON.owner; kept *= 1 - ECON.owner; }
    d.cash += kept;
    d.earned += fare;
    this.events.trips++;
    this.events.tripTicks += this.tick - j.start;
    this.events.earned += fare;
  }

  step() {
    const c = this.city;
    c.time = this.tick * DT;
    if (this.tick % 30 === 0) this.sampleSide();
    if (this.pool && this.cars.length) { for (const d of this.cars) d.cash += this.pool / this.cars.length; this.pool = 0; }
    if (ECON.replan && c.load) this.replanAll();
    const scale = this.scale;
    const booked = ECON.demand * scale * demandAt(c.time) * DT, b = ECON.platformB;
    this.passengers = Math.min(ECON.fareQueue * scale * (1 - b), this.passengers + booked * (1 - b));
    if (b) this.passengersB = Math.min(ECON.fareQueue * scale * b, this.passengersB + booked * b);
    this.freight = Math.min(ECON.fareQueue * scale, this.freight + ECON.freightDemand * this.freightBoom * scale * freightAt(c.time) * DT);
    // everything a car can see or hit: other cars, and anyone crossing
    const onRoad = this.crowd ? this.cars.concat(this.crowd.people) : this.cars;
    this.hash.rebuild(onRoad);
    if (this.tick % 30 === 0) c.measureLoad(this.cars);
    // experience rating: claims per tick against the city's, with an hour of
    // the average as a prior so a newcomer starts at the flat premium
    let avg = 0;
    if (this.insurance && ECON.rated) {
      let claims = 0, age = 0;
      for (const d of this.cars) { claims += d.claims || 0; age += this.tick - d.born; }
      avg = claims / Math.max(1, age);
    }
    const prior = 3600;
    const interest = (1 + ECON.interest) ** (1 / 3600);   // per tick: a city hour is 3600
    const fuel = ECON.fuelTax * (ECON.fuelMarket ? this.cars.length / ECON.fuelMarket : 1);
    for (const d of this.cars) {
      const reds = d.redRuns;
      d.step(DT, this.hash);
      if (d.redRuns > reds) d.cash -= ECON.redFine;
      // running costs: being on the road, and burning fuel to move; upkeep
      // grows with the odometer, so every car wears out in the end
      const wear = 1 + d.dist / ECON.wearDist;
      d.cash -= d.body.upkeep * wear * DT + d.body.fuel * fuel * Math.abs(d.v) * DT;
      if (this.insurance) d.cash -= ECON.premium * DT * (avg ? ((d.claims || 0) + avg * prior) / (this.tick - d.born + prior) / avg : 1);
      if (d.cash < 0) d.cash *= interest;
      const lim = this.limits ? this.limits[c.edgeBetween(d.route[d.seg], d.route[d.seg + 1])?.id] : this.speedLimit;
      if (lim && Math.abs(d.v) > lim) {
        d.cash -= ECON.speedFine * (Math.abs(d.v) / lim - 1) * DT;
        this.events.speeding = (this.events.speeding || 0) + DT;
      }
      if (this.congestion && c.load && !(ECON.peakToll && demandAt(c.time) < 1)) {
        const e = c.edgeBetween(d.route[d.seg], d.route[d.seg + 1]);
        if (e) d.cash -= this.congestion * c.load[e.id] * DT;
      }
      if (d.solid && Math.abs(d.v) < 15) c.addHeat("slow", d.x, d.y);
      if (!d.alive && d.lost) {
        // fetched and dropped somewhere new, at a price
        d.cash -= ECON.towFee;
        d.lost = false;
        const from = this.rng.int(c.nodes.length);
        const job = d.job, to = d.route[d.route.length - 1];
        const keep = this.finishFare && job && job.kind && from !== to;
        if (keep) {
          // the fare stays aboard: dropped somewhere new, still bound for
          // where it was going, without taking another job off the queues
          const q = [this.passengers, this.passengersB, this.freight, this.events.pickups, this.events.deadheads], len = d.routeLen;
          d.place(c.route(from, to, -1, d.body.jam), this.rng.range(0.2, 0.7));
          [this.passengers, this.passengersB, this.freight, this.events.pickups, this.events.deadheads] = q;
          d.job = job;
          d.routeLen = len;   // the fare is for the trip that was booked
        } else d.place(this.randomFare(from, -1, d.body.jam), this.rng.range(0.2, 0.7));
      }
    }
    if (this.crowd) this.crowd.step(DT, this.cars);
    this.events.carCrashes += collideCars(onRoad, this.hash, (a, b) => {
      if (this.onPair) this.onPair(a, b);   // for measurements: who hit whom
      const ped = a.isPed ? a : b.isPed ? b : null;
      if (!ped) return;
      const car = ped === a ? b : a;
      car.cash -= ECON.pedestrianFine;
      this.events.pedHits++;
    });

    // births and deaths, after everyone has moved
    const born = [];
    for (const d of this.cars) {
      if (d.cash >= ECON.birthCash && this.cars.length + born.length < ECON.maxCars * this.scale) {
        d.cash -= ECON.childCost;
        d.children++;
        born.push(this.birth(d));
      }
    }
    const before = this.cars.length;
    // with ECON.finishFare a car that is carrying someone (or something)
    // finishes the job before it goes out of business
    // but only a ride's grace: a car that has had its fare for three times the
    // trip's expected length, or is 20 in debt, is out like any other. Without
    // the limit, cars that kept getting lost with a fare aboard never died and
    // ran up debts in the thousands.
    const finishing = (d) => this.finishFare && d.job && d.job.kind && this.tick - d.job.start < 3 * d.job.expect && d.cash > -20;
    const broke = (d) => d.cash < -ECON.credit && !finishing(d);
    if (ECON.forgive) for (const d of this.cars) if (broke(d) && !d.forgiven) { d.cash = 0; d.forgiven = true; }
    for (const d of this.cars) if (broke(d) && this.ancestry.has(d.id)) this.ancestry.get(d.id).died = this.tick;
    this.cars = this.cars.filter((d) => !broke(d));
    this.events.deaths += before - this.cars.length;
    this.events.births += born.length;
    while (this.cars.length < ECON.minCars) {
      // descendants of whoever is doing best, or fresh stock if nobody is
      const rich = this.cars.length ? this.cars.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
      this.immigrate(rich && this.rng.next() < 0.7 ? rich : null);
    }

    this.tick++;
    if (this.tick % SPECIES_EVERY === 0) { this.speciate(); this.pruneAncestry(); }
    if (ECON.vote && this.tick % 3600 === 0) this.poll();
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
    // Culture: with ECON.imitate the child learns to drive from the most
    // successful car on the road (earnings per hour), not from its parent.
    // The body is still the parent's.
    if (ECON.imitate && this.rng.next() < ECON.imitate) {
      let best = null, rate = -Infinity;
      for (const o of this.cars) {
        const age = this.tick - o.born;
        if (age < 3600) continue;
        const r = o.earned / age;
        if (r > rate) { rate = r; best = o; }
      }
      if (best) brain = best.genome.clone();
    }
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
        const by = ECON.speciesBy;
        const dd = (by === 1 ? 0 : distance(d.genome, s.brain, this.cfg)) + (by === 2 ? 0 : 8 * d.body.distance(s.body));
        if (dd < best) { best = dd; home = s; }
      }
      if (!home || best > this.threshold) {
        home = { id: this.nextSpecies++, brain: d.genome.clone(), body: d.body, born: this.tick };
        this.species.push(home);
      }
      d.species = home.id;
      const a = this.ancestry.get(d.id);
      if (a) a.species = home.id;
      counts.set(home.id, (counts.get(home.id) || 0) + 1);
    }
    this.species = this.species.filter((s) => counts.has(s.id));
    for (const s of this.species) s.size = counts.get(s.id);
    if (this.species.length < 4) this.threshold = Math.max(0.1, this.threshold * 0.95);
    else if (this.species.length > 9) this.threshold *= 1.05;
  }

  // Each car that has just passed a junction plans the rest of its trip again
  // on the traffic as it is now, the way a driver with a live map would.
  replanAll() {
    const c = this.city;
    for (const d of this.cars) {
      if (d.planned === d.seg || d.seg + 2 >= d.route.length) continue;
      d.planned = d.seg;
      const r = d.route, tail = c.route(r[d.seg + 1], r[r.length - 1], r[d.seg], d.body.jam);
      if (!tail) continue;
      d.route = r.slice(0, d.seg + 2).concat(tail.slice(1));
      d.routeLen = c.pathLength(d.route);
    }
  }

  // Which side of the road the city keeps to, if any. Nothing in the code
  // prefers one; with enough traffic one wins within days.
  sampleSide() {
    const c = this.city;
    for (const d of this.cars) {
      if (!d.solid || d.seg + 1 >= d.route.length) continue;
      const e = c.edgeBetween(d.route[d.seg], d.route[d.seg + 1]);
      if (!e || e.oneway || c.junctionAt(d.x, d.y) >= 0) continue;
      this.events.sideAll++;
      if (d.frame().lateral > 0) this.events.sideRight++;
    }
  }

  // The vote: a car gains from the basic income if it earns less than the
  // average, loses if more, so each votes its pocket. Only cars an hour old
  // or more have a record to vote by.
  poll() {
    const rate = (d) => d.earned / (this.tick - d.born);
    const voters = this.cars.filter((d) => this.tick - d.born >= 3600);
    if (!voters.length) return;
    const mean = voters.reduce((a, d) => a + rate(d), 0) / voters.length;
    const up = voters.filter((d) => rate(d) < mean).length;
    this.events.yes = up / voters.length;
    this.basic = Math.max(0, Math.min(0.9, this.basic + ECON.vote * Math.sign(up - voters.length / 2)));
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
      gini: gini(this.cars.map((d) => Math.max(0, d.cash))),
      inDebt: this.cars.filter((d) => d.cash < 0).length / n,
      maxGen: Math.max(0, ...this.cars.map((d) => d.generation)),
      basic: this.basic,
      ...this.events,
      traits,
      species: this.species.map((s) => [s.id, s.size]),
      ...(this.crowd ? { people: this.crowd.people.length, ped: { ...this.crowd.events } } : {}),
    });
    if (this.crowd) this.crowd.events = { crossings: 0, hit: 0, starved: 0, born: 0 };
    this.events = freshEvents();
  }

  // Ancestry is only kept for cars someone alive descends from; everything
  // else is forgotten, so the record stays the size of the living family tree.
  pruneAncestry() {
    const keep = new Set();
    for (const d of this.cars) {
      for (let id = d.id; id >= 0 && !keep.has(id); id = this.ancestry.get(id)?.parent ?? -1) keep.add(id);
    }
    for (const id of this.ancestry.keys()) if (!keep.has(id)) this.ancestry.delete(id);
  }

  // A car's line back to its founder: [{ id, born, generation, ... }], oldest first.
  lineage(d) {
    const line = [];
    for (let id = d.id; id >= 0; id = this.ancestry.get(id)?.parent ?? -1) {
      const a = this.ancestry.get(id);
      if (!a) break;
      line.unshift({ id, ...a });
    }
    return line;
  }

  // How much bigger than the city the economy was tuned on.
  // Capped at four: past that a real map would ask for a thousand cars, which
  // is more than a browser can draw or a person can follow.
  get scale() { return Math.min(4, this.city.edges.length / BASE_ROADS); }

  // The editor's two building moves, logged so a save can replay them.
  build(a, b) {
    const e = this.city.addRoad(a, b);
    if (e) { this.edits.push(["road", a, b, e.lanes]); this.cityEdited(); }
    return e;
  }

  // A click on a road in the editor: two-way, one-way, the other way, closed.
  cycleRoad(e) {
    const state = this.city.cycleRoad(e);
    this.edits.push(["dir", e.a, e.b, state]);
    this.cityEdited();
    return state;
  }

  // A new row of blocks on the east or south edge. Demand grows with the
  // road count, so a bigger city means a boom until the population catches up.
  grow(side) {
    if (!this.city.expand(side)) return false;
    this.edits.push(["grow", side]);
    this.hash = new SpatialHash(this.city.w, this.city.h);
    return true;
  }

  // After the editor changes the map: anyone whose remaining route uses a
  // closed road, or a one-way road the wrong way, is re-routed from the next
  // junction, keeping their fare.
  cityEdited() {
    const c = this.city;
    for (const d of this.cars) {
      const r = d.route;
      let blocked = false;
      for (let i = d.seg + 1; i + 1 < r.length; i++) {
        const e = c.edgeBetween(r[i], r[i + 1]);
        if (!e || c.closed.has(e.id) || (e.oneway && e.a !== r[i])) { blocked = true; break; }
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
      v: 1, seed: this.seed, citySeed: this.city.seed, graph: this.graph, control: this.control, tick: this.tick, rng: this.rng.s,
      innov: this.innov.toJSON(), cfg: this.cfg, nextId: this.nextId, nextSpecies: this.nextSpecies, threshold: this.threshold,
      passengers: this.passengers, passengersB: this.passengersB, freight: this.freight,
      closed: [...this.city.closed], edits: this.edits, size: this.size, congestion: this.congestion, speedLimit: this.speedLimit, freightBoom: this.freightBoom, finishFare: this.finishFare, insurance: this.insurance, basic: this.basic,
      founders: this.founders ? this.founders.map((g) => g.toJSON()) : null,
      cars: this.cars.map((d) => ({
        brain: d.genome.toJSON(), body: d.body.toJSON(), cash: d.cash, id: d.id, born: d.born, parent: d.parent,
        generation: d.generation, children: d.children, earned: d.earned, species: d.species, dist: d.dist, platform: d.platform,
      })),
      species: this.species.map((s) => ({ id: s.id, brain: s.brain.toJSON(), body: s.body.toJSON(), born: s.born, size: s.size })),
      log: this.log,
      crowd: this.crowd ? this.crowd.toJSON() : null,
      ancestry: [...this.ancestry],
    };
  }

  static fromJSON(j) {
    const w = new EcoWorld({ seed: j.seed, citySeed: j.citySeed, control: j.control, startCars: 0, graph: j.graph || null, size: j.size });
    for (const [a, b, lanes] of j.added || []) w.city.addRoad(a, b, lanes);   // saves from before the edit log
    for (const [kind, x, y, lanes] of j.edits || []) {
      if (kind === "grow") w.grow(x);
      else if (kind === "dir") w.city.setRoad(w.city.edgeBetween(x, y), lanes);
      else w.city.addRoad(x, y, lanes);
    }
    w.edits = [...(j.edits || [])];
    w.congestion = j.congestion ?? ECON.congestion;
    w.speedLimit = j.speedLimit ?? ECON.speedLimit;
    w.freightBoom = j.freightBoom ?? 1;
    w.finishFare = j.finishFare ?? ECON.finishFare;
    w.insurance = j.insurance ?? ECON.insurance;
    w.basic = j.basic ?? ECON.basic;
    for (const id of j.closed || []) w.city.closed.add(id);
    w.tick = j.tick; w.rng.s = j.rng; w.cfg = j.cfg;
    w.innov = Innovations.fromJSON(j.innov);
    w.nextSpecies = j.nextSpecies; w.threshold = j.threshold;
    w.passengers = j.passengers; w.passengersB = j.passengersB || 0; w.freight = j.freight;
    w.founders = j.founders ? j.founders.map((g) => Genome.fromJSON(g)) : null;
    w.cars = [];
    w.events = freshEvents();
    for (const c of j.cars) {
      const d = w.spawn(Genome.fromJSON(c.brain), Body.fromJSON(c.body), c.cash, null);
      Object.assign(d, { id: c.id, born: c.born, parent: c.parent, generation: c.generation, children: c.children, earned: c.earned, species: c.species, dist: c.dist, platform: c.platform ?? 0 });
    }
    w.nextId = j.nextId;
    w.species = j.species.map((s) => ({ id: s.id, brain: Genome.fromJSON(s.brain), body: Body.fromJSON(s.body), born: s.born, size: s.size }));
    w.log = j.log || [];
    if (j.ancestry) w.ancestry = new Map(j.ancestry);
    if (j.crowd) w.crowd = Crowd.fromJSON(j.crowd, w.city, new Rng(j.seed * 7 + 1));
    w.city.time = w.tick * DT;
    return w;
  }

  richest() {
    return this.cars.length ? this.cars.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
  }
}
