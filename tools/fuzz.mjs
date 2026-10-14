import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A crash hunt: one economy on a map picked by the seed, with random junction
// control, rules and pedestrians, half a day, an editor click in the middle
// and a save at the end. Prints ok or the first error.
//
//   for s in $(seq 1 20); do node tools/fuzz.mjs $s & done; wait
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const maps = [null, ...["turin", "barcelona", "manhattan", "crossroads"].map((m) => JSON.parse(fs.readFileSync(`maps/${m}.json`, "utf8")))];
const seed = +process.argv[2];
let x = seed * 2654435761 % 4294967296; const r = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
const graph = maps[seed % maps.length];
const w = new EcoWorld({ seed, founders, graph, pedestrians: r() < 0.5 ? 40 : 0, control: ["none", "lights", "roundabouts"][Math.floor(r() * 3)] });
Object.assign(w, { congestion: r() < 0.4 ? 0.1 : 0, speedLimit: r() < 0.3 ? 35 : 0, freightBoom: r() < 0.4 ? 3 : 1, finishFare: r() < 0.5 ? 1 : 0, insurance: r() < 0.4 ? 1 : 0 });
const desc = `${graph ? graph.name : "grid"}, ${w.control}, peds ${!!w.crowd}, rules ${JSON.stringify([w.congestion, w.speedLimit, w.freightBoom, w.finishFare, w.insurance])}`;
try {
  for (let t = 0; t < 0.5 * DAY / DT; t++) {
    w.step();
    if (t === 10000 && w.city.edges.length) w.cycleRoad(w.city.edges[Math.floor(r() * w.city.edges.length)]);   // an editor click mid-run
  }
  JSON.parse(JSON.stringify(w));   // and it still saves
  console.log(`seed ${seed} ok: ${desc}, cars ${w.cars.length}`);
} catch (e) { console.log(`seed ${seed} FAILED: ${desc}\n  ${e.stack.split("\n").slice(0, 3).join("\n  ")}`); }
