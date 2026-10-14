// A second population: people who need to get across the road.
//
// A pedestrian waits at a kerb and decides, every tick, whether to step out.
// Its brain sees the nearest car coming from each side along the road, how
// close and how fast it is closing, and how long it has been waiting. It
// walks straight across at walking pace. Getting across feeds it, waiting
// starves it, being hit kills it, and enough crossings and it has a child.
// To the cars a pedestrian is just one more small thing on the road, seen by
// the same rays that see other cars, and hitting one is very expensive.
// Predator and prey, except that neither side is trying to catch anything.
import { mutate, DEFAULTS } from "./neat.js";
import { Genome, Innovations } from "./genome.js";

export const PED = {
  speed: 3.5,          // 1.4 m/s at 0.4 m per unit
  size: 2,
  start: 12,           // energy at birth
  meal: 5,             // energy per crossing
  hunger: 0.3,         // energy per second spent alive
  birth: 18,           // a pedestrian this well fed has a child...
  birthCost: 7,        // ...for this much. Dearer, and a crowd losing
                       // one in eight to traffic never replaces itself, so
                       // nothing gets selected and it lives on immigrants.
  sight: 160,          // how far along the road it looks
  count: 40,           // population the city starts with
  min: 20,
  max: 60,
};

const N_IN = 6, N_OUT = 1;   // [left dist, left closing, right dist, right closing, waited, bias-ish]

export class Pedestrian {
  constructor(brain, city, rng, energy = PED.start) {
    this.brain = brain;
    this.city = city;
    this.energy = energy;
    this.p = { len: PED.size, wid: PED.size };
    this.v = 0;
    this.a = 0;
    this.solid = false;     // only on the road while crossing
    this.isPed = true;
    this.alive = true;
    this.crossings = 0;
    this.children = 0;
    this.inputs = new Float64Array(N_IN);
    this.out = new Float64Array(N_OUT);
    this.pickSpot(rng);
  }

  get vx() { return Math.cos(this.a) * this.v; }
  get vy() { return Math.sin(this.a) * this.v; }

  // A random point along a random road, away from junctions, on one kerb.
  pickSpot(rng) {
    const c = this.city;
    // only roads with room for a crossing between their junction aprons: on a
    // real map many are short bends, and twenty misses in a row left a person
    // with no road at all
    const roomy = c.edges.filter((e) => e.len - c.nodes[e.a].r - c.nodes[e.b].r > 24);
    const pool = roomy.length ? roomy : [c.edges.reduce((a, b) => (b.len > a.len ? b : a))];
    for (let tries = 0; tries < 20; tries++) {
      const e = rng.pick(pool), A = c.nodes[e.a], B = c.nodes[e.b];
      const t = rng.range(0, 1), along = A.r + 8 + t * (e.len - A.r - B.r - 16);
      if (along <= A.r || along >= e.len - B.r) continue;
      const ux = (B.x - A.x) / e.len, uy = (B.y - A.y) / e.len, side = rng.next() < 0.5 ? 1 : -1;
      const off = (e.hw + 6) * side;
      this.edge = e; this.ux = ux; this.uy = uy;
      this.x = A.x + ux * along - uy * off;
      this.y = A.y + uy * along + ux * off;
      // facing straight across: away from this kerb, towards the other
      this.a = Math.atan2(-ux * side, uy * side);
      this.left = 2 * (e.hw + 6);
      this.waited = 0;
      this.crossing = false;
      this.v = 0;
      this.solid = false;
      return;
    }
  }

