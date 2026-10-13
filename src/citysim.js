// Browser front end for the city: run it, draw it, pan and zoom, inspect a car.
import { CityWorld } from "./cityworld.js";
import { SIZES } from "./ecoworld.js";
import { BODY } from "./driver.js";
import { fitCanvas, panZoom, announceToggles, cityLayer, drawHeat, drawSenses, drawLights, drawRoute, drawRays, drawCar } from "./render.js";
import { drawNetwork } from "./netview.js";
import { drawSparkline } from "./sparkline.js";

const $ = (id) => document.getElementById(id);

// highlight where we are in the nav
{
  const q = new URLSearchParams(location.search), page = location.pathname.endsWith("eco.html") ? "eco" : "gen";
  const view = q.get("map") === "crossroads" ? "cross" : ["turin", "barcelona"].includes(q.get("map")) ? q.get("map") : page;
  document.querySelector(`nav.views [data-view="${view}"]`)?.classList.add("here");
}
const view = $("view"), vctx = view.getContext("2d");
const brain = $("brain"), bctx = brain.getContext("2d");
const spark = $("spark"), sctx = spark.getContext("2d");
const senses = $("senses");

let world, running = true, speed = 1, showRays = true, showAll = true, follow = false;
let pending = 0, selected = null, director = false, nextCut = 0;
let traffic = false, density = 40, heatMode = 0, control = "none", size = "small", graph = null;
const HEAT_MODES = ["off", "crashes", "congestion"];
const cam = { x: 0, y: 0, k: 1, fitted: false };
const roads = cityLayer();


function layout() {
  const w = Math.max(320, Math.floor(view.parentElement.getBoundingClientRect().width - 20));
  fitCanvas(view, w, Math.round(w * 0.66));
  const bw = brain.parentElement.getBoundingClientRect().width - 28;
  fitCanvas(brain, bw, 170);
  fitCanvas(spark, bw, 60);
  fitCanvas(senses, bw, 64);
  cam.fitted = false;
}

function fitCam() {
  const c = world.city;
  cam.k = Math.min(view.clientWidth / c.w, view.clientHeight / c.h) * 0.98;
  cam.x = c.w / 2; cam.y = c.h / 2;
  cam.fitted = true;
}

function reset(seed) {
  world = new CityWorld({ seed, popSize: 120, traffic, density, control, size: SIZES[size], graph });
  selected = null;
  cam.fitted = false;
  $("seed").textContent = seed;
}



// The director picks whichever car has the most traffic around it, follows
// it for a few seconds, then cuts to the next. It is the easiest way to see
// what the drivers actually do when they meet.
function directorCut(now) {
  if (!director || now < nextCut) return;
  nextCut = now + 6000;
  let best = null, bn = -1;
  for (const d of world.cars) {
    if (!d.alive || d.towing) continue;
    let n = 0;
    for (const o of world.cars) if (o !== d && o.alive && Math.abs(o.x - d.x) < 70 && Math.abs(o.y - d.y) < 70) n++;
    if (n > bn) { bn = n; best = d; }
  }
  if (best) { selected = best; follow = true; cam.k = Math.max(cam.k, 3); }
}

