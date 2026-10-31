// How often does a city start? For each START (comma list, default
// 50,100,150) and seeds 101.., run DAYS days (default 2) with the hand-written
// driver (or FOUNDERS=docs/trained.json: the evolved ones, free to evolve) and count the runs that end with more than FLOOR cars (default 30):
// the others never left their floor (tools/collapse.mjs). Wilson 95% interval each.
//
//   SEEDS=20 START=50,100,150 node tools/starts.mjs turin
// ECON=childCost=12: economy constants for every run (comma list)
// one run (used by the pool): node tools/starts.mjs one <map> <seed> <startCars>
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { EcoWorld, ECON } from "../src/ecoworld.js";
import { HandBrain } from "../src/hand.js";
import { Population } from "../src/neat.js";

export const wilson = (k, n) => { const z = 1.96, p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = (z / (1 + z * z / n)) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [c - h, c + h]; };

export function once(map, seed, startCars, days) {
  const evolved = process.env.FOUNDERS && process.env.FOUNDERS !== "hand";
  for (const kv of (process.env.ECON || "").split(",").filter(Boolean)) { const [k, v] = kv.split("="); if (!(k in ECON)) throw new Error(`unknown economy constant ${k}`); ECON[k] = +v; }
  if (!evolved) ECON.freezeAt = 1;
  const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(map.endsWith(".json") ? map : `maps/${map}.json`, "utf8"));
  const w = new EcoWorld({ seed, founders: evolved ? Population.fromJSON(JSON.parse(fs.readFileSync(process.env.FOUNDERS, "utf8")).pop) : HandBrain.founders(), graph, startCars });
  while (w.tick < days * 86400) w.step();
  return w.cars.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = +(process.env.DAYS || 2);
  if (process.argv[2] === "one") console.log(once(process.argv[3], +process.argv[4], +process.argv[5], days));
  else {
    const map = process.argv[2] || "turin", n = +(process.env.SEEDS || 20), floor = +(process.env.FLOOR || 30);
    const starts = (process.env.START || "50,100,150").split(",").map(Number), jobs = [];
    for (const st of starts) for (let i = 0; i < n; i++) jobs.push([st, 101 + i]);
    const res = new Map(starts.map((s) => [s, []]));
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs.length, os.cpus().length - 2)) }, async () => {
      while (next < jobs.length) {
        const [st, s] = jobs[next++];
        const txt = await new Promise((ok) => { let o = ""; const p = spawn("node", ["tools/starts.mjs", "one", map, String(s), String(st)], { env: process.env }); p.stdout.on("data", (b) => (o += b)); p.on("exit", () => ok(o)); });
        if (txt.trim()) res.get(st).push(+txt); else console.error(`seed ${s} at ${st} failed`);
      }
    }));
    for (const [st, cars] of res) {
      const k = cars.filter((c) => c > floor).length, [lo, hi] = wilson(k, cars.length);
      console.log(`${map}, ${process.env.FOUNDERS && process.env.FOUNDERS !== "hand" ? "evolved drivers" : "hand-written drivers"}, startCars ${st}, ${days} days: ${k} of ${cars.length} runs end with more than ${floor} cars (Wilson 95% [${(100 * lo).toFixed(0)}%, ${(100 * hi).toFixed(0)}%])`);
    }
  }
}
