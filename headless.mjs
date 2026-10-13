// Long runs without a browser. Resumes from the run's checkpoint if there is
// one, appends one line of telemetry per generation, checkpoints regularly.
//
//   node headless.mjs --run runs/lanes --gens 3000 --traffic-from 200 --density 40
//
// runs/<name>/telemetry.jsonl   one JSON object per generation (kept in git)
// runs/<name>/state.json        the latest checkpoint (ignored by git)
import fs from "node:fs";
import path from "node:path";
import { CityWorld } from "./src/cityworld.js";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};
const dir = arg("run", "runs/default");
const gens = +arg("gens", 1000);
const trafficFrom = +arg("traffic-from", 200);
const density = +arg("density", 40);
const seed = +arg("seed", 3);
const every = +arg("checkpoint", 25);

fs.mkdirSync(dir, { recursive: true });
const statePath = path.join(dir, "state.json");
const telemetry = path.join(dir, "telemetry.jsonl");

let world;
if (fs.existsSync(statePath)) {
  world = CityWorld.fromJSON(JSON.parse(fs.readFileSync(statePath, "utf8")));
  console.log(`resumed ${dir} at generation ${world.pop.generation}`);
} else {
  world = new CityWorld({ seed, popSize: 120, density });
  console.log(`new run ${dir}, seed ${seed}`);
}

// Write to a temp file and rename, so a run killed mid-write never leaves a
// half-written checkpoint behind.
function checkpoint() {
  const j = world.toJSON();
  j.history = j.history.slice(-400);
  fs.writeFileSync(statePath + ".tmp", JSON.stringify(j));
  fs.renameSync(statePath + ".tmp", statePath);
}

let stop = false;
process.on("SIGINT", () => { stop = true; });
process.on("SIGTERM", () => { stop = true; });

const t0 = Date.now();
while (!stop && world.pop.generation < gens) {
  const wantTraffic = world.pop.generation >= trafficFrom;
  if (world.traffic !== wantTraffic || world.density !== density) {
    world.traffic = wantTraffic;
    world.density = density;
    world.newGeneration();
  }
  const r = world.runGeneration();
  fs.appendFileSync(telemetry, JSON.stringify({ ...r, t: Math.round((Date.now() - t0) / 1000) }) + "\n");
  if (r.gen % 10 === 0) {
    console.log(`gen ${r.gen} ${r.traffic ? "traffic" : "ghosts"} trips/car ${(r.trips / 120).toFixed(2)} crashes/km ${r.crashesPerKm.toFixed(1)} side ${r.side.toFixed(2)}`);
  }
  if (world.pop.generation % every === 0) checkpoint();
}
checkpoint();
console.log(`stopped at generation ${world.pop.generation}`);
