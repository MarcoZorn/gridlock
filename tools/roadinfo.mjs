// What a road is: length, lanes, one-way, and the roads that meet at each end.
//
//   node tools/roadinfo.mjs maps/barcelona.json 482>483 474>475
import fs from "node:fs";

export function info(g, a, b) {
  const e = g.edges.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
  if (!e) return null;
  const [na, nb] = [g.nodes[e[0]], g.nodes[e[1]]], at = (n) => g.edges.filter((x) => x[0] === n || x[1] === n);
  const end = (n) => at(n).map((x) => ({ with: x[0] === n ? x[1] : x[0], lanes: x[2], oneway: !!x[3], into: x[3] ? (x[1] === n ? "in" : "out") : "both" }));
  return { from: a, to: b, length: Math.round(Math.hypot(nb[0] - na[0], nb[1] - na[1])), lanes: e[2], oneway: !!e[3], direction: e[3] ? (e[0] === a ? "with the arrow" : "against the arrow") : "both", atFrom: end(a), atTo: end(b), signal: (g.signals || []).includes(a) || (g.signals || []).includes(b) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const lens = g.edges.map((e) => Math.hypot(g.nodes[e[1]][0] - g.nodes[e[0]][0], g.nodes[e[1]][1] - g.nodes[e[0]][1])).sort((x, y) => x - y);
  console.log(`${process.argv[2]}: ${g.edges.length} roads, median length ${Math.round(lens[lens.length >> 1])}, ${g.edges.filter((e) => e[3]).length} one-way`);
  for (const r of process.argv.slice(3)) {
    const [a, b] = r.split(">").map(Number), i = info(g, a, b);
    if (!i) { console.log(`${r}: no such road`); continue; }
    const d = (xs) => xs.map((x) => `${x.with}${x.oneway ? (x.into === "in" ? "→" : "←") : "="}`).join(" ");
    console.log(`${r}: length ${i.length}, ${i.lanes} lane(s), ${i.oneway ? "one-way, driven " + i.direction : "two-way"}; meets at ${a}: ${d(i.atFrom)}; at ${b}: ${d(i.atTo)}${i.signal ? "; signal" : ""}`);
  }
}
