import fs from "node:fs";
// The simulator explains itself: a plain-language account of one economy
// run, written from its telemetry alone. Every number in it is computed
// here, from day one against the last day.
//
//   node tools/explain.mjs inh-base-s7
const run = process.argv[2];
const rows = fs.readFileSync(`runs/${run}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
const DAY = 86400, days = Math.floor(rows.at(-1).tick / DAY);
const day = (d) => rows.filter((x) => x.tick > d * DAY && x.tick <= (d + 1) * DAY);
const sum = (r, k) => r.reduce((a, x) => a + (x[k] || 0), 0), mean = (r, f) => r.reduce((a, x) => a + f(x), 0) / r.length;
const first = day(1), last = day(days - 1);
const say = [];
const n = (x) => Math.round(x).toLocaleString("en");
const pct = (a, b) => `${a > b ? "up" : "down"} ${Math.abs(Math.round(100 * (a / b - 1)))}%`;
const cars = (r) => mean(r, (x) => x.cars), fares = (r) => sum(r, "trips"), crash = (r) => sum(r, "crashes") / cars(r);
say.push(`Over ${days} days the city went from ${n(cars(first))} cars carrying ${n(fares(first))} fares on day two to ${n(cars(last))} carrying ${n(fares(last))} on the last day (${pct(fares(last), fares(first))}).`);
say.push(`Each car crashed ${n(crash(first))} times a day at first and ${n(crash(last))} by the end (${pct(crash(last), crash(first))}); ${Math.round(100 * sum(last, "carCrashes") / sum(last, "crashes"))}% of the last day's crashes were with another car.`);
const trip = (r) => sum(r, "tripTicks") / sum(r, "trips") / 60;
say.push(`A trip took ${trip(first).toFixed(0)} s on day two and ${trip(last).toFixed(0)} s on the last.`);
const born = sum(last, "births"), died = sum(last, "deaths"), imm = sum(last, "immigrants");
say.push(`On the last day ${n(born)} cars were born and ${n(died)} went broke${imm ? `, and ${n(imm)} immigrants arrived` : ", with no immigrants needed"}; the deepest family line reached generation ${Math.max(...last.map((x) => x.maxGen))}.`);
const g0 = mean(first, (x) => x.gini), g1 = mean(last, (x) => x.gini);
say.push(`Wealth was ${g1 > 0.4 ? "very unequal" : g1 > 0.3 ? "moderately unequal" : "fairly even"}, a Gini of ${g1.toFixed(2)} (${g0.toFixed(2)} on day two).`);
const traits = Object.keys(last[0].traits), moved = traits.map((k) => [k, mean(last, (x) => x.traits[k]) - mean(first, (x) => x.traits[k])]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
const words = { length: "longer", width: "wider", engine: "more engine", brakes: "stronger brakes", range: "longer sight", rays: "more rays", cargo: "more cargo room", jam: "more attention to traffic when routing" };
const less = { length: "shorter", width: "narrower", engine: "less engine", brakes: "weaker brakes", range: "shorter sight", rays: "fewer rays", cargo: "less cargo room", jam: "less attention to traffic when routing" };
const big = moved.filter(([, d]) => Math.abs(d) > 0.05).slice(0, 3).map(([k, d]) => `${d > 0 ? words[k] : less[k]} (${d > 0 ? "+" : ""}${d.toFixed(2)})`);
say.push(big.length ? `Evolution changed the cars' bodies most towards ${big.join(", ")}, on a 0-1 scale.` : "The cars' bodies barely changed (no trait moved more than 0.05 on a 0-1 scale).");
const right = sum(last, "sideRight") / Math.max(1, sum(last, "sideAll"));
if (sum(last, "sideAll")) say.push(`Moving cars kept to the ${right >= 0.5 ? "right" : "left"} ${Math.round(100 * Math.max(right, 1 - right))}% of the time on the last day${Math.abs(right - 0.5) < 0.1 ? ", no real convention" : ""}.`);
const sp = last.at(-1).species.length;
say.push(`${sp} species were alive at the end.`);
console.log(`${run}:\n${say.join(" ")}`);
