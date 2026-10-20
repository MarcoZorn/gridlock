import fs from "node:fs";
import { EcoWorld, ECON, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Genome } from "../src/genome.js";
import { Body } from "../src/body.js";
import { Rng } from "../src/neat.js";
// Migration: thirty cars from an economy evolved in one city dropped into an
// economy evolved in another, each with a newcomer's starting cash, next to
// thirty of the home city's own cars dropped in the same way. A day later:
// how many of each are still on the road, what they earned an hour while
// they were, and how many cars their families number.
//
//   node tools/migrate.mjs nyc-base-s7 inh-base-s7     (home run, away run)
const [home, away] = process.argv.slice(2);
const load = (run) => JSON.parse(fs.readFileSync(`runs/${run}/state.json`, "utf8"));
const H = load(home), A = load(away), w = EcoWorld.fromJSON(H), rng = new Rng(3);
const pick = (cars) => Array.from({ length: 30 }, () => cars[rng.int(cars.length)]);
const tag = new Map(), first = { home: [], away: [] }, died = new Map();
for (const [kind, from] of [["home", H], ["away", A]]) for (const c of pick(from.cars)) {
  const d = w.spawn(Genome.fromJSON(c.brain), Body.fromJSON(c.body), ECON.startCash, null);
  tag.set(d.id, kind); first[kind].push(d);
}
// what each of the sixty earned, by kind of job, and how long its trips took
const jobs = new Map(), pay = w.pay.bind(w);
w.pay = (d) => {
  const j = d.job, before = d.cash;
  pay(d);
  if (!j?.kind || !tag.has(d.id) || !jobs.has(d)) return;
  const r = jobs.get(d); r[j.kind] = (r[j.kind] || 0) + d.cash - before; r.n++; r.ticks += w.tick - j.start; r.len += d.routeLen;
};
for (const d of [...first.home, ...first.away]) jobs.set(d, { n: 0, ticks: 0, len: 0 });
for (let t = 0; t < DAY / DT; t++) {
  w.step();
  if (t % 60) continue;
  for (const d of w.cars) if (!tag.has(d.id) && tag.has(d.parent)) tag.set(d.id, tag.get(d.parent));
  // when each of the sixty left the road (ancestry entries get pruned, so keep our own)
  const now = new Set(w.cars);
  for (const d of [...first.home, ...first.away]) if (!now.has(d) && !died.has(d)) died.set(d, w.tick);
}
const alive = new Set(w.cars);
for (const kind of ["home", "away"]) {
  const f = first[kind], rate = f.reduce((a, d) => a + d.earned / Math.max(1, (died.get(d) ?? w.tick) - d.born) * 3600, 0) / f.length;
  const family = w.cars.filter((d) => tag.get(d.id) === kind).length;
  const hours = f.reduce((a, d) => a + ((died.get(d) ?? w.tick) - d.born) / 3600, 0);
  const per = (k) => (f.reduce((a, d) => a + d[k], 0) / hours).toFixed(1);
  const J = f.map((d) => jobs.get(d)), sum = (k) => J.reduce((a, r) => a + (r[k] || 0), 0);
  const lived = f.reduce((a, d) => a + ((died.get(d) ?? w.tick) - d.born) / 3600, 0);
  const freight = sum("freight") / (sum("freight") + sum("passenger")), cap = f.reduce((a, d) => a + d.body.capacity, 0) / f.length;
  console.log(`   ${kind}: ${(sum("n") / lived).toFixed(2)} paid fares an hour, ${(100 * freight).toFixed(0)}% of earnings from freight, capacity ${cap.toFixed(1)}, trip ${(sum("ticks") / sum("n") / 60).toFixed(0)} s, route ${(sum("len") / sum("n")).toFixed(0)} units, ${(sum("passenger") + sum("freight")) / sum("n") > 0 ? ((sum("passenger") + sum("freight")) / sum("n")).toFixed(1) : "-"} a fare`);
  console.log(`${home} <- ${kind === "home" ? "its own" : away}: ${f.filter((d) => alive.has(d)).length}/30 still driving after a day, ${rate.toFixed(1)} earned an hour, ${per("crashes")} crashes and ${per("trips")} trips an hour, life ${(hours / 30).toFixed(1)} h, family now ${family} cars of ${w.cars.length}`);
}
