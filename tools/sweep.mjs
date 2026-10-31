// Which README numbers does nothing else in the repo back? For every bullet under
// "What it has found", each number written with a % sign or a decimal point
// (plus plain integers of three digits or more) is looked for as the same text in
// docs/NOTEBOOK.md or docs/claims.jsonl, as a whole number (not inside a longer one).
// Numbers found nowhere are listed per bullet: not wrong, but not traceable to a result
// written down, so check them or fix them. A number found COMMON or more times (default 25)
// proves little (3.5 turns up everywhere) and is listed as weak.
//
//   node tools/sweep.mjs
import fs from "node:fs";
import { bullets } from "./reap.mjs";

export function numbers(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?%?/g)) {
    const t = m[0];
    if (/^C\d/.test(t) || /^(19|20)\d\d$/.test(t)) continue;
    if (t.endsWith("%") || t.includes(".") || /^\d{3,}$/.test(t)) out.add(t.replace(/^-/, ""));
  }
  return [...out];
}

export const count = (n, evidence) => {
  const bare = n.replace(/%$/, "").replace(/[.]/g, "\\.");
  return [...evidence.matchAll(new RegExp(`(?<![\\d.])${bare}(?![\\d]|\\.\\d)`, "g"))].length;
};

// Stricter: the numbers of a bullet against the result texts of the claims it cites ("C23"),
// not against the whole notebook. A number a cited claim's result does not contain is listed
// as uncited: cite the claim it comes from, or the bullet is quoting something nobody closed.
export function uncited(readme, claims) {
  const sec = readme.slice(readme.indexOf("## What it has found"), readme.indexOf("## How sure"));
  const rows = [];
  for (const m of sec.matchAll(/^- \*\*(.+?)\*\*([\s\S]*?)(?=^- \*\*|^\*\*|^## |(?![\s\S]))/gm)) {
    const text = m[1] + m[2], ids = [...new Set(text.match(/\bC\d+\b/g) || [])];
    const ev = ids.map((id) => { const c = claims.find((x) => x.id === id); return `${c?.result || ""} ${c?.pooled || ""}`; }).join(" ");
    const ns = numbers(text);
    rows.push({ title: m[1], ids, total: ns.length, miss: ns.filter((n) => count(n, ev) === 0) });
  }
  return rows;
}

export function unbacked(readme, evidence, common = 25) {
  const sec = readme.slice(readme.indexOf("## What it has found"), readme.indexOf("## How sure"));
  const rows = [];
  for (const m of sec.matchAll(/^- \*\*(.+?)\*\*([\s\S]*?)(?=^- \*\*|^\*\*|^## |(?![\s\S]))/gm)) {
    const ns = numbers(m[1] + m[2]), c = ns.map((n) => [n, count(n, evidence)]);
    rows.push({ title: m[1], total: ns.length, miss: c.filter(([, k]) => k === 0).map(([n]) => n), weak: c.filter(([, k]) => k >= common).map(([n]) => n) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence = fs.readFileSync("docs/NOTEBOOK.md", "utf8") + fs.readFileSync("docs/claims.jsonl", "utf8");
  const rows = unbacked(fs.readFileSync("README.md", "utf8"), evidence);
  for (const r of rows) console.log(`${r.miss.length ? "-- " : "ok "} ${r.title.slice(0, 58).padEnd(58)} ${r.total - r.miss.length}/${r.total} numbers found${r.miss.length ? "; not found: " + r.miss.join(" ") : ""}${r.weak.length ? "; too common to prove anything: " + r.weak.join(" ") : ""}`);
  console.log(`${rows.filter((r) => r.miss.length).length} of ${rows.length} bullets have numbers found nowhere else`);
  const claims = fs.readFileSync("docs/claims.jsonl", "utf8").trim().split("\n").map(JSON.parse);
  console.log("against the results of the claims each bullet cites:");
  for (const r of uncited(fs.readFileSync("README.md", "utf8"), claims)) console.log(`${r.miss.length ? "-- " : "ok "} ${r.title.slice(0, 58).padEnd(58)} cites ${r.ids.join(" ") || "nothing"}; ${r.total - r.miss.length}/${r.total} numbers in their results${r.miss.length ? "; not there: " + r.miss.join(" ") : ""}`);
}
