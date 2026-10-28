import fs from "node:fs";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
import { Population, Rng } from "../src/neat.js";
// Tipping that evolves on the passenger side. Every passenger carries a tip,
// a share of the fare paid on top, and the city's passengers are a pool of
// POOL such genes. A car picking up looks at up to five of those waiting
// (as many as wait): when drivers see tips it takes the best tipper, when
// they are blind the first in line. A ride is worth twice its fare to the
// passenger, so it gains 1 - tip fares; every GEN hours the pool is redrawn
// from the passengers served, in proportion to that gain, each gene nudged
// by up to 0.05. Selection for being picked against the cost of the tip.
// Each day: mean tip in the pool, fares, money earned, cars.
//
//   node tools/tips.mjs turin 7     (ARMS=seen for one arm)
const [map = "turin", seed = 7] = process.argv.slice(2);
const days = +(process.env.DAYS || 6), gen = +(process.env.GEN || 2), size = +(process.env.POOL || 1000), start = +(process.env.TIP || 0.15);
const founders = Population.fromJSON(JSON.parse(fs.readFileSync("docs/trained.json", "utf8")).pop);
const hour = DAY / DT / 24;
for (const arm of (process.env.ARMS || "blind,seen").split(",")) {
  const w = new EcoWorld({ seed: +seed, founders, graph: JSON.parse(fs.readFileSync(`maps/${map}.json`, "utf8")) });
  const rng = new Rng(+seed + 99);
  let pool = new Array(size).fill(start), served = [];
  const newJob = w.newJob.bind(w), pay = w.pay.bind(w);
  w.newJob = (d, first) => {
    const q = w.passengers + 1;   // before this pickup took one
    newJob(d, first);
    if (d.job.kind !== "passenger") return;
    const look = Array.from({ length: Math.max(1, Math.min(5, Math.floor(q))) }, () => pool[rng.int(size)]);
    d.job.tip = arm === "seen" ? Math.max(...look) : look[0];
  };
  w.pay = (d) => {
    const j = d.job, before = d.cash;
    pay(d);
    if (j && j.tip !== undefined) {
      const extra = (d.cash - before) * j.tip;
      d.cash += extra; w.events.earned += extra;
      served.push(j.tip);
    }
  };
  const rows = [];
  for (let day = 1; day <= days; day++) {
    let trips = 0, earned = 0;
    for (let t = 0; t < 24 * hour; t++) {
      const f = w.events.trips, e = w.events.earned;
      w.step();
      trips += w.events.trips >= f ? w.events.trips - f : w.events.trips;
      earned += w.events.earned >= e ? w.events.earned - e : w.events.earned;
      if ((t + 1) % Math.round(gen * hour) === 0 && served.length) {
        // roulette over the served, by what the ride left them
        const wts = served.map((x) => 1 - x), tot = wts.reduce((a, b) => a + b, 0);
        pool = pool.map(() => {
          let r = rng.next() * tot, i = 0;
          while (i < served.length - 1 && (r -= wts[i]) > 0) i++;
          return Math.max(0, Math.min(1, served[i] + rng.range(-0.05, 0.05)));
        });
        served = [];
      }
    }
    const mean = pool.reduce((a, b) => a + b, 0) / size;
    rows.push(`d${day} tip ${Math.round(100 * mean)}% ${trips} $${Math.round(earned)} ${w.cars.length}c`);
  }
  console.log(`${map} s${seed} ${arm.padEnd(5)}: ${rows.join(" | ")}`);
}
