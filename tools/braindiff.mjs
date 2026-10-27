import fs from "node:fs";
// Brain diff: what changed between a parent and its child, both still on the
// road in a saved economy. Connections are matched by innovation number, as
// crossover matches them: genes the child gained, lost or switched on or off,
// how far the shared weights moved, nodes added, and the body genes.
// With a car id, that car against its parent in detail; without, a summary
// over every living parent-child pair.
//
//   node tools/braindiff.mjs runs/inh-base-s7/state.json [child id]
const [state, which] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(state, "utf8"));
const byId = new Map(j.cars.map((c) => [c.id, c]));
const conns = (b) => new Map(b.c.map(([innov, a, z, w, on]) => [innov, { a, z, w, on }]));
function diff(child, parent) {
  const C = conns(child.brain), P = conns(parent.brain), r = { gained: [], lost: [], toggled: [], moved: [] };
  for (const [k, c] of C) {
    const p = P.get(k);
    if (!p) r.gained.push([k, c]);
    else {
      if (!!p.on !== !!c.on) r.toggled.push([k, c]);
      if (c.w !== p.w) r.moved.push([k, c.w - p.w, c]);
    }
  }
  for (const [k, p] of P) if (!C.has(k)) r.lost.push([k, p]);
  const pn = new Set(parent.brain.n.map((n) => n[0]));
  r.nodes = child.brain.n.filter((n) => !pn.has(n[0])).length;
  r.body = Object.keys(child.body).filter((g) => child.body[g] !== parent.body[g]).map((g) => [g, child.body[g] - parent.body[g]]);
  return r;
}
const pairs = j.cars.filter((c) => byId.has(c.parent)).map((c) => [c, byId.get(c.parent)]);
if (which) {
  const c = byId.get(+which), p = c && byId.get(c.parent);
  if (!p) { console.error(`car ${which} has no living parent`); process.exit(1); }
  const r = diff(c, p), g = (x) => `${x.a}->${x.z}`;
  console.log(`car ${c.id} (generation ${c.generation}) against its parent ${p.id}: ${r.nodes} nodes added`);
  console.log(`  gained ${r.gained.map(([k, x]) => `#${k} ${g(x)} ${x.w.toFixed(2)}`).join(", ") || "none"}`);
  console.log(`  lost ${r.lost.map(([k, x]) => `#${k} ${g(x)}`).join(", ") || "none"}`);
  console.log(`  switched ${r.toggled.map(([k, x]) => `#${k} ${g(x)} ${x.on ? "on" : "off"}`).join(", ") || "none"}`);
  const big = r.moved.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);
  console.log(`  ${r.moved.length} weights moved, the largest ${big.map(([k, d, x]) => `#${k} ${g(x)} ${d > 0 ? "+" : ""}${d.toFixed(2)}`).join(", ") || "none"}`);
  console.log(`  body ${r.body.map(([k, d]) => `${k} ${d > 0 ? "+" : ""}${d.toFixed(3)}`).join(", ") || "unchanged"}`);
} else {
  const rs = pairs.map(([c, p]) => diff(c, p)), m = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(2);
  const shared = (r) => r.moved.length ? r.moved.reduce((a, x) => a + Math.abs(x[1]), 0) / r.moved.length : 0;
  console.log(`${pairs.length} living parent-child pairs, per child on average: ${m((r) => r.gained.length)} connections gained, ${m((r) => r.lost.length)} lost, ${m((r) => r.toggled.length)} switched, ${m((r) => r.nodes)} nodes added, ${m((r) => r.moved.length)} weights moved by ${m(shared)} on average, ${m((r) => r.body.length)} body genes changed`);
  console.log(`identical brains: ${rs.filter((r) => !r.gained.length && !r.lost.length && !r.toggled.length && !r.moved.length).length} of ${rs.length}`);
}
