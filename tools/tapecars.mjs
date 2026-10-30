// Replaying the tape on the racing cars (Blount, Borland and Lenski 2008):
// evolve to generation FROM, save the population, then rerun from the save
// REPS times with a fresh random stream and see where evolution ends up.
// Same tracks every time; only the mutation and crossover noise differs.
//
//   SEED=1 FROM=10 GENS=40 REPS=8 node tools/tapecars.mjs
//
// "Which species ends on top": the best car of generation FROM+GENS is matched to the nearest of the saved population's species
// (compatibility distance), and the replays are counted per species.
import { World } from "../src/world.js";
import { Population, distance } from "../src/neat.js";

const env = (k, d) => +(process.env[k] || d);
const seed = env("SEED", 1), from = env("FROM", 10), gens = env("GENS", 40), reps = env("REPS", 8);

export function tape(seed, from) {
  const w = new World({ seed });
  while (w.pop.generation < from) w.runGeneration();
  return JSON.parse(JSON.stringify(w.pop.toJSON()));
}

// one replay: resume the save with noise `noise`, run `gens` generations
export function replay(seed, snap, noise, gens) {
  const w = new World({ seed });
  w.pop = Population.fromJSON(snap);
  if (noise) w.pop.rng.s = noise >>> 0;
  w.history = [];
  w.newGeneration();
  for (let i = 0; i < gens - 1; i++) w.runGeneration();
  while (w.step()) {}     // the last generation, stopped before it breeds
  return w.leader();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snap = tape(seed, from), reps0 = Population.fromJSON(snap).species.map((s) => s.rep);
  const cfg = Population.fromJSON(snap).cfg, rows = [];
  for (let r = 0; r < reps; r++) {
    const lead = replay(seed, snap, 1000003 * (r + 1) + seed, gens), b = lead.genome;
    b.fitness = lead.fitness();
    let home = 0, d0 = Infinity;
    reps0.forEach((s, i) => { const d = distance(b, s, cfg); if (d < d0) { d0 = d; home = i; } });
    rows.push({ r, home, fit: b.fitness, hidden: [...b.nodes.values()].filter((n) => n.kind === "hidden").length });
    console.log(`replay ${r}: best ${b.fitness.toFixed(1)}, hidden nodes ${rows[r].hidden}, nearest saved species ${home} (distance ${d0.toFixed(2)})`);
  }
  const count = new Map();
  for (const x of rows) count.set(x.home, (count.get(x.home) || 0) + 1);
  const [top, n] = [...count].sort((a, b) => b[1] - a[1])[0];
  const z = 1.96, p = n / reps, den = 1 + z * z / reps, mid = (p + z * z / (2 * reps)) / den, half = z * Math.sqrt(p * (1 - p) / reps + z * z / (4 * reps * reps)) / den;
  console.log(`seed ${seed}, saved at generation ${from} (${reps0.length} species), ${reps} replays of ${gens} generations`);
  console.log(`species counts: ${[...count].map(([k, v]) => `${k}:${v}`).join(" ")}; modal species ${top} wins ${n} of ${reps} (Wilson 95% [${(100 * (mid - half)).toFixed(0)}%, ${(100 * (mid + half)).toFixed(0)}%])`);
  const f = rows.map((x) => x.fit);
  console.log(`best fitness across replays: min ${Math.min(...f).toFixed(1)}, max ${Math.max(...f).toFixed(1)}`);
}