function draw() {
  directorCut(performance.now());
  if (!cam.fitted) fitCam();
  const focus = selected && selected.alive ? selected : world.leader();
  if (follow && focus) { cam.x += (focus.x - cam.x) * 0.15; cam.y += (focus.y - cam.y) * 0.15; }

  const W = view.clientWidth, H = view.clientHeight, k = cam.k;
  vctx.clearRect(0, 0, W, H);
  roads(vctx, world.city, cam, W, H);
  vctx.save();
  vctx.translate(W / 2, H / 2);
  vctx.scale(k, k);
  vctx.translate(-cam.x, -cam.y);

  if (heatMode) drawHeat(vctx, world.heat, heatMode);
  drawLights(vctx, world.city, k);
  if (focus) drawRoute(vctx, world.city, focus, k);
  if (showAll) {
    for (const d of world.cars) {
      if (d === focus || !d.alive) continue;
      drawCar(vctx, d, "#5a6a8a", 0.8);
    }
  }
  if (focus) {
    if (showRays && focus.alive) drawRays(vctx, focus, k);
    drawCar(vctx, focus, selected ? "#6ea8ff" : "#ff8a5c", 1);
  }
  vctx.restore();

  drawNetwork(bctx, focus ? focus.genome : null, brain.clientWidth, brain.clientHeight);
  drawSparkline(sctx, world.history, spark.clientWidth, spark.clientHeight);
  drawSenses(senses, focus && focus.alive ? focus : null);

  let alive = 0, trips = 0, crashes = 0;
  for (const d of world.cars) { if (d.alive) alive++; trips += d.trips; crashes += d.crashes; }
  const last = world.history[world.history.length - 1];
  $("gen").textContent = world.pop.generation;
  $("city").textContent = `${world.pop.generation % world.cities.length + 1} of ${world.cities.length}`;
  $("alive").textContent = world.traffic && world.waves > 1
    ? `${alive}/${world.cars.length}, wave ${world.wave + 1}/${world.waves}`
    : `${alive}/${world.cars.length}`;
  $("tick").textContent = pending > 0 ? `fast-forward ${pending}` : `${Math.round((world.tick / world.ticksPerGen) * 100)}%`;
  $("trips").textContent = trips;
  $("crashes").textContent = crashes;
  $("species").textContent = world.pop.species.length || "-";
  $("best").textContent = last ? Math.round(last.best) : "-";
  if (last) {
    $("sThru").textContent = last.throughput.toFixed(2);
    $("sTrip").textContent = last.tripTime ? `${last.tripTime.toFixed(1)} s` : "-";
    $("sCpk").textContent = last.crashesPerKm.toFixed(1);
    $("sCar").textContent = last.carCrashes;
    $("sWait").textContent = `${(last.waitShare * 100).toFixed(1)}%`;
    $("sYield").textContent = last.yielded != null ? `${(last.yielded * 100).toFixed(0)}% of ${last.conflicts}` : "-";
    $("sRed").textContent = last.control === "lights" ? last.redRuns : "-";
    $("sSide").textContent = last.side.toFixed(2);
    $("sNote").textContent = `generation ${last.gen}, ${last.traffic ? `traffic, ${last.density} at once` : "ghosts, no traffic"}${last.control !== "none" ? `, ${last.control}` : ""}`;
  }
  $("brainTitle").textContent = selected ? "Selected car's brain" : "Leader's brain";
  const cx = focus ? focus.genome.complexity() : null;
  $("size").textContent = cx ? `${cx.nodes} / ${cx.conns}` : "-";
  $("carStats").textContent = focus ? `${focus.trips} / ${focus.crashes}` : "-";
}

