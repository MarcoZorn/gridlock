import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// An earthquake: on the morning of day three a share of the roads close for
// good, chosen at random but never one that would cut the city in two. Fares
// a day before and after, against the same economy with no quake.
//
//   SHARE=0.1 node tools/quake.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), share = +(process.env.SHARE || 0.1);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = () => (map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")));
const days = 7, quakeDay = 3, perDay = DAY / DT;
const rows = {};
for (const quake of [false, true]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: graph() });
  const fares = Array(days).fill(0);
  let last = 0, closed = 0;
  for (let t = 0; t < days * perDay; t++) {
    if (quake && t === quakeDay * perDay) {
      const c = w.city, rng = new Rng(+seed + 1), want = Math.round(share * c.edges.length);
      const order = c.edges.slice().sort(() => rng.next() - 0.5);
      for (const e of order) {
        if (closed >= want) break;
        const before = !e.oneway ? 0 : e.turned ? 2 : 1;
        c.setRoad(e, 3);
        if (c.stronglyConnected()) closed++; else c.setRoad(e, before);
      }
      w.cityEdited();
    }
    w.step();
    const now = w.events.trips;
    fares[Math.floor(t / perDay)] += now >= last ? now - last : now;
    last = now;
  }
  rows[quake ? `quake (${closed} closed)` : "no quake"] = fares;
}
for (const [k, f] of Object.entries(rows)) console.log(`${map} s${seed} ${k.padEnd(18)} fares by day: ${f.join(" ")}`);
