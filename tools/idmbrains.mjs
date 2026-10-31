// One brain at a time: tools/idm.mjs with ONE=n SMOOTH=15 for each brain n of the shipped
// population, the share of its acceleration that the Intelligent Driver Model, a straight line
// through car and road features, and nearest neighbours explain. Prints each brain and the
// best and median over the brains.
//
//   FIRST=2 COUNT=20 node tools/idmbrains.mjs
import { execFileSync } from "node:child_process";

export function parse(text) {
  const idm = text.match(/explains (-?\d+)% of the variance/), line = text.match(/both (-?\d+)%/), nn = text.match(/nearest neighbours on all seven explain (-?\d+)%/);
  return idm && line && nn ? { idm: +idm[1], line: +line[1], nn: +nn[1] } : null;
}
export const summary = (rows) => {
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const out = {};
  for (const k of ["idm", "line", "nn"]) out[k] = { best: Math.max(...rows.map((r) => r[k])), median: med(rows.map((r) => r[k])) };
  return out;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const first = +(process.env.FIRST || 1), count = +(process.env.COUNT || 20), rows = [];
  for (let n = first; n < first + count; n++) {
    const r = parse(execFileSync("node", ["tools/idm.mjs"], { env: { ...process.env, ONE: String(n), SMOOTH: "15" }, encoding: "utf8" }));
    if (r) { rows.push({ brain: n, ...r }); console.log(`brain ${n}: IDM ${r.idm}%, straight line (car and road) ${r.line}%, nearest neighbours ${r.nn}%`); }
  }
  const s = summary(rows);
  console.log(`${rows.length} brains (${first} to ${first + count - 1}): nearest neighbours best ${s.nn.best}%, median ${s.nn.median}%; straight line best ${s.line.best}%, median ${s.line.median}%; IDM best ${s.idm.best}%, median ${s.idm.median}%`);
}
