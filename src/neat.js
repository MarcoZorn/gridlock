// Mutation, crossover, speciation: the evolution itself.
import { Genome, Innovations } from "./genome.js";

export class Rng {
  constructor(seed = 12345) { this.s = seed >>> 0; }
  next() { // xorshift32, so a run is reproducible from its seed
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  normal() { // Box-Muller
    const u = Math.max(this.next(), 1e-9), v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export const DEFAULTS = {
  popSize: 120,
  // mutation
  pWeight: 0.8, pWeightReplace: 0.1, weightStep: 0.4, weightCap: 8,
  pAddConn: 0.12, pAddNode: 0.035, pToggle: 0.01, addConnTries: 20,
  // reproduction
  pCrossover: 0.75, survival: 0.35, elitism: 1, elitismMinSize: 5,
  pInheritDisabled: 0.75, interspecies: 0.001,
  // speciation
  compatThreshold: 3.0, cDisjoint: 1.0, cWeight: 0.5, smallGenome: 20,
  targetSpecies: 8, thresholdStep: 0.3, stagnation: 18,
};

export function mutate(g, innov, rng, cfg) {
  if (g.hand) return g;
  for (const c of g.conns.values()) {
    if (rng.next() < cfg.pWeight) {
      if (rng.next() < cfg.pWeightReplace) c.w = rng.normal();
      else c.w += rng.normal() * cfg.weightStep;
      c.w = Math.max(-cfg.weightCap, Math.min(cfg.weightCap, c.w));
    }
  }
  if (rng.next() < cfg.pToggle && g.conns.size) {
    const c = rng.pick([...g.conns.values()]);
    c.on = !c.on;
    g.dirty();
  }
  if (rng.next() < cfg.pAddConn) addConnection(g, innov, rng, cfg);
  if (rng.next() < cfg.pAddNode) addNode(g, innov, rng);
  g.dirty();   // weights changed in place, so any compiled network is stale
  return g;
}

// A new connection may only run shallow -> deep. That single constraint is
// what makes cycles structurally impossible instead of something to detect.
function addConnection(g, innov, rng, cfg) {
  const nodes = [...g.nodes.values()];
  for (let t = 0; t < cfg.addConnTries; t++) {
    const a = rng.pick(nodes), b = rng.pick(nodes);
    if (a.depth >= b.depth) continue;
    if (b.kind === "input" || b.kind === "bias") continue;
    const id = innov.connId(a.id, b.id);
    if (g.conns.has(id)) continue;
    g.conns.set(id, { inId: a.id, outId: b.id, w: rng.normal(), on: true, innov: id });
    g.dirty();
    return true;
  }
  return false;
}

// Splitting a connection is how NEAT adds depth. The old connection is
// disabled rather than deleted, and the two new ones are weighted 1 and w so
// the network's behaviour is unchanged the moment the node appears. A
// structural mutation that changed behaviour immediately would almost always
// be selected away before it had a chance to be useful.
function addNode(g, innov, rng) {
  const on = [...g.conns.values()].filter((c) => c.on);
  if (!on.length) return false;
  const c = rng.pick(on);
  c.on = false;
  const id = innov.splitNode(c.innov);
  const depth = (g.nodes.get(c.inId).depth + g.nodes.get(c.outId).depth) / 2;
  if (!g.nodes.has(id)) g.nodes.set(id, { id, kind: "hidden", depth });
  const i1 = innov.connId(c.inId, id), i2 = innov.connId(id, c.outId);
  g.conns.set(i1, { inId: c.inId, outId: id, w: 1, on: true, innov: i1 });
  g.conns.set(i2, { inId: id, outId: c.outId, w: c.w, on: true, innov: i2 });
  g.dirty();
  return true;
}

// Align two genomes by innovation number. Matching genes are inherited from
// either parent at random; everything the fitter parent has and the other
// does not is inherited from the fitter parent.
export function crossover(a, b, rng, cfg) {
  if (b.fitness > a.fitness) [a, b] = [b, a];
  const child = new Genome(a.nIn, a.nOut);
  child.biasId = a.biasId;
  child.outIds = [...a.outIds];
  for (const [id, n] of a.nodes) child.nodes.set(id, { ...n });
  for (const [innov, ca] of a.conns) {
    const cb = b.conns.get(innov);
    let c;
    if (cb && rng.next() < 0.5) c = { ...cb };
    else c = { ...ca };
    if (cb && (!ca.on || !cb.on)) c.on = rng.next() > cfg.pInheritDisabled;
    child.conns.set(innov, c);
  }
  return child;
}

// How different are two genomes? Disjoint and excess genes count as structural
// distance, matching genes contribute their average weight difference.
export function distance(a, b, cfg) {
  let matching = 0, diff = 0, disjoint = 0;
  for (const [innov, ca] of a.conns) {
    const cb = b.conns.get(innov);
    if (cb) { matching++; diff += Math.abs(ca.w - cb.w); }
    else disjoint++;
  }
  for (const innov of b.conns.keys()) if (!a.conns.has(innov)) disjoint++;
  const n = Math.max(a.conns.size, b.conns.size);
  const norm = n < cfg.smallGenome ? 1 : n;
  const w = matching ? diff / matching : 0;
  return (cfg.cDisjoint * disjoint) / norm + cfg.cWeight * w;
}

class Species {
  constructor(rep, id) { this.id = id; this.rep = rep; this.members = []; this.best = -Infinity; this.stale = 0; }
}

// how many generations of ancestry a population keeps
const LINEAGE_GENS = 60;

export class Population {
  constructor(nIn, nOut, cfg = {}, seed = 1) {
    this.cfg = { ...DEFAULTS, ...cfg };
    this.rng = new Rng(seed);
    this.innov = new Innovations(nIn + 1 + nOut);
    this.threshold = this.cfg.compatThreshold;
    this.generation = 0;
    this.best = null;
    this.species = [];
    this.nextSpecies = 1; this.nextId = 1;
    this.ancestry = new Map();   // genome id -> {gen, parents, species, fitness}, the last LINEAGE_GENS generations
    this.genomes = [];
    for (let i = 0; i < this.cfg.popSize; i++) {
      const g = Genome.initial(nIn, nOut, this.innov, this.rng);
      mutate(g, this.innov, this.rng, this.cfg);
      this.genomes.push(g);
    }
  }

  // Call once every genome in this.genomes has a .fitness.
  evolve() {
    const cfg = this.cfg, rng = this.rng;
    this.speciate();
    this.tag();

    for (const s of this.species) {
      s.members.sort((x, y) => y.fitness - x.fitness);
      if (s.members[0].fitness > s.best + 1e-9) { s.best = s.members[0].fitness; s.stale = 0; }
      else s.stale++;
    }

    const champion = this.genomes.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    if (!this.best || champion.fitness > this.best.fitness) {
      this.best = champion.clone();
      this.best.id = champion.id;   // same lineage entry, a separate object
      this.best.fitness = champion.fitness;
    }

    // Drop species that have stopped improving, but never all of them.
    let alive = this.species.filter((s) => s.stale < cfg.stagnation);
    if (!alive.length) alive = [this.species.reduce((a, b) => (b.best > a.best ? b : a))];
    this.species = alive;

    // Fitness sharing: a genome's fitness is divided by the size of its
    // species. Without it, one lineage that gets lucky early wipes out every
    // structural experiment before any of them has time to pay off.
    let total = 0;
    for (const s of this.species) {
      s.adjusted = s.members.reduce((t, g) => t + Math.max(g.fitness, 0), 0) / (cfg.sharing === false ? 1 : s.members.length);
      total += s.adjusted;
    }

    const next = [];
    for (const s of this.species) {
      const share = total > 0 ? s.adjusted / total : 1 / this.species.length;
      let n = Math.round(share * cfg.popSize);
      if (s.members.length >= cfg.elitismMinSize) {
        for (let e = 0; e < cfg.elitism && e < s.members.length; e++) {
          next.push(this.born(s.members[e].clone(), [s.members[e]]));
          n--;
        }
      }
      const pool = s.members.slice(0, Math.max(1, Math.floor(s.members.length * cfg.survival)));
      for (let i = 0; i < n; i++) {
        let child, from;
        if (pool.length > 1 && rng.next() < cfg.pCrossover) {
          const a = rng.pick(pool), b = rng.pick(pool);
          child = crossover(a, b, rng, cfg);
          from = [a, b];
        } else {
          const a = rng.pick(pool);
          child = a.clone();
          from = [a];
        }
        next.push(this.born(mutate(child, this.innov, rng, cfg), from));
      }
    }
    while (next.length < cfg.popSize) {
      next.push(this.born(mutate(this.best.clone(), this.innov, rng, cfg), [this.best]));
    }
    next.length = cfg.popSize;

    // Nudge the compatibility threshold so the number of species stays in a
    // useful band instead of collapsing to one or exploding to the population.
    if (this.species.length < cfg.targetSpecies) this.threshold = Math.max(0.3, this.threshold - cfg.thresholdStep);
    else if (this.species.length > cfg.targetSpecies) this.threshold += cfg.thresholdStep;

    for (const s of this.species) { s.rep = s.members[0]; s.members = []; }
    this.genomes = next;
    this.generation++;
    for (const [id, a] of this.ancestry) if (a.gen < this.generation - LINEAGE_GENS) this.ancestry.delete(id);
  }

  // Give every genome of this generation an id and a lineage entry, with its
  // species and fitness; the first generation has no parents. Draws no random numbers.
  tag() {
    for (const s of this.species) for (const g of s.members) {
      if (g.id == null || !this.ancestry.has(g.id)) { g.id = this.nextId++; this.ancestry.set(g.id, { gen: this.generation, parents: [] }); }
      Object.assign(this.ancestry.get(g.id), { species: s.id, fitness: g.fitness });
    }
  }

  born(child, parents) {
    child.id = this.nextId++;
    this.ancestry.set(child.id, { gen: this.generation + 1, parents: parents.map((p) => p.id) });
    return child;
  }

  // The first-parent chain behind a genome, oldest first, as far back as the
  // population remembers: [{id, gen, parents, species, fitness}].
  lineage(g) {
    const out = [];
    for (let id = g.id, a = this.ancestry.get(id); a; id = a.parents[0], a = this.ancestry.get(id)) out.push({ id, ...a });
    return out.reverse();
  }

  // Everything needed to carry on evolving exactly where this left off:
  // genomes, the innovation registry (without it new mutations would reuse
  // old numbers for different genes), species and the random stream.
  toJSON() {
    return {
      cfg: this.cfg, rng: this.rng.s, threshold: this.threshold, generation: this.generation,
      innov: this.innov.toJSON(),
      genomes: this.genomes.map((g) => g.toJSON()),
      best: this.best ? { g: this.best.toJSON(), f: this.best.fitness } : null,
      species: this.species.map((s) => ({ rep: s.rep.toJSON(), best: s.best, stale: s.stale })),
    };
  }

  static fromJSON(j) {
    const p = Object.create(Population.prototype);
    p.cfg = { ...DEFAULTS, ...j.cfg };
    p.rng = new Rng(1);
    p.rng.s = j.rng;
    p.threshold = j.threshold;
    p.nextSpecies = 1; p.nextId = 1; p.ancestry = new Map();   // a save does not carry ancestry
    p.generation = j.generation;
    p.innov = Innovations.fromJSON(j.innov);
    p.genomes = j.genomes.map((g) => Genome.fromJSON(g));
    p.best = null;
    if (j.best) { p.best = Genome.fromJSON(j.best.g); p.best.fitness = j.best.f; }
    p.species = j.species.map((s) => {
      const sp = new Species(Genome.fromJSON(s.rep), p.nextSpecies++);
      sp.best = s.best; sp.stale = s.stale;
      return sp;
    });
    return p;
  }

  speciate() {
    for (const s of this.species) s.members = [];
    for (const g of this.genomes) {
      let home = null;
      for (const s of this.species) {
        if (distance(g, s.rep, this.cfg) < this.threshold) { home = s; break; }
      }
      if (!home) { home = new Species(g, this.nextSpecies++); this.species.push(home); }
      home.members.push(g);
    }
    this.species = this.species.filter((s) => s.members.length);
  }
}
