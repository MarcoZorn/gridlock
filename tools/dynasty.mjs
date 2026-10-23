import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population } from "../src/neat.js";
// Dynasties: how long do rich families stay rich? A family is everyone
// descended from one founder (or immigrant). Each day, every family's fares
// and how many cars it has; the families richest on day 1 are followed after.
// Earnings are not inherited car to car (tools/mobility.mjs), so a family can
// only stay rich by being big.
//
//   DAYS=8 node tools/dynasty.mjs turin 7
// SVG=docs/families.svg also draws each family's share of the cars, an
// eighth of a day at a time, as stacked bands (a Muller plot).
const [map = "turin", seed = 7] = process.argv.slice(2);
const days = +process.env.DAYS || 8, TOP = 5;
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const graph = map === "grid" ? null : JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8"));
const w = new EcoWorld({ seed: +seed, founders, graph });
// a car's family is fixed at birth: its parent's (the parent is alive then),
// or its own if it is a founder or an immigrant
const family = new Map();
const root = (d) => { if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return family.get(d.id); };
for (const d of w.cars) root(d);
const spawn = w.spawn.bind(w);
w.spawn = (...a) => { const d = spawn(...a); root(d); return d; };
const seen = new Map(), paid = new Map();   // car -> last earned seen, earned already counted
const rows = [], shares = [];
for (let day = 0; day < days; day++) {
  const fam = new Map(), cars = new Map();
  for (let t = 0; t < DAY / DT; t++) {
    w.step();
    if (t % (DAY / DT / 8) === 0) { const c = new Map(); for (const d of w.cars) { const f = root(d); c.set(f, (c.get(f) || 0) + 1); } shares.push(c); }
    if (t % 300) continue;
    for (const d of w.cars) { root(d); seen.set(d.id, d.earned); }
  }
  // ponytail: a car's fares after its last sample are lost, at most 300 ticks
  for (const [id, e] of seen) {
    const f = family.get(id), got = e - (paid.get(id) || 0);
    paid.set(id, e);
    if (got > 0) fam.set(f, (fam.get(f) || 0) + got);
  }
  for (const d of w.cars) { const f = root(d); cars.set(f, (cars.get(f) || 0) + 1); }
  seen.clear();
  rows.push({ fam, cars });
}
const rank = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([f]) => f);
const total = (m) => [...m.values()].reduce((s, x) => s + x, 0);
const first = rank(rows[0].fam).slice(0, TOP);
console.log(`${map} s${seed}: day | families earning | top-${TOP} of day 1: still top-${TOP}, share of fares, share of cars, fares per car vs rest`);
rows.forEach(({ fam, cars }, k) => {
  const top = new Set(rank(fam).slice(0, TOP)), F = total(fam), C = total(cars);
  const fe = first.reduce((s, f) => s + (fam.get(f) || 0), 0), fc = first.reduce((s, f) => s + (cars.get(f) || 0), 0);
  const per = fc && C > fc ? (fe / fc) / ((F - fe) / (C - fc)) : NaN;
  console.log(`${k + 1} | ${fam.size} | ${first.filter((f) => top.has(f)).length}, ${(100 * fe / F).toFixed(0)}%, ${(100 * fc / C).toFixed(0)}%, ${per.toFixed(2)}`);
});

if (process.env.SVG) {
  const W = 640, H = 220, pad = 30, fams = new Map();
  for (const c of shares) for (const [f, n] of c) fams.set(f, (fams.get(f) || 0) + n);
  const order = [...fams].sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 8);
  const colors = ["#e4572e", "#17bebb", "#ffc914", "#2e282a", "#76b041", "#8e6c8a", "#3c91e6", "#c4a35a"];
  const x = (i) => pad + (i / (shares.length - 1)) * (W - 2 * pad);
  const layers = order.map(() => []), other = [];
  shares.forEach((c, i) => {
    const total = [...c.values()].reduce((a, b) => a + b, 0) || 1;
    let y0 = 0;
    order.forEach((f, k) => { const y1 = y0 + (c.get(f) || 0) / total; layers[k].push([i, y0, y1]); y0 = y1; });
    other.push([i, y0, 1]);
  });
  const y = (v) => pad + v * (H - 2 * pad);
  const band = (pts, fill) => `<path fill="${fill}" d="M${pts.map(([i, , b]) => `${x(i).toFixed(1)},${y(b).toFixed(1)}`).join("L")}L${pts.slice().reverse().map(([i, a]) => `${x(i).toFixed(1)},${y(a).toFixed(1)}`).join("L")}Z"/>`;
  const labels = Array.from({ length: days + 1 }, (_, d) => `<text x="${x(Math.min(d * 8, shares.length - 1)).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#555">${d}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${band(other, "#ccc")}${layers.map((l, k) => band(l, colors[k])).join("")}${labels}<text x="${pad}" y="18" font-size="12" fill="#333">${map}, seed ${seed}: each founder's family, share of the cars (days)</text></svg>`;
  fs.writeFileSync(process.env.SVG, svg);
}
