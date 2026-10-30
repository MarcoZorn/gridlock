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
    const state = b.tested ? "has an interval" : cmd ? (asked.has(cmd) ? "claim already filed" : "TESTABLE: " + cmd) : "no rule to trial, needs a study of its own";
    console.log(`${b.tested ? "ok " : "-- "} ${b.title.slice(0, 60)} | ${state}`);
  }
  if (process.argv.includes("--open")) {
    const rt = RETEST.find((r) => !asked.has(`SEEDS=20 node tools/trial.mjs ${r.map} ${r.rules}`) && all.some((b) => b.title.startsWith(r.title) && !b.tested));
    const c = rt && claimFor(rt, claims);
    if (!c) console.log("nothing to open (no testable bullet left, or five claims already open)");
    else { fs.appendFileSync("docs/claims.jsonl", JSON.stringify(c) + "\n"); console.log(`opened ${c.id}: ${c.cmd}`); }
  }
}
