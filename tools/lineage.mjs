import fs from "node:fs";
// A lineage explorer: any car's ancestors, back to its founder, from a saved
// economy (the ancestry kept is exactly the lines of the cars still alive).
// For each: when it was born, how long it lived, how many children it had
// and its species, and where the species changed along the line. With no id,
// the car of the highest generation.
//
//   node tools/lineage.mjs runs/inh-base-s7/state.json [car id]
const [state, which] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(state, "utf8"));
const anc = new Map(j.ancestry), tick = j.tick, HOUR = 3600;
const car = which ? j.cars.find((c) => c.id === +which) : j.cars.reduce((a, b) => (b.generation > a.generation ? b : a));
if (!car) { console.error(`no living car ${which}`); process.exit(1); }
const line = [];
for (let id = car.id; anc.has(id); id = anc.get(id).parent) line.push([id, anc.get(id)]);
const when = (t) => `day ${Math.floor(t / (24 * HOUR)) + 1} ${String(Math.floor((t % (24 * HOUR)) / HOUR)).padStart(2, "0")}h`;
console.log(`car ${car.id}, generation ${car.generation}: ${line.length - 1} ancestors back to founder ${line.at(-1)[0]}`);
let last = null;
for (const [id, a] of line.reverse()) {
  const lived = (a.died >= 0 ? a.died : tick) - a.born;
  const sp = a.species !== last && last !== null ? `  <- species ${last} to ${a.species}` : "";
  console.log(`  gen ${String(a.generation).padStart(2)}  car ${String(id).padStart(5)}  born ${when(a.born)}  lived ${(lived / HOUR).toFixed(1)} h${a.died < 0 ? " (alive)" : ""}  children ${a.children}  species ${a.species}${sp}`);
  last = a.species;
}
const dead = line.filter(([, a]) => a.died >= 0);
const m = (f) => (dead.reduce((s, x) => s + f(x[1]), 0) / Math.max(1, dead.length)).toFixed(1);
console.log(`ancestors: lived ${m((a) => (a.died - a.born) / HOUR)} h and had ${m((a) => a.children)} children on average`);
