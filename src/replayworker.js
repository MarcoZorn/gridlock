// The replay study in the browser (replay.html), one job per worker:
//   base: run an economy for `days`, snapshot it at the given hours, and name
//         the family that owns the most cars at the end;
//   one:  restore a snapshot with fresh noise, run to `days`, and report how
//         many cars the original winner's family ends with.
// The same method as tools/replay.mjs: a car's family is its founder's, fixed
// at birth; a replay is won when that family ends with over half the cars.
import { EcoWorld, DAY } from "./ecoworld.js";
import { DT } from "./cityworld.js";
import { Population, Rng } from "./neat.js";

const perDay = DAY / DT, perHour = perDay / 24;

function track(w, family) {
  const spawn = w.spawn.bind(w);
  w.spawn = (...a) => { const d = spawn(...a); if (!family.has(d.id)) family.set(d.id, family.get(d.parent) ?? d.id); return d; };
}
function counts(w, family) {
  const c = new Map();
  for (const d of w.cars) { const f = family.get(d.id); c.set(f, (c.get(f) || 0) + 1); }
  return c;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.kind === "base") {
    const founders = Population.fromJSON((await (await fetch(new URL("../docs/trained.json", import.meta.url))).json()).pop);
    const graph = m.map === "grid" ? null : await (await fetch(new URL(`../maps/${m.map}.json`, import.meta.url))).json();
    const w = new EcoWorld({ seed: m.seed, founders, graph }), family = new Map();
    for (const d of w.cars) family.set(d.id, d.id);
    track(w, family);
    const snaps = {}, total = m.days * perDay;
    const run = (until) => { while (w.tick < until) { w.step(); if (w.tick % 3600 === 0) self.postMessage({ progress: w.tick / total }); } };
    for (const h of m.hours) {
      run(h * perHour);
      snaps[h] = { world: JSON.parse(JSON.stringify(w)), family: [...family], days: m.days };
    }
    run(total);
    const c = counts(w, family), [winner, n] = [...c].sort((a, b) => b[1] - a[1])[0];
    const shares = {};
    for (const h of m.hours) {
      const fam = new Map(snaps[h].family), cars = snaps[h].world.cars;
      shares[h] = cars.filter((d) => fam.get(d.id) === winner).length / Math.max(1, cars.length);
      snaps[h].winner = winner;
    }
    self.postMessage({ done: true, snaps, winner, share: n / w.cars.length, shares });
  } else if (m.kind === "one") {
    const s = m.snap, family = new Map(s.family), w = EcoWorld.fromJSON(s.world);
    track(w, family);
    w.rng.s = new Rng(m.seed * 2654435761).s || 1;
    while (w.tick < s.days * perDay) w.step();
    self.postMessage({ done: true, won: counts(w, family).get(s.winner) || 0, cars: w.cars.length });
  }
};
