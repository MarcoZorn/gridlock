// Long runs without a browser. Resumes from the run's checkpoint if there is
// one, appends one line of telemetry per generation, checkpoints regularly.
//
//   node headless.mjs --run runs/lanes --gens 3000 --traffic-from 200 --density 40 --control lights
//   node headless.mjs --eco --run runs/eco --days 30 --founders docs/trained.json
//
// runs/<name>/telemetry.jsonl   one JSON object per generation (kept in git)
// runs/<name>/state.json        the latest checkpoint (ignored by git)
import fs from "node:fs";
import path from "node:path";
import { CityWorld } from "./src/cityworld.js";
import { EcoWorld } from "./src/ecoworld.js";
import { Population } from "./src/neat.js";

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
const control = arg("control", "none");

fs.mkdirSync(dir, { recursive: true });
const statePath = path.join(dir, "state.json");
const telemetry = path.join(dir, "telemetry.jsonl");

// Signals are delivered on the event loop, which a synchronous simulation
// loop never yields to: without the occasional `await tick()` below, a
// SIGTERM would be ignored and the run would die without its checkpoint.
let stop = false;
process.on("SIGINT", () => { stop = true; });
process.on("SIGTERM", () => { stop = true; });
const tick = () => new Promise((r) => setImmediate(r));

// Atomic save: write to a temp file and rename, so a run killed mid-write
// never leaves a half-written checkpoint behind.
function save(obj) {
  fs.writeFileSync(statePath + ".tmp", JSON.stringify(obj));
  fs.renameSync(statePath + ".tmp", statePath);
}

if (process.argv.includes("--eco")) {
  // The ecosystem has no generations: run for a number of city days (24
  // minutes of simulation each), writing its ten-minute telemetry rows.
  const days = +arg("days", 10), TICKS_PER_DAY = 24 * 60 * 60;
  let eco;
  if (fs.existsSync(statePath)) {
    eco = EcoWorld.fromJSON(JSON.parse(fs.readFileSync(statePath, "utf8")));
    console.log(`resumed ${dir} at day ${(eco.tick / TICKS_PER_DAY).toFixed(2)}`);
  } else {
    const f = arg("founders", null);
    const founders = f ? Population.fromJSON(JSON.parse(fs.readFileSync(f, "utf8")).pop) : null;
    eco = new EcoWorld({ seed, control, founders });
    console.log(`new ecosystem ${dir}, seed ${seed}${f ? `, founders from ${f}` : ""}`);
  }
  let written = eco.log.length;
  while (!stop && eco.tick < days * TICKS_PER_DAY) {
    eco.step();
    if (eco.tick % 3600 === 0) await tick();
    if (eco.log.length > written) {
      for (const r of eco.log.slice(written)) fs.appendFileSync(telemetry, JSON.stringify(r) + "\n");
      written = eco.log.length;
      const r = eco.log.at(-1);
      if (eco.tick % (TICKS_PER_DAY / 4) === 0) {
        console.log(`day ${(eco.tick / TICKS_PER_DAY).toFixed(2)} cars ${r.cars} species ${r.species.length} maxGen ${r.maxGen} cargo ${r.traits.cargo.toFixed(2)} engine ${r.traits.engine.toFixed(2)}`);
      }
    }
    if (eco.tick % (TICKS_PER_DAY / 4) === 0) {
      const j = eco.toJSON();
      j.log = j.log.slice(-600);
      eco.log = eco.log.slice(-600);
      written = eco.log.length;
      save(j);
    }
  }
  const j = eco.toJSON();
  save(j);
  console.log(`stopped at day ${(eco.tick / TICKS_PER_DAY).toFixed(2)}`);
  process.exit(0);
}

let world;
if (fs.existsSync(statePath)) {
  world = CityWorld.fromJSON(JSON.parse(fs.readFileSync(statePath, "utf8")));
  console.log(`resumed ${dir} at generation ${world.pop.generation}`);
} else {
  world = new CityWorld({ seed, popSize: 120, density, control });
  console.log(`new run ${dir}, seed ${seed}`);
}

function checkpoint() {
  const j = world.toJSON();
  j.history = j.history.slice(-400);
  save(j);
}

const t0 = Date.now();
while (!stop && world.pop.generation < gens) {
  const wantTraffic = world.pop.generation >= trafficFrom;
  if (world.traffic !== wantTraffic || world.density !== density || world.control !== control) {
    world.traffic = wantTraffic;
    world.density = density;
    world.control = control;
    world.newGeneration();
  }
  const r = world.runGeneration();
  await tick();
  fs.appendFileSync(telemetry, JSON.stringify({ ...r, t: Math.round((Date.now() - t0) / 1000) }) + "\n");
  if (r.gen % 10 === 0) {
    console.log(`gen ${r.gen} ${r.traffic ? "traffic" : "ghosts"} trips/car ${(r.trips / 120).toFixed(2)} crashes/km ${r.crashesPerKm.toFixed(1)} side ${r.side.toFixed(2)}${r.control === "lights" ? ` red ${r.redRuns}` : ""}`);
  }
  if (world.pop.generation % every === 0) checkpoint();
}
checkpoint();
console.log(`stopped at generation ${world.pop.generation}`);
