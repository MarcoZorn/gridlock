// Does one family take the city? Runs DAYS days on SEEDS seeds (101..) and
// reports, per run, the share of the cars that descend from the biggest
// founder (a car's family is its founder's, as in tools/replay.mjs), and how
// many runs end with a family above half the cars, with a Wilson interval.
//
//   SEEDS=20 DAYS=6 node tools/families.mjs turin
//   FOUNDERS=hand ...   the hand-written driver of src/hand.js, nothing evolves
//   FOUNDERS=docs/trained.json is the default
// one run (used by the pool): node tools/families.mjs one <map> <seed>
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { HandBrain } from "../src/hand.js";

const perDay = DAY / DT, hand = process.env.FOUNDERS === "hand";

export function biggestFamily(w, family) {
  const count = new Map();
  for (const d of w.cars) { const f = family.get(d.id); count.set(f, (count.get(f) || 0) + 1); }
  const [f, n] = [...count].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { family: f, share: n / Math.max(1, w.cars.length), families: count.size, cars: w.cars.length };
}

export function once(map, seed, days) {
  if (hand) ECON.freezeAt = 1;
  const founders = hand ? HandBrain.founders() : Population.fromJSON(JSON.parse(fs.readFileSync(process.env.FOUNDERS || "docs/trained.json", "utf8")).pop);
  const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(map.endsWith(".json") ? map : `maps/${map}.json`, "utf8"));
  const w = new EcoWorld({ seed, founders, graph }), family = new Map();
  for (const d of w.cars) family.set(d.id, d.id);
  const spawnCar = w.spawn.bind(w);
  w.spawn = (...a) => { const d = spawnCar(...a); if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return d; };
  while (w.tick < days * perDay) w.step();
  return biggestFamily(w, family);
}

export const wilson = (k, n) => { const z = 1.96, p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = (z / (1 + z * z / n)) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [c - h, c + h]; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = +(process.env.DAYS || 6);
  if (process.argv[2] === "one") {
    console.log(JSON.stringify(once(process.argv[3], +process.argv[4], days)));
  } else {
    const map = process.argv[2] || "turin", n = +(process.env.SEEDS || 20), seeds = Array.from({ length: n }, (_, i) => 101 + i), res = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, os.cpus().length - 2)) }, async () => {
      while (next < seeds.length) {
        const s = seeds[next++];
        const txt = await new Promise((ok) => { let o = ""; const p = spawn("node", ["tools/families.mjs", "one", map, String(s)], { env: process.env }); p.stdout.on("data", (b) => (o += b)); p.on("exit", () => ok(o)); });
        try { res.push({ seed: s, ...JSON.parse(txt) }); } catch { console.error(`seed ${s} failed`); }
      }
    }));
    res.sort((a, b) => a.seed - b.seed);
    for (const r of res) console.log(`seed ${r.seed}: biggest family ${(100 * r.share).toFixed(0)}% of ${r.cars} cars, ${r.families} families alive`);
    const k = res.filter((r) => r.share > 0.5).length, [lo, hi] = wilson(k, res.length);
    console.log(`${map}, ${hand ? "hand-written drivers" : "evolved drivers"}, ${days} days, ${res.length} seeds: a family owns over half the cars in ${k} of ${res.length} runs (Wilson 95% [${(100 * lo).toFixed(0)}%, ${(100 * hi).toFixed(0)}%])`);
  }
}
