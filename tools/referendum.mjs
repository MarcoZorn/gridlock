import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A city whose drivers vote on the rules. One rule, RULE: speed cameras at
// 35 everywhere, or traffic lights at every junction of three roads or more.
// The first four hours try it off and on, an hour each, so every car has a
// record under both; then every two hours each car an hour old votes for
// whichever regime has paid it more per hour, by its own earnings, and the
// majority rules for the next two. Against the rule held off and held on:
// each day, fares, and the share of the day the rule was in force.
//
//   RULE=camera node tools/referendum.mjs turin 7     (or RULE=lights)
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6), rule = process.env.RULE || "camera";
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT, hour = Math.round(perDay / 24);
const set = (w, on) => { if (rule === "camera") w.speedLimit = on ? 35 : 0; else w.control = on ? "lights" : "none"; };
for (const arm of ["off", "on", "vote"]) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  let on = arm === "on";
  set(w, on);
  // per car: earnings and time under each regime
  const rec = new Map(), last = new Map();
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, onTicks = 0;
    for (let t = 0; t < perDay; t++) {
      const f = w.events.trips;
      w.step();
      fares += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      if (on) onTicks++;
      if (arm !== "vote" || w.tick % hour) continue;
      // book the hour just gone to the regime it ran under
      for (const d of w.cars) {
        const r = rec.get(d) || { on: [0, 0], off: [0, 0] }, got = d.earned - (last.get(d) ?? d.earned);
        if (last.has(d)) { r[on ? "on" : "off"][0] += got; r[on ? "on" : "off"][1]++; }
        rec.set(d, r); last.set(d, d.earned);
      }
      const h = w.tick / hour;
      if (h <= 4) on = h % 2 === 1;   // off, on, off, on: everyone tries both
      else if (h % 2 === 0) {
        let yes = 0, no = 0;
        for (const d of w.cars) {
          const r = rec.get(d);
          if (!r || !r.on[1] || !r.off[1]) continue;
          if (r.on[0] / r.on[1] > r.off[0] / r.off[1]) yes++; else no++;
        }
        if (yes + no) on = yes > no;
      }
      set(w, on);
    }
    out.push(`${fares} ${Math.round((100 * onTicks) / perDay)}%`);
  }
  console.log(`${map} s${seed} ${rule} ${arm.padEnd(4)}: ${out.join(" | ")}`);
}
