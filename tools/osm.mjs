// Turn an OpenStreetMap extract (Overpass JSON, ways with their nodes) into
// a gridlock road graph.
//
//   node tools/osm.mjs extract.json maps/name.json "Place name"
//
// Every way node becomes a junction, so bends are kept as gentle junctions
// rather than straightened out; nodes closer together than MERGE units are
// welded into one, and only the largest connected piece of the network is
// kept. One-way streets stay one-way (`[a, b, lanes, 1]` runs from a to b
// only), and the piece kept is the largest one where every junction can
// still be reached from every other, obeying the arrows.
//
// Map data © OpenStreetMap contributors, ODbL.

import fs from "node:fs";
import { osmToGraph } from "../src/osm.js";

const [src, dst, name = "OpenStreetMap extract"] = process.argv.slice(2);
if (!src || !dst) { console.error("usage: node tools/osm.mjs extract.json out.json [name]"); process.exit(1); }

const raw = fs.readFileSync(src, "utf8");
if (!raw.trimStart().startsWith("{")) {
  // Overpass answers errors (busy, timeout) with an HTML page, not JSON
  console.error(`${src} is not Overpass JSON; the server probably refused the query, try again later`);
  process.exit(1);
}
const { map, opened } = osmToGraph(JSON.parse(raw).elements, name);
fs.writeFileSync(dst, JSON.stringify(map));
console.log(`${name}: ${map.nodes.length} junctions, ${map.edges.length} roads, ${map.edges.filter((e) => e[3]).length} one-way (${opened} opened to two-way so no street is a trap)`);