function frame() {
  // Fast-forward runs on a time budget per frame so the tab stays responsive.
  if (pending > 0) {
    const until = performance.now() + 24;
    while (pending > 0 && performance.now() < until) {
      while (world.step()) {}
      world.finish();
      pending--;
      selected = null;
    }
  } else if (running) {
    for (let i = 0; i < speed; i++) {
      if (!world.step()) { world.finish(); selected = null; break; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

panZoom(view, cam, (wx, wy) => {
  let best = null, bd = 20 / cam.k + BODY.len;
  for (const d of world.cars) {
    if (!d.alive) continue;
    const dd = Math.hypot(d.x - wx, d.y - wy);
    if (dd < bd) { bd = dd; best = d; }
  }
  selected = best;
});
view.addEventListener("dblclick", () => { cam.fitted = false; follow = false; $("follow").dataset.on = false; });

// A saved world restarts its generation exactly, so rewinding to the start
// of this generation is a save and a load: the same fares, the same drivers,
// the same minute again, crash for crash.
$("replay").onclick = () => {
  const keep = selected ? world.cars.indexOf(selected) : -1;
  world = CityWorld.fromJSON(JSON.parse(JSON.stringify(world)));
  selected = keep >= 0 ? world.cars[keep] : null;
  pending = 0;
};
$("director").onclick = (e) => {
  director = !director;
  e.target.dataset.on = director;
  nextCut = 0;
  if (!director) { follow = false; $("follow").dataset.on = false; selected = null; }
};
$("play").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause" : "Play"; };
$("skip").onclick = () => { pending += 1; };
$("jump").onclick = () => { pending += 25; };
$("again").onclick = () => { pending = 0; reset(Math.floor(Math.random() * 9999) + 1); };
// Switching traffic or density restarts the current generation with the same
// genomes, so nothing evolved is lost, only the generation in progress.
$("traffic").onclick = (e) => {
  traffic = !traffic;
  e.target.dataset.on = traffic;
  world.traffic = traffic;
  selected = null;
  world.newGeneration();
};
for (const b of document.querySelectorAll("[data-density]")) {
  b.onclick = () => {
    density = +b.dataset.density;
    document.querySelectorAll("[data-density]").forEach((x) => (x.dataset.on = x === b));
    world.density = density;
    if (world.traffic) { selected = null; world.newGeneration(); }
  };
}
for (const b of document.querySelectorAll("[data-control]")) {
  b.onclick = () => {
    control = b.dataset.control;
    document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x === b));
    world.control = control;
    selected = null;
    world.newGeneration();
  };
}
// Save and load whole runs: the population, its history and the settings.
// The cities are rebuilt from the seed, so a save is a few hundred KB.
function adopt(w) {
  world = w;
  traffic = w.traffic; density = w.density; control = w.control;
  $("traffic").dataset.on = traffic;
  document.querySelectorAll("[data-density]").forEach((x) => (x.dataset.on = +x.dataset.density === density));
  document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x.dataset.control === control));
  $("seed").textContent = w.seed;
  selected = null; pending = 0; cam.fitted = false;
}
$("save").onclick = () => {
  const blob = new Blob([JSON.stringify(world)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gridlock-seed${world.seed}-gen${world.pop.generation}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$("load").onclick = () => $("loadFile").click();
$("loadFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { adopt(CityWorld.fromJSON(JSON.parse(await f.text()))); }
  catch (err) { alert(`Not a gridlock save: ${err.message}`); }
  e.target.value = "";
};
// Drivers raised under the junction control that is on now, if a set was
// shipped for it (docs/trained-lights.json, ...), the no-signals set if not.
// The page's own settings (from the URL or the buttons) win over whatever
// the saved run was doing.
async function loadTrained() {
  let r = control !== "none" ? await fetch(`docs/trained-${control}.json`) : null;
  if (!r || !r.ok) r = await fetch("docs/trained.json");
  const j = await r.json();
  Object.assign(j, { control, traffic: j.traffic || traffic, density: params.has("density") ? density : j.density });
  if (graph) { j.opts = { ...j.opts, graph }; j.traffic = true; }
  adopt(CityWorld.fromJSON(j));
}
$("trained").onclick = () => loadTrained().catch((err) => alert(`Could not load the trained drivers: ${err.message}`));
// A new size is a new set of cities, but the same drivers: the population is
// kept, so you can see how brains raised in small towns cope with a big one.
for (const b of document.querySelectorAll("[data-size]")) {
  b.onclick = () => {
    size = b.dataset.size;
    document.querySelectorAll("[data-size]").forEach((x) => (x.dataset.on = x === b));
    const pop = world.pop, history = world.history;
    world = new CityWorld({ seed: world.seed, popSize: 120, traffic, density, control, size: SIZES[size], pop, graph });
    world.history = history;
    selected = null; cam.fitted = false;
  };
}
$("heat").onclick = (e) => {
  heatMode = (heatMode + 1) % HEAT_MODES.length;
  e.target.dataset.on = heatMode > 0;
  e.target.textContent = `Heatmap: ${HEAT_MODES[heatMode]}`;
};
$("rays").onclick = (e) => { showRays = !showRays; e.target.dataset.on = showRays; };
$("crowd").onclick = (e) => { showAll = !showAll; e.target.dataset.on = showAll; };
$("follow").onclick = (e) => {
  follow = !follow;
  e.target.dataset.on = follow;
  if (follow) cam.k = Math.max(cam.k, 3);
};
for (const b of document.querySelectorAll("[data-speed]")) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((x) => (x.dataset.on = x === b));
  };
}
window.addEventListener("resize", layout);

// Handle for poking at the run from the console.
window.gridlock = { get world() { return world; }, ff(n) { pending += n; }, cam };

// ?seed=7&traffic=1&density=20&control=lights starts that run, so a setup
// can be shared as a link.
const params = new URLSearchParams(location.search);
traffic = params.get("traffic") === "1";
if ([10, 20, 40, 120].includes(+params.get("density"))) density = +params.get("density");
if (["none", "lights", "roundabouts"].includes(params.get("control"))) control = params.get("control");
if (SIZES[params.get("size")]) size = params.get("size");
document.querySelectorAll("[data-size]").forEach((x) => (x.dataset.on = x.dataset.size === size));
$("traffic").dataset.on = traffic;
document.querySelectorAll("[data-density]").forEach((x) => (x.dataset.on = +x.dataset.density === density));
document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x.dataset.control === control));

// ?map=crossroads (or any maps/<name>.json) races on that one map instead
// of the rotating generated cities.
if (/^[a-z0-9-]+$/.test(params.get("map") || "")) {
  try {
    const r = await fetch(`maps/${params.get("map")}.json`);
    if (r.ok) graph = await r.json();
  } catch { /* generated cities after all */ }
}

// Visitors start on drivers that already know how to drive; a seed in the
// URL, or New seed, starts from scratch instead.
announceToggles();
layout();
reset(+params.get("seed") || 3);
if (!params.get("seed")) {
  try { await loadTrained(); } catch { /* stay on the fresh run */ }
}
frame();
