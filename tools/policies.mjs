import fs from "node:fs";
// One table for the economic rules tried on Turin, each against the same
// baseline (runs inh-base-s3, -s5, -s7, -s11), days two to six: the mean
// change, seed by seed, in fares a day, crashes per car a day and trip time,
// with how many of the four seeds moved that way; and the mean Gini.
//
//   node tools/policies.mjs
const rules = [
  ["basic income, a quarter", "ubi-0.25"], ["basic income, a half", "ubi-0.5"],
  ["minimum fare 20", "minfare-20"], ["child starts with 26", "inh-rich"], ["child starts with 5", "inh-poor"],
  ["reputation by crashes, 1.5x", "rep-1.5"], ["reputation by damage, 1.5x", "repd-1.5"],
  ["congestion charge, all day", "toll-all"], ["congestion charge, rush hours", "toll-peak"], ["a fifth of passengers emergencies", "emerg"], ["fare market, price-shy passengers (k=1)", "market-1"], ["fare market, very price-shy (k=4)", "market-4"], ["mates chosen by earnings", "choosy"], ["lights at every junction", "tlights-all"], ["lights at the real signals only", "tlights-real"], ["lights at the real signals, drivers raised under lights", "tlights-realL"], ["genes swapped in a fifth of car crashes", "hgt-0.2"], ["genes swapped in every car crash", "hgt-1"], ["surge pricing, x1", "surge-1"], ["surge pricing, x3", "surge-3"],
  ["first bankruptcy forgiven", "forgive"], ["credit of 10", "credit-10"], ["credit of 30", "credit-30"], ["credit of 30, 10% an hour", "int-0.1"], ["credit of 30, doubling hourly", "int-1"], ["licence, 1000 units", "lic-1000"],
  ["insurance, flat", "ins-flat"], ["insurance, rated by own claims", "ins-rated"],
  ["crashes charged at a fixed mass", "crashmass"], ["crashes free", "nocrash"], ["owners, a quarter from each child", "owner-0.25"], ["owners, half from each child", "owner-0.5"], ["species by body alone", "spbody"], ["species by brain alone", "spbrain"], ["money printed, as much as basic income pays", "print"], ["basic income voted, from none", "vote"], ["basic income voted, from a quarter", "vote25"], ["reviews, fares by clean rides", "reviews"], ["fuel price follows the fleet", "fuelmkt"], ["insurance paying a tenth again, flat", "fraud10-flat"], ["insurance paying half again, flat", "fraud-flat"], ["insurance paying half again, rated", "fraud-rated"],
];
const stats = (run) => {
  const rows = fs.readFileSync(`runs/${run}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter((x) => x.tick > 2 * 86400 && x.tick <= 6 * 86400);
  const sum = (f) => rows.reduce((a, x) => a + f(x), 0), days = 4, cars = sum((x) => x.cars) / rows.length;
  return { fares: sum((x) => x.trips) / days, crashes: sum((x) => x.crashes) / (cars * days), trip: sum((x) => x.tripTicks) / sum((x) => x.trips) / 60, gini: sum((x) => x.gini) / rows.length };
};
const SEEDS = [3, 5, 7, 11];
const base = Object.fromEntries(SEEDS.map((s) => [s, stats(`inh-base-s${s}`)]));
const change = (r, k) => {
  const d = r.map(([x, b]) => x[k] / b[k] - 1), m = d.reduce((a, x) => a + x, 0) / d.length;
  const same = d.filter((x) => Math.sign(x) === Math.sign(m)).length;
  return `${m >= 0 ? "+" : ""}${(100 * m).toFixed(0)}% (${same}/${d.length})`;
};
console.log("| rule | fares a day | crashes per car | trip | Gini |\n|---|---|---|---|---|");
for (const [name, prefix] of rules) {
  const r = SEEDS.map((s) => [stats(`${prefix}-s${s}`), base[s]]);
  console.log(`| ${name} | ${change(r, "fares")} | ${change(r, "crashes")} | ${change(r, "trip")} | ${(r.reduce((a, [x]) => a + x.gini, 0) / r.length).toFixed(2)} |`);
}
const mean = (k) => SEEDS.reduce((a, s) => a + base[s][k], 0) / SEEDS.length;
console.log(`| no rule | ${mean("fares").toFixed(0)} | ${mean("crashes").toFixed(0)} | ${mean("trip").toFixed(0)} s | ${mean("gini").toFixed(2)} |`);
