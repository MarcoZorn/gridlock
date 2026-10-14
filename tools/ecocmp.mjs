import fs from "node:fs";
// Compare economy runs over a window of days: cars, fares a day, crashes per
// car per day, mean trip time, share of crashes between cars, mean genes.
// Most economy tables in the README come from this.
//
//   FROM=2 TO=6 node tools/ecocmp.mjs run-a run-b ...   (runs/<name>/telemetry.jsonl)
const fromDay = +(process.env.FROM || 3), toDay = +(process.env.TO || 1e9);
for (const run of process.argv.slice(2)) {
  const rows = fs.readFileSync(`runs/${run}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
  const perDay = 86400, from = fromDay * perDay;
  const r = rows.filter((x) => x.tick > from && x.tick <= toDay * perDay);
  const sum = (f) => r.reduce((a, x) => a + f(x), 0);
  const days = (r.at(-1).tick - from) / perDay, carDays = sum((x) => x.cars) / r.length * days;
  const t = (k) => (sum((x) => x.traits[k]) / r.length).toFixed(2);
  console.log(run.padEnd(20), `cars ${(sum((x) => x.cars) / r.length).toFixed(0)}  trips/day ${(sum((x) => x.trips) / days).toFixed(0)}  crashes/car/day ${(sum((x) => x.crashes) / carDays).toFixed(1)}  trip ${(sum((x) => x.tripTicks) / Math.max(1, sum((x) => x.trips)) / 60).toFixed(0)}s  car-on-car ${(100 * sum((x) => x.carCrashes) / sum((x) => x.crashes)).toFixed(0)}%  brakes ${t("brakes")} engine ${t("engine")} rays ${t("rays")} length ${t("length")} jam ${t("jam")}`);
}
