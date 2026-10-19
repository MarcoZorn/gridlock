import fs from "node:fs";
// One table for the economic rules tried on Turin, each against the same
// baseline (runs inh-base-s7 and -s11), days two to six: change in fares a
// day, crashes per car a day, trip time and Gini, per seed.
//
//   node tools/policies.mjs
const rules = [
  ["basic income, a quarter", "ubi-0.25"], ["basic income, a half", "ubi-0.5"],
  ["minimum fare 20", "minfare-20"], ["child starts with 26", "inh-rich"], ["child starts with 5", "inh-poor"],
  ["reputation by crashes, 1.5x", "rep-1.5"], ["reputation by damage, 1.5x", "repd-1.5"],
  ["congestion charge, all day", "toll-all"], ["congestion charge, rush hours", "toll-peak"],
  ["first bankruptcy forgiven", "forgive"], ["licence, 1000 units", "lic-1000"],
];
const stats = (run) => {
  const rows = fs.readFileSync(`runs/${run}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter((x) => x.tick > 2 * 86400 && x.tick <= 6 * 86400);
  const sum = (f) => rows.reduce((a, x) => a + f(x), 0), days = 4, cars = sum((x) => x.cars) / rows.length;
  return { fares: sum((x) => x.trips) / days, crashes: sum((x) => x.crashes) / (cars * days), trip: sum((x) => x.tripTicks) / sum((x) => x.trips) / 60, gini: sum((x) => x.gini) / rows.length };
};
const base = { 7: stats("inh-base-s7"), 11: stats("inh-base-s11") };
const pct = (a, b) => `${a >= b ? "+" : ""}${(100 * (a / b - 1)).toFixed(0)}%`;
console.log("| rule | fares a day | crashes per car | trip | Gini |\n|---|---|---|---|---|");
for (const [name, prefix] of rules) {
  const r = [7, 11].map((s) => [stats(`${prefix}-s${s}`), base[s]]);
  const col = (k, f) => r.map(([x, b]) => f(x[k], b[k])).join(", ");
  console.log(`| ${name} | ${col("fares", pct)} | ${col("crashes", pct)} | ${col("trip", pct)} | ${col("gini", (x) => x.toFixed(2))} |`);
}
console.log(`\nbaseline: fares ${[7, 11].map((s) => base[s].fares.toFixed(0)).join(", ")}; crashes ${[7, 11].map((s) => base[s].crashes.toFixed(0)).join(", ")}; trip ${[7, 11].map((s) => base[s].trip.toFixed(0)).join(", ")} s; Gini ${[7, 11].map((s) => base[s].gini.toFixed(2)).join(", ")}`);
