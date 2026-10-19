import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Snow: from the morning of day two, grip falls to GRIP for every car on the
// road and every one born after: engine, brakes and steering all bite less.
// The economy keeps breeding, so the question is whether caution evolves
// within the winter: crashes per 1000 units driven and mean speed, by day,
// against the same economy with no snow.
//
//   GRIP=0.5 DAYS=8 node tools/snow.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const grip = +(process.env.GRIP || 0.5), days = +(process.env.DAYS || 8), snowDay = 1, perDay = DAY / DT;
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
const icy = (d) => { d.p = { ...d.p, accel: d.p.accel * grip, brake: d.p.brake * grip, turnRate: d.p.turnRate * grip }; };
for (const snow of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const spawn = w.spawn.bind(w);
  let snowing = false;
  w.spawn = (...a) => { const d = spawn(...a); if (snowing) icy(d); return d; };
  const row = Array.from({ length: days }, () => ({ fares: 0, crashes: 0, dist: 0, n: 0 }));
  let f0 = 0, k0 = 0;
  for (let t = 0; t < days * perDay; t++) {
    if (snow && t === snowDay * perDay) { snowing = true; w.cars.forEach(icy); }
    w.step();
    const r = row[Math.floor(t / perDay)], f = w.events.trips, k = w.events.crashes;
    // events reset at dawn
    r.fares += f >= f0 ? f - f0 : f; r.crashes += k >= k0 ? k - k0 : k; f0 = f; k0 = k;
    for (const d of w.cars) r.dist += Math.abs(d.v) * DT;
    r.n += w.cars.length;
  }
  const fmt = (k) => row.map(k).join(" ");
  console.log(`${map} s${seed} ${snow ? `snow ${grip}` : "clear   "} fares ${fmt((r) => r.fares)}`);
  console.log(`${" ".repeat(map.length + String(seed).length + 11)}crash/1000 ${fmt((r) => (1000 * r.crashes / r.dist).toFixed(2))}`);
  console.log(`${" ".repeat(map.length + String(seed).length + 11)}speed ${fmt((r) => (r.dist / r.n / DT).toFixed(1))}`);
}
