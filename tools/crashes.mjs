import fs from "node:fs";
import { CityWorld } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Crashes replayed from the drivers' own senses: the shipped drivers in
// unseen cities with traffic, each car's senses and controls kept for its
// last LOOK ticks. At every car-on-car crash, for both cars: did any ray see
// a car LOOK ticks before (nearest car hit under its sight range), how fast
// was it closing, what was the throttle, and was the car braking in the
// last fifth of a second? Then, with an id pair, the two cars' last second
// tick by tick.
//
//   LOOK=30 node tools/crashes.mjs            (half a second at 60 ticks a second)
const LOOK = +(process.env.LOOK || 30), pop = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const hist = new Map();   // car -> ring of { seen, closing, v, throttle }
const rows = [];
let first = null;
for (const seed of [77, 91, 105]) {
  const e = new CityWorld({ seed, cities: 1, popSize: 120, traffic: true, density: 60 });
  e.pop.genomes = pop.genomes; e.newGeneration();
  e.onCarCrash = (a, b) => {
    for (const [me, other] of [[a, b], [b, a]]) {
      const h = hist.get(me);
      if (!h || h.length < LOOK) continue;
      const then = h[0], last = h.slice(-12);
      rows.push({ seen: then.seen, closing: then.closing, throttle: then.throttle, braking: last.some((x) => x.throttle < 0), v: h.at(-1).v, junction: e.city.junctionAt(me.x, me.y) >= 0 });
      if (!first && then.seen) first = { a: [...hist.get(a)], b: [...hist.get(b)] };
    }
  };
  while (e.step()) {
    for (const c of e.cars) {
      if (!c.alive) continue;
      let near = Infinity, k = -1;
      c.carRay.forEach((d, i) => { if (d < near) { near = d; k = i; } });
      const R = c.p.rayRange, h = hist.get(c) || [];
      h.push({ seen: near < R, near: near / R, closing: k >= 0 && near < R ? c.closing[k] : 0, v: c.v, throttle: c.out[1], steer: c.out[0] });
      if (h.length > LOOK) h.shift();
      hist.set(c, h);
    }
  }
}
const n = rows.length, share = (f) => `${((100 * rows.filter(f).length) / n).toFixed(0)}%`, mean = (f) => (rows.reduce((s, r) => s + f(r), 0) / n).toFixed(2);
console.log(`${n} cars in car-on-car crashes, ${LOOK} ticks before: another car in sight ${share((r) => r.seen)}; closing on it (mean, of top speed) ${mean((r) => r.closing)}; throttle then ${mean((r) => r.throttle)}; braked at all in the last fifth of a second ${share((r) => r.braking)}; in a junction ${share((r) => r.junction)}`);
const seen = rows.filter((r) => r.seen), unseen = rows.filter((r) => !r.seen), m2 = (a, f) => (a.reduce((s, r) => s + f(r), 0) / Math.max(1, a.length)).toFixed(2);
console.log(`  saw it coming: throttle ${m2(seen, (r) => r.throttle)}, braked ${((100 * seen.filter((r) => r.braking).length) / Math.max(1, seen.length)).toFixed(0)}%; did not: throttle ${m2(unseen, (r) => r.throttle)}, braked ${((100 * unseen.filter((r) => r.braking).length) / Math.max(1, unseen.length)).toFixed(0)}%`);
if (first) {
  console.log("one crash, the last half second of each car (every fifth tick): nearest car as a share of sight, closing, speed, throttle, steering");
  for (const [name, h] of [["A", first.a], ["B", first.b]]) console.log(`  ${name}: ` + h.filter((_, i) => i % 5 === 4).map((x) => `${x.seen ? x.near.toFixed(2) : "-"}/${x.closing.toFixed(2)}/${x.v.toFixed(0)}/${x.throttle.toFixed(2)}/${x.steer.toFixed(2)}`).join("  "));
}
