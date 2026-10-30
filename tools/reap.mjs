// Study 3, the reaper: which of the README's headline bullets still rest on
// a handful of seeds? Lists every bullet under "What it has found", marks the
// ones that already carry an interval (a bracketed range, "interval", "twenty
// seeds", "replays"), and for the rest shows the command that would re-test
// it. `--open` writes the oldest testable one into docs/claims.jsonl as an
// open claim, if fewer than five are open. The prediction in RETEST is the
// one thing a machine cannot invent: it is written here, by hand, before any
// run.
//
//   node tools/reap.mjs          list
//   node tools/reap.mjs --open   open the oldest testable bullet as a claim
import fs from "node:fs";
import { ECON } from "../src/ecoworld.js";

// bullet title (start of its bold text) -> how to re-test it; oldest first
export const RETEST = [
  { title: "Rules about failure matter more", rules: "finishFare=1,insurance=1", map: "turin",
    statement: "Letting a broke taxi finish its ride and pooling crash costs raises fares a day well above no rule, at twenty seeds.",
    predicted: "fares a day up by +40% to +150% with a 95% interval entirely above zero (the README's 4768 against 2476 is one seed, +93%)." },
];

// the bullets `trial.mjs` cannot run: which tool re-tests each, on how many seeds, and what would count as
// a hit. `tool` is a file in tools/ that exists, or "new" for one still to be written. Not claims yet:
// a plan becomes a claim when its tool can print an interval and its prediction is written down.
export const PLANS = [
  { title: "Drivers generalise", tool: "tools/crashes.mjs", plan: "the shipped drivers in each real map and in twelve generated cities, twenty seeds each, an interval on crashes per 1000 units; a hit is every real city below the generated one with intervals that do not overlap" },
  { title: "They queue but do not yield", tool: "tools/yieldrule.mjs", plan: "its none, rule and wide arms at twenty seeds with intervals on junction crashes and fares; a hit is no right of way in the unmodified drivers and a coded rule that does not pay" },
  { title: "They are reflex machines", tool: "tools/idm.mjs", plan: "the explained-acceleration figure per brain over twenty brains with an interval; the reaction-delay claim is tools/drunk.mjs with DELAY=, which needs a loop over twenty seeds and an interval; a hit is crashes at 0.2 s above no delay with the interval above zero" },
  { title: "In fog they speed up", tool: "tools/drunk.mjs", plan: "its FOG=0.5 against FOG=1 over twenty seeds, mean speed (distance per tick) with an interval; the raised-in-fog half needs a run evolved under fog, a new tool" },
  { title: "A side of the road", tool: "tools/sidechart.mjs", plan: "twenty fresh seeds of one city, the share keeping to one side after four days with a Wilson interval on the number of seeds above three in four, and a binomial check that the side is a coin flip" },
  { title: "One family takes the city", tool: "tools/dynasty.mjs", plan: "twenty fresh seeds for six days, the number of runs where one founder's family owns every car, with a Wilson interval; a hit is three in four or better" },
  { title: "The cheapest car wins", tool: "tools/ecocmp.mjs", plan: "mean traits (length, cargo) at day six over twenty seeds, with and without freight pay, an interval on each; a hit is length below the stock body in nearly every seed unless freight pays" },
  { title: "Drivers spread across competing platforms", tool: "tools/platforms.mjs", plan: "twenty seeds, the share of drivers on each platform against the share of passengers booking through it, the slope with an interval; a hit is a slope of one" },
  { title: "Real one-way cities are fragile", tool: "tools/percolation.mjs", plan: "twenty random closure orders per city, the share of junctions still reachable at 5% closed with an interval, for Turin, Barcelona, Manhattan and a grid; a hit is half or less in the three cities and 99% in the grid" },
  { title: "No Braess paradox", tool: "tools/wardrop.mjs", plan: "no seeds: the closure scan is exhaustive, so rerun it on the three cities and record the largest saving; a hit is none above 0.07%" },
  { title: "A flaw in NEAT's species control", tool: "new", plan: "evolve from scratch with a threshold step of 0.3 and of 0.02, twenty seeds each, mean fitness at generation 60 with a bootstrap interval; a hit is 0.02 above 0.3 with the interval clear of zero" },
];

export const bullets = (readme) => {
  const sec = readme.slice(readme.indexOf("## What it has found"), readme.indexOf("## How sure"));
  const out = [];
  for (const m of sec.matchAll(/^- \*\*(.+?)\*\*([\s\S]*?)(?=^- \*\*|^\*\*|^## |(?![\s\S]))/gm)) {
    const text = m[2];
    out.push({ title: m[1], tested: /\[[-+]?\d|interval|twenty seeds|replays/i.test(text) });
  }
  return out;
};

export const claimFor = (rt, claims) => {
  const open = claims.filter((c) => c.status === "open").length;
  if (open >= 5) return null;
  const n = Math.max(...claims.map((c) => +c.id.slice(1))) + 1;
  return { id: `C${n}`, statement: rt.statement, cmd: `SEEDS=20 node tools/trial.mjs ${rt.map} ${rt.rules}`, predicted: rt.predicted, status: "open", opened: new Date().toISOString().slice(0, 10), source: "README, What it has found, via tools/reap.mjs; written before the run" };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = bullets(fs.readFileSync("README.md", "utf8"));
  const claims = fs.readFileSync("docs/claims.jsonl", "utf8").trim().split("\n").map(JSON.parse);
  const asked = new Set(claims.map((c) => c.cmd));
  for (const b of all) {
    const rt = RETEST.find((r) => b.title.startsWith(r.title));
    const cmd = rt && `SEEDS=20 node tools/trial.mjs ${rt.map} ${rt.rules}`;
    const state = b.tested ? "has an interval" : cmd ? (asked.has(cmd) ? "claim already filed" : "TESTABLE: " + cmd) : "no rule to trial; plan: " + (PLANS.find((x) => b.title.startsWith(x.title))?.plan ?? "NONE, write one in PLANS");
    console.log(`${b.tested ? "ok " : "-- "} ${b.title.slice(0, 60)} | ${state}`);
  }
  if (process.argv.includes("--open")) {
    const rt = RETEST.find((r) => !asked.has(`SEEDS=20 node tools/trial.mjs ${r.map} ${r.rules}`) && all.some((b) => b.title.startsWith(r.title) && !b.tested));
    const c = rt && claimFor(rt, claims);
    if (!c) console.log("nothing to open (no testable bullet left, or five claims already open)");
    else { fs.appendFileSync("docs/claims.jsonl", JSON.stringify(c) + "\n"); console.log(`opened ${c.id}: ${c.cmd}`); }
  }
}