  // What is coming along the road, from each direction.
  sense(cars) {
    let lD = PED.sight, lC = 0, rD = PED.sight, rC = 0;
    for (const d of cars) {
      if (!d.solid || d === this) continue;
      const rx = d.x - this.x, ry = d.y - this.y;
      const along = rx * this.ux + ry * this.uy, across = Math.abs(-rx * this.uy + ry * this.ux);
      if (across > this.edge.hw * 2 + 10 || Math.abs(along) > PED.sight) continue;
      const toward = -(d.vx * this.ux + d.vy * this.uy) * Math.sign(along);   // closing speed along the road
      if (along >= 0 && along < rD) { rD = along; rC = toward; }
      if (along < 0 && -along < lD) { lD = -along; lC = toward; }
    }
    this.inputs[0] = lD / PED.sight; this.inputs[1] = Math.max(-1, Math.min(1, lC / 110));
    this.inputs[2] = rD / PED.sight; this.inputs[3] = Math.max(-1, Math.min(1, rC / 110));
    this.inputs[4] = Math.min(1, this.waited / 20);
    this.inputs[5] = this.edge.lanes > 1 ? 1 : 0;   // a wide road is a longer walk
  }

  step(dt, cars, rng) {
    if (!this.alive) return;
    this.energy -= PED.hunger * dt;
    if (this.energy <= 0) { this.alive = false; return; }
    if (!this.crossing) {
      this.sense(cars);
      this.brain.activate(this.inputs, this.out);
      this.waited += dt;
      if (this.out[0] > 0) { this.crossing = true; this.solid = true; this.v = PED.speed; }
      return;
    }
    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;
    this.left -= this.v * dt;
    if (this.left <= 0) {
      this.crossings++;
      this.energy += PED.meal;
      this.pickSpot(rng);   // walks on round the block to the next crossing
    }
  }

  // Called by the collision pass when a car hits this pedestrian.
  crash() { this.alive = false; this.solid = false; this.hit = true; }
}

// The pedestrian population, run alongside an ecosystem's cars.
export class Crowd {
  constructor(city, rng, count = PED.count) {
    this.city = city;
    this.rng = rng;
    this.innov = new Innovations(N_IN + 1 + N_OUT);
    this.cfg = { ...DEFAULTS, pWeight: 0.6, weightStep: 0.25 };
    this.people = [];
    this.nextId = -1;   // negative ids never clash with cars'
    this.events = { crossings: 0, hit: 0, starved: 0, born: 0 };
    for (let i = 0; i < count; i++) this.add(null);
  }

  add(parent) {
    const brain = parent ? parent.brain.clone() : Genome.initial(N_IN, N_OUT, this.innov, this.rng);
    mutate(brain, this.innov, this.rng, this.cfg);
    const p = new Pedestrian(brain, this.city, this.rng, parent ? PED.birthCost : PED.start);
    p.id = this.nextId--;
    this.people.push(p);
    return p;
  }

  toJSON() {
    return { innov: this.innov.toJSON(), rng: this.rng.s, people: this.people.map((p) => ({ brain: p.brain.toJSON(), energy: p.energy, crossings: p.crossings, children: p.children })) };
  }

  // People come back at fresh crossing spots, with their brains and energy.
  static fromJSON(j, city, rng) {
    const c = new Crowd(city, rng, 0);
    c.innov = Innovations.fromJSON(j.innov);
    for (const q of j.people) {
      const p = new Pedestrian(Genome.fromJSON(q.brain), city, rng, q.energy);
      p.crossings = q.crossings; p.children = q.children; p.id = c.nextId--;
      c.people.push(p);
    }
    return c;
  }

  step(dt, cars) {
    for (const p of this.people) {
      const before = p.crossings;
      p.step(dt, cars, this.rng);
      this.events.crossings += p.crossings - before;
    }
    const born = [];
    for (const p of this.people) {
      if (p.alive && p.energy >= PED.birth && this.people.length + born.length < PED.max) {
        p.energy -= PED.birthCost;
        p.children++;
        born.push(p);
      }
    }
    for (const p of this.people) {
      if (!p.alive) { if (p.hit) this.events.hit++; else this.events.starved++; }
    }
    this.people = this.people.filter((p) => p.alive);
    for (const p of born) { this.add(p); this.events.born++; }
    while (this.people.length < PED.min) this.add(this.people.length ? this.rng.pick(this.people) : null);
  }
}
