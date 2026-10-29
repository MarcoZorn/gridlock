import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Learner drivers who copy their instructor. The instructor is the best
// earner per hour on the road (an hour old at least, as ECON.imitate picks);
// every tenth tick what it saw and what it did (steer, throttle) goes into a
// notebook of the last SAMPLES moments. A share LEARN of children, born with
// their parent's mutated brain as usual, then take STEPS lessons: a random
// nudge to every weight, kept if their steering and throttle on the
// instructor's moments come closer to the instructor's. Behavioural cloning
// by hill-climbing; the genes are the parent's, the habits the teacher's.
// Each day: fares, cars, crashes per 1000 units, and for learners the share
// of the gap to the instructor closed. Against no lessons, and against
// copying the instructor's brain outright (ECON.imitate).
//
//   LEARN=0.3 STEPS=20 SAMPLES=300 node tools/learner.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6);
const share = +(process.env.LEARN || 0.3), steps = +(process.env.STEPS || 20), nSamples = +(process.env.SAMPLES || 300);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const perDay = DAY / DT;
let r = 99;
const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

// mean squared gap in steer and throttle between a brain and the notebook
const gap = (g, book) => {
  const out = [];
  let e = 0;
  for (const s of book) { g.activate(s.inputs, out); e += (out[0] - s.out[0]) ** 2 + (out[1] - s.out[1]) ** 2; }
  return e / book.length;
};
const lesson = (g, book) => {
  const conns = [...g.conns.values()].filter((c) => c.on);
  const e0 = gap(g, book);
  let e = e0;
  for (let k = 0; k < steps; k++) {
    const old = conns.map((c) => c.w);
    for (const c of conns) c.w += 0.1 * gauss();
    g.dirty();
    const e1 = gap(g, book);
    if (e1 < e) e = e1;
    else { conns.forEach((c, i) => (c.w = old[i])); g.dirty(); }
  }
  return e0 > 0 ? 1 - e / e0 : 0;
};

for (const mode of ["none", "imitate", "learn"]) {
  ECON.imitate = mode === "imitate" ? share : 0;
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  let teacher = null, book = [], closed = 0, lessons = 0;
  if (mode === "learn") {
    const birth = w.birth.bind(w);
    w.birth = (parent) => {
      const child = birth(parent);
      if (book.length >= nSamples / 2 && rand() < share) { closed += lesson(child.genome, book); lessons++; }
      return child;
    };
  }
  const out = [];
  for (let day = 1; day <= days; day++) {
    let fares = 0, hits = 0, dist = 0;
    closed = 0; lessons = 0;
    for (let t = 0; t < perDay; t++) {
      if (mode === "learn" && w.tick % 600 === 0) {
        let rate = -Infinity, best = null;
        for (const o of w.cars) { const age = w.tick - o.born; if (age >= 3600 && o.earned / age > rate) { rate = o.earned / age; best = o; } }
        if (best !== teacher) { teacher = best; book = []; }   // a new teacher, a new notebook
      }
      const ev = w.events, f = ev.trips, h = ev.carCrashes;
      w.step();
      const nv = w.events, fresh = nv !== ev;   // events are reset now and then inside step()
      fares += fresh ? nv.trips : nv.trips - f;
      hits += fresh ? nv.carCrashes : nv.carCrashes - h;
      for (const d of w.cars) dist += Math.abs(d.v) * DT;
      if (teacher && w.tick % 10 === 0 && w.cars.includes(teacher) && !teacher.towing) {
        book.push({ inputs: Float64Array.from(teacher.inputs), out: [teacher.out[0], teacher.out[1]] });
        if (book.length > nSamples) book.shift();
      }
    }
    out.push(`${fares} ${w.cars.length}c ${(1000 * hits / dist).toFixed(2)}${mode === "learn" ? ` ${lessons}L ${(100 * closed / Math.max(1, lessons)).toFixed(0)}%` : ""}`);
  }
  console.log(`${map} s${seed} ${mode.padEnd(7)}: ${out.join(" | ")}`);
}
