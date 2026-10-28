import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// A stock market of lineages. Founders' families will not do: by day two or
// three one or two of them are the whole city (tools/dynasty.mjs). So the
// market re-lists at every dawn: each car alive then is a stock for the day,
// and its children born that day belong to it; a share pays, each hour, the
// stock's fares per living member.
// Investors only watch, the economy does not know they are there. Each hour
// a portfolio is rebuilt from the hour before and paid by the hour after:
//   index      every car alike (the city's fares per car)
//   momentum   the TOP stocks that paid most per member last hour
//   contrarian the TOP that paid least
//   size       the TOP biggest
// Over days two to DAYS:
// each portfolio's dividend against the index, and the share of hours it beat it.
//
//   DAYS=6 node tools/stocks.mjs turin 7
const [map = "turin", seed = 7] = process.argv.slice(2), days = +(process.env.DAYS || 6), TOP = +(process.env.TOP || 10), MIN = 1;
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
const family = new Map();
const root = (d) => { if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return family.get(d.id); };
for (const d of w.cars) root(d);
const spawn = w.spawn.bind(w);
w.spawn = (...a) => { const d = spawn(...a); root(d); return d; };
let earned = new Map();
const pay = w.pay.bind(w);
w.pay = (d) => { const before = d.cash; pay(d); const f = root(d); earned.set(f, (earned.get(f) || 0) + d.cash - before); };
const hour = Math.round(DAY / DT / 24), hours = [];
for (let h = 0; h < days * 24; h++) {
  if (h % 24 === 0) { family.clear(); for (const d of w.cars) family.set(d.id, d.id); }
  earned = new Map();
  for (let t = 0; t < hour; t++) w.step();
  const size = new Map();
  for (const d of w.cars) { const f = root(d); size.set(f, (size.get(f) || 0) + 1); }
  hours.push({ earned, size });
}
const pick = (hr, by, n) => [...hr.size].filter(([, s]) => s >= MIN).sort((a, b) => by(b) - by(a)).slice(0, n).map(([f]) => f);
const perCar = (hr) => ([f, s]) => (hr.earned.get(f) || 0) / s;
const payout = (hr, fams) => { let e = 0, s = 0; for (const f of fams) { e += hr.earned.get(f) || 0; s += hr.size.get(f) || 0; } return s ? e / s : NaN; };
const index = (hr) => [...hr.earned.values()].reduce((a, b) => a + b, 0) / [...hr.size.values()].reduce((a, b) => a + b, 0);
const books = {
  momentum: (hr) => pick(hr, perCar(hr), TOP),
  contrarian: (hr) => pick(hr, (x) => -perCar(hr)(x), TOP),
  size: (hr) => pick(hr, ([, s]) => s, TOP),
};
const out = [];
for (const [name, choose] of Object.entries(books)) {
  let sum = 0, beat = 0, n = 0;
  for (let h = 24; h < hours.length; h++) {
    const fams = choose(hours[h - 1]), got = payout(hours[h], fams), base = index(hours[h]);
    if (!fams.length || !(base > 0) || Number.isNaN(got)) continue;
    sum += got / base; beat += got > base; n++;
  }
  out.push(`${name} ${n ? Math.round(100 * (sum / n - 1)) : "-"}% (beat ${n ? Math.round((100 * beat) / n) : "-"}% of ${n}h)`);
}
console.log(`${map} s${seed}: ${out.join(" | ")}`);
