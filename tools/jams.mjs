import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
import { BODY } from "../src/driver.js";
// Jam sizes: every 10 s of days two to four, stopped cars (not being towed)
// within 25 units of each other are one jam. Self-organised criticality
// would show as a power law: as many jams of each size as a straight line
// on a log-log plot says, with no typical size.
//
//   node tools/jams.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
const sizes = new Map(), perDay = DAY / DT;
for (let t = 0; t < 4 * perDay; t++) {
  w.step();
  if (t < 2 * perDay || t % 600) continue;
  const stopped = w.cars.filter((d) => d.alive && !(d.towing > 0) && Math.abs(d.v) < BODY.stoppedSpeed);
  const seen = new Set();
  for (const s of stopped) {
    if (seen.has(s)) continue;
    let n = 0;
    const stack = [s]; seen.add(s);
    while (stack.length) {
      const a = stack.pop(); n++;
      for (const b of stopped) if (!seen.has(b) && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 625) { seen.add(b); stack.push(b); }
    }
    sizes.set(n, (sizes.get(n) || 0) + 1);
  }
}
// counts in doubling bins, and the slope of log(count per size) on log(size)
const bins = [];
for (let lo = 1; lo <= Math.max(...sizes.keys()); lo *= 2) {
  let c = 0; for (const [k, v] of sizes) if (k >= lo && k < 2 * lo) c += v;
  if (c) bins.push([lo, c / lo]);
}
const xs = bins.map((b) => Math.log(b[0])), ys = bins.map((b) => Math.log(b[1])), mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
console.log(`${map} s${seed}: jams by size`, [...sizes].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" "), ` slope ${slope.toFixed(2)}, largest ${Math.max(...sizes.keys())}`);
