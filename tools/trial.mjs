import fs from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
// A proper trial: one economy rule against no rule, on many seeds at once,
// each seed paired with itself so the city and the founders are the same.
// Reports, per measure, the mean paired change with a 95% bootstrap
// confidence interval and how many seeds moved each way. Runs are cached
// in runs/trial-*, so adding seeds later only runs the new ones.
//
//   SEEDS=20 DAYS=6 node tools/trial.mjs turin basic=0.25     (SEED0=301: seeds from 301, default 101)
//   node tools/trial.mjs turin congestion=0.1,peakToll=1
//   BODY=wallDamage=0 node tools/trial.mjs turin   (a BODY constant the economy reads, treatment arm only;
//   evolved bodies carry their own sight, so BODY=rayRange=.. changes nothing)
// A map can be a name from maps/ or a path. ALT=other-map.json compares two
// maps instead of a rule (the rule, if any, then applies to ALT's arm):
//   ALT=tmp/barcelona-twoway.json node tools/trial.mjs barcelona
const [map = "turin", econ = ""] = process.argv.slice(2), alt = process.env.ALT || null;
const tag = (m) => m.replace(/^.*\//, "").replace(/\.json$/, "");   // a path's run-name part
const n = +(process.env.SEEDS || 20), days = +(process.env.DAYS || 6), from = +(process.env.FROM || 2);
const s0 = +(process.env.SEED0 || 101), seeds = Array.from({ length: n }, (_, i) => s0 + i);   // fresh seeds, apart from the hand-picked ones used so far
// a run per arm and seed: (map, no rule) and (ALT or map, the rule)
// FOUNDERS=hand: the hand-written driver of src/hand.js in both arms (nothing evolves)
const fnd = process.env.FOUNDERS || "docs/trained.json", pre = fnd === "docs/trained.json" ? "trial" : `trial-${tag(fnd)}`;
// BODY=rayRange=60: body constants for the treatment arm only (headless.mjs --body), alone or with a rule
const body = process.env.BODY || "";
const name = (rule, s, m = map, b = "") => `runs/${pre}-${tag(m)}-${rule ? rule.replace(/[=,]/g, "_") : "base"}${b ? "-body_" + b.replace(/[=,]/g, "_") : ""}-d${days}-s${s}`;
const done = (dir) => { try { return fs.readFileSync(`${dir}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).at(-1).tick >= days * 86400; } catch { return false; } };

async function runAll(jobs) {
  let next = 0;
  const lanes = Math.max(1, Math.min(jobs.length, os.cpus().length - 2));
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (next < jobs.length) {
      const [dir, s, rule, m, b] = jobs[next++];
      fs.rmSync(dir, { recursive: true, force: true });
      const args = ["headless.mjs", "--eco", "--run", dir, "--days", String(days), "--founders", fnd, "--seed", String(s), "--threads", "1"];
      if (m !== "grid") args.push("--map", m);
      if (rule) args.push("--econ", rule);
      if (b) args.push("--body", b);
      await new Promise((ok) => spawn("node", args, { stdio: "ignore" }).on("exit", ok));
    }
  }));
}

const stats = (dir) => {
  const rows = fs.readFileSync(`${dir}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter((x) => x.tick > from * 86400 && x.tick <= days * 86400);
  const sum = (f) => rows.reduce((a, x) => a + f(x), 0), d = days - from, cars = sum((x) => x.cars) / rows.length;
  return {
    "fares a day": sum((x) => x.trips) / d,
    "crashes per car a day": sum((x) => x.crashes) / (cars * d),
    "trip time": sum((x) => x.tripTicks) / Math.max(1, sum((x) => x.trips)) / 60,
    cars,
    Gini: sum((x) => x.gini) / rows.length,
  };
};

// 95% interval of the mean, by resampling the seeds (deterministic stream)
function bootstrap(xs, reps = 4000) {
  let r = 12345;
  const rnd = () => ((r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const means = [];
  for (let k = 0; k < reps; k++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)]; means.push(s / xs.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)], means[Math.floor(0.975 * reps)]];
}

const jobs = [];
// FREEZE=1: no mutation after day FROM, in both arms, so only the rule acts on the founders' genes
const fz = process.env.FREEZE ? `freezeAt=${from * 86400}` : "";
const join = (r) => [r, fz].filter(Boolean).join(",");
const arms = [[join(""), map, ""], [join(econ), alt || map, body]];
if (!alt && !econ && !body) { console.error("give a rule, BODY=constants or ALT=map"); process.exit(1); }
for (const s of seeds) for (const [rule, m, b] of arms) { const dir = name(rule, s, m, b); if (!done(dir)) jobs.push([dir, s, rule, m, b]); }
if (jobs.length) console.error(`running ${jobs.length} economies (${map}, ${days} days)...`);
await runAll(jobs);

const pairs = seeds.map((s) => [stats(name(join(""), s, map)), stats(name(join(econ), s, alt || map, body))]);
console.log(`${alt ? `${tag(alt)}${econ ? " + " + econ : ""}${body ? " + body " + body : ""} vs ${tag(map)}` : `${map}, ${[econ, body && "body " + body].filter(Boolean).join(" + ")} vs no rule`}, ${n} seeds, days ${from}-${days}: mean change, 95% interval, seeds up/down`);
for (const k of Object.keys(pairs[0][0])) {
  const ch = pairs.map(([b, x]) => (k === "Gini" ? x[k] - b[k] : x[k] / b[k] - 1));
  const m = ch.reduce((a, x) => a + x, 0) / ch.length, [lo, hi] = bootstrap(ch);
  const f = (v) => (k === "Gini" ? `${v >= 0 ? "+" : ""}${v.toFixed(3)}` : `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}%`);
  const sure = lo > 0 || hi < 0 ? "" : "  (not distinguishable from zero)";
  console.log(`  ${k.padEnd(22)} ${f(m).padStart(8)}  [${f(lo)}, ${f(hi)}]  ${ch.filter((x) => x > 0).length} up / ${ch.filter((x) => x < 0).length} down${sure}`);
}
