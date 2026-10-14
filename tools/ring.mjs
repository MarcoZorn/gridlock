import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Phantom jams: a one-way ring road and nothing else. Do stop-and-go waves
// appear? Writes a space-time record to tmp/ring-st-<cars>.json.
//
//   node tools/ring.mjs 90
const N = 32, R = 420, cx = 480, cy = 480;
const graph = { name: "ring", nodes: Array.from({ length: N }, (_, i) => [Math.round(cx + R * Math.cos(2 * Math.PI * i / N)), Math.round(cy + R * Math.sin(2 * Math.PI * i / N))]), edges: Array.from({ length: N }, (_, i) => [i, (i + 1) % N, 1, 1]) };
fs.writeFileSync("tmp/ring.json", JSON.stringify(graph));
const density = +process.argv[2];
const pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const size = Math.max(120, density), genomes = Array.from({ length: size }, (_, i) => pop.genomes[i % pop.genomes.length]);
const e = new CityWorld({ seed: 5, popSize: size, traffic: true, density, graph });
e.pop.genomes = genomes; e.newGeneration();
let t = 0, samples = 0, stopped = 0, vs = [], space = [];
while (e.step()) {
  if (++t % 15 || t < 600) continue;
  const live = e.cars.filter((c) => c.solid);
  if (live.length < 2) continue;
  const v = live.map((c) => Math.abs(c.v)), mean = v.reduce((a, b) => a + b, 0) / v.length;
  vs.push(Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) / (mean || 1));
  stopped += v.filter((x) => x < 6).length; samples += v.length;
  // a space-time row: speed by position round the ring, 120 bins
  const row = new Array(120).fill(null);
  for (const c of live) { const a = (Math.atan2(c.y - cy, c.x - cx) + 2 * Math.PI) % (2 * Math.PI); row[Math.floor(a / (2 * Math.PI) * 120)] = Math.abs(c.v); }
  space.push(row);
}
fs.writeFileSync(`tmp/ring-st-${density}.json`, JSON.stringify(space));
console.log(`ring, ${density} cars: speed spread (cv) ${(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)}  stopped ${(100 * stopped / samples).toFixed(0)}%`);
