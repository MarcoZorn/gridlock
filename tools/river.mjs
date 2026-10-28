import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A river and its bridges: a generated city cut down the middle, every road
// that crosses the line closed except BRIDGES of them, spread along it.
// The economy grows up with them; on day four one bridge closes. Fares a
// day, with both bridges kept against one closed, and against no river.
// (A closed road is still driven when there is no other way, as with the
// editor; here there always is one, the other bridge.)
//
//   BRIDGES=2 node tools/river.mjs 7
const seed = +(process.argv[2] || 7), bridges = +(process.env.BRIDGES || 2), days = +(process.env.DAYS || 6);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
for (const arm of ["no river", "both bridges", "one closes"]) {
  const w = new EcoWorld({ seed, founders, size: "medium" });
  const c = w.city, mid = c.w / 2;
  const crossing = c.edges.filter((e) => (c.nodes[e.a].x - mid) * (c.nodes[e.b].x - mid) < 0).sort((p, q) => (c.nodes[p.a].y + c.nodes[p.b].y) - (c.nodes[q.a].y + c.nodes[q.b].y));
  const keep = new Set(Array.from({ length: bridges }, (_, i) => crossing[Math.round(((i + 0.5) / bridges) * crossing.length - 0.5)]));
  if (arm !== "no river") { for (const e of crossing) if (!keep.has(e)) c.closed.add(e.id); w.cityEdited(); }
  const out = [];
  for (let day = 1; day <= days; day++) {
    if (arm === "one closes" && day === 4) { c.closed.add([...keep][0].id); w.cityEdited(); }
    let fares = 0;
    for (let t = 0; t < perDay; t++) { const f = w.events.trips; w.step(); fares += w.events.trips >= f ? w.events.trips - f : w.events.trips; }
    out.push(fares);
  }
  console.log(`city ${seed} ${arm.padEnd(12)} (${crossing.length} roads cross the line): fares ${out.join(" ")}`);
}
