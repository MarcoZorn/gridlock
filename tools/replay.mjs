import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Replaying the tape (Gould; Blount and Lenski 2008). One economy runs for
// DAYS days and is snapshotted every morning; the family that owns the city
// at the end is "the winner". Then the city is rewound to each morning and
// replayed REPS times with fresh noise. The share of replays the same
// family wins says from when its takeover was already decided.
//
//   REPS=32 DAYS=8 node tools/replay.mjs turin 7 [3,12]      (snapshot hours, default all)
//   EVERY=3 SPAN=48: a snapshot every 3 city hours over the first 48
//   FREEZE=1 ...   the same with mutation switched off after the rewind (the null)
//   one replay:    node tools/replay.mjs one <snapshot.json> <seed>
const perDay = DAY / DT, freeze = !!process.env.FREEZE;
const winnerShare = (w, family) => {
  const count = new Map();
  for (const d of w.cars) { const f = family.get(d.id); count.set(f, (count.get(f) || 0) + 1); }
  const [f, n] = [...count].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { family: f, share: n / Math.max(1, w.cars.length), count };
};
// a car's family is its founder's, fixed at birth through spawn
const track = (w, family) => {
  const spawn = w.spawn.bind(w);
  w.spawn = (...a) => { const d = spawn(...a); if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return d; };
};

if (process.argv[2] === "one") {
  const [, , , file, seed] = process.argv, j = JSON.parse(fs.readFileSync(file, "utf8"));
  const family = new Map(j.family);
  const w = EcoWorld.fromJSON(j.world);
  track(w, family);
  if (+seed) w.rng.s = new Rng(+seed * 2654435761).s || 1;   // seed 0: the same noise as the original
  if (freeze) Object.assign(w.cfg, { pWeight: 0, pToggle: 0, pAddConn: 0, pAddNode: 0 });
  while (w.tick < j.days * perDay) w.step();
  const r = winnerShare(w, family);
  console.log(JSON.stringify({ won: r.count.get(j.winner) || 0, cars: w.cars.length, top: r.family, topShare: r.share }));
  process.exit(0);
}

const [map = "turin", seed = 7, which] = process.argv.slice(2);
const days = +(process.env.DAYS || 8), reps = +(process.env.REPS || 32);
const every = +(process.env.EVERY || 3), span = +(process.env.SPAN || 48), perHour = perDay / 24;
const hours = Array.from({ length: Math.floor(span / every) }, (_, k) => k * every);
const dir = `tmp/replay/${map}-s${seed}-d${days}-e${every}`;
fs.mkdirSync(dir, { recursive: true });

// 1. the original run, with a snapshot (and the family of every car) each morning
if (!fs.existsSync(`${dir}/end.json`)) {
  const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
  const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
  const w = new EcoWorld({ seed: +seed, founders, graph }), family = new Map();
  for (const d of w.cars) family.set(d.id, d.id);
  track(w, family);
  const shares = [];
  for (const h of hours) {
    while (w.tick < h * perHour) w.step();
    fs.writeFileSync(`${dir}/h${h}.json`, JSON.stringify({ world: w.toJSON(), family: [...family], days }));
    shares.push(winnerShare(w, family));
  }
  while (w.tick < days * perDay) w.step();
  const end = winnerShare(w, family);
  // how big the eventual winner was at each snapshot, by its share of the cars
  const path = shares.map((s) => +((s.count.get(end.family) || 0) / [...s.count.values()].reduce((a, b) => a + b, 0)).toFixed(3));
  fs.writeFileSync(`${dir}/end.json`, JSON.stringify({ winner: end.family, share: end.share, path }));
  for (const h of hours) {
    const f = `${dir}/h${h}.json`, j = JSON.parse(fs.readFileSync(f, "utf8"));
    j.winner = end.family; fs.writeFileSync(f, JSON.stringify(j));
  }
}
const end = JSON.parse(fs.readFileSync(`${dir}/end.json`, "utf8"));

// 2. the replays, many at once
const snapDays = which ? which.split(",").map(Number) : hours;
const tag = freeze ? "frozen" : "evolving", out = `${dir}/replays-${tag}.jsonl`;
const have = fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const key = (d, s) => `${d}:${s}`, seen = new Set(have.map((r) => key(r.day, r.seed)));
const jobs = [];
for (const d of snapDays) for (let s = 0; s <= reps; s++) if (!seen.has(key(d, s))) jobs.push([d, s]);   // seed 0: the control
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs.length, os.cpus().length - 2)) }, async () => {
  while (next < jobs.length) {
    const [d, s] = jobs[next++];
    const txt = await new Promise((ok) => { let o = ""; const p = spawn("node", ["tools/replay.mjs", "one", `${dir}/h${d}.json`, String(s)], { env: process.env }); p.stdout.on("data", (b) => (o += b)); p.on("exit", () => ok(o)); });
    try { fs.appendFileSync(out, JSON.stringify({ day: d, seed: s, ...JSON.parse(txt) }) + "\n"); } catch { /* a failed replay is just missing */ }
  }
}));

// 3. P(the original winner wins again), per snapshot day, with a Wilson interval
const all = fs.readFileSync(out, "utf8").trim().split("\n").map(JSON.parse);
const wilson = (k, n) => { const z = 1.96, p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = (z / (1 + z * z / n)) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [c - h, c + h]; };
console.log(`${map} s${seed}, ${days} days, ${tag}: the winner (family ${end.winner}) ends with ${(100 * end.share).toFixed(0)}% of the cars; its share at each snapshot (hours ${hours.join(" ")}) ${end.path.map((x) => (100 * x).toFixed(0) + "%").join(" ")}`);
console.log("rewound to hour | replays the winner wins (>50% of cars) | 95% interval | winner's share then | same-noise control");
for (const d of snapDays) {
  const r = all.filter((x) => x.day === d && x.seed > 0), ctl = all.find((x) => x.day === d && x.seed === 0);
  if (!r.length) continue;
  const k = r.filter((x) => x.won / x.cars > 0.5).length, [lo, hi] = wilson(k, r.length);
  const before = (100 * end.path[hours.indexOf(d)]).toFixed(0) + "%";
  console.log(`hour ${d} | ${k}/${r.length} | ${(100 * lo).toFixed(0)}-${(100 * hi).toFixed(0)}% | ${before} | ${ctl ? (ctl.won / ctl.cars > 0.5 ? "wins" : "loses") + ` (${(100 * ctl.won / ctl.cars).toFixed(0)}%)` : "-"}`);
}
