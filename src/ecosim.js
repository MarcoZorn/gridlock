// Browser front end for the ecosystem: no generations, one long-running city.
import { EcoWorld, ECON } from "./ecoworld.js";
import { Population } from "./neat.js";
import { fitCanvas, panZoom, drawCity, drawLights, drawRoute, drawRays, drawCar, speciesColour } from "./render.js";
import { drawNetwork } from "./netview.js";

const $ = (id) => document.getElementById(id);
const view = $("view"), vctx = view.getContext("2d");
const brain = $("brain"), bctx = brain.getContext("2d");
const spc = $("species"), sctx = spc.getContext("2d");
const bod = $("bodies"), octx = bod.getContext("2d");

let world, founders = null, running = true, speed = 1, showRays = true, follow = false;
let selected = null, colourBy = "species", control = "none";
const cam = { x: 0, y: 0, k: 1, fitted: false };

function layout() {
  const w = Math.max(320, Math.floor(view.parentElement.getBoundingClientRect().width - 20));
  fitCanvas(view, w, Math.round(w * 0.66));
  const bw = brain.parentElement.getBoundingClientRect().width - 28;
  fitCanvas(brain, bw, 150);
  fitCanvas(spc, bw, 110);
  fitCanvas(bod, bw, 130);
  cam.fitted = false;
}

function fitCam() {
  const c = world.city;
  cam.k = Math.min(view.clientWidth / c.w, view.clientHeight / c.h) * 0.98;
  cam.x = c.w / 2; cam.y = c.h / 2;
  cam.fitted = true;
}

function reset(seed) {
  world = new EcoWorld({ seed, control, founders });
  selected = null;
  cam.fitted = false;
}

const JOB_COLOUR = { passenger: "#6ea8ff", freight: "#e8c46a" };
const colourOf = (d) => (colourBy === "species" ? speciesColour(d.species) : JOB_COLOUR[d.job.kind] || "#4a5060");

// Species as stacked bands over time, from the telemetry the world records
// every ten minutes, so the chart is the world's own record, not a second one.
function drawSpecies() {
  const W = spc.clientWidth, H = spc.clientHeight, log = world.log.slice(-144);
  sctx.clearRect(0, 0, W, H);
  if (log.length < 2) return;
  const maxCars = Math.max(...log.map((r) => r.cars), 1);
  const ids = [...new Set(log.flatMap((r) => r.species.map(([id]) => id)))];
  const x = (i) => (i / (log.length - 1)) * W;
  const base = new Array(log.length).fill(0);
  for (const id of ids) {
    const top = log.map((r, i) => base[i] + ((r.species.find(([s]) => s === id) || [0, 0])[1]));
    sctx.beginPath();
    top.forEach((v, i) => sctx.lineTo(x(i), H - (v / maxCars) * H));
    for (let i = log.length - 1; i >= 0; i--) sctx.lineTo(x(i), H - (base[i] / maxCars) * H);
    sctx.fillStyle = speciesColour(id, 55);
    sctx.fill();
    top.forEach((v, i) => (base[i] = v));
  }
}

// Every living car as a dot: how much it can carry against how fast it can
// go. Taxis sit top left, vans and trucks bottom right, if both exist.
function drawBodies() {
  const W = bod.clientWidth, H = bod.clientHeight, P = 6;
  octx.clearRect(0, 0, W, H);
  octx.strokeStyle = "#232733";
  octx.strokeRect(0.5, 0.5, W - 1, H - 1);
  const capMax = 14, vMin = 60, vMax = 150;
  octx.fillStyle = "rgba(232,196,106,0.10)";
  const fx = P + (ECON.freightMin / capMax) * (W - 2 * P);
  octx.fillRect(fx, 0, W - fx, H);
  for (const d of world.cars) {
    const px = P + Math.min(1, d.body.capacity / capMax) * (W - 2 * P);
    const py = H - P - Math.max(0, Math.min(1, (d.p.maxSpeed - vMin) / (vMax - vMin))) * (H - 2 * P);
    octx.fillStyle = speciesColour(d.species);
    octx.beginPath(); octx.arc(px, py, d === selected ? 4 : 2.5, 0, Math.PI * 2); octx.fill();
  }
}

function clock(t) {
  const m = Math.floor(t) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function draw() {
  if (!cam.fitted) fitCam();
  if (selected && !world.cars.includes(selected)) selected = null;
  const focus = selected || world.richest();
  if (follow && focus) { cam.x += (focus.x - cam.x) * 0.15; cam.y += (focus.y - cam.y) * 0.15; }

  const W = view.clientWidth, H = view.clientHeight, k = cam.k;
  vctx.clearRect(0, 0, W, H);
  vctx.save();
  vctx.translate(W / 2, H / 2);
  vctx.scale(k, k);
  vctx.translate(-cam.x, -cam.y);
  drawCity(vctx, world.city, k);
  drawLights(vctx, world.city, k);
  if (focus) drawRoute(vctx, world.city, focus, k);
  for (const d of world.cars) if (d !== focus) drawCar(vctx, d, colourOf(d), 0.9);
  if (focus) {
    if (showRays) drawRays(vctx, focus, k);
    drawCar(vctx, focus, "#ffffff", 1);
  }
  vctx.restore();

  drawNetwork(bctx, focus ? focus.genome : null, brain.clientWidth, brain.clientHeight);
  drawSpecies();
  drawBodies();

  const last = world.log.slice(-6);
  const sum = (key) => last.reduce((a, r) => a + r[key], 0);
  $("clock").textContent = clock(world.city.time);
  $("cars").textContent = world.cars.length;
  $("queues").textContent = `${Math.floor(world.passengers)} / ${Math.floor(world.freight)}`;
  $("bd").textContent = last.length ? `${sum("births")} / ${sum("deaths")}` : "-";
  $("cash").textContent = (world.cars.reduce((a, d) => a + d.cash, 0) / Math.max(1, world.cars.length)).toFixed(1);
  $("maxgen").textContent = Math.max(0, ...world.cars.map((d) => d.generation));
  $("nspecies").textContent = world.species.length;
  $("carTitle").textContent = selected ? "Selected car" : "Richest car";
  if (focus) {
    $("cWallet").textContent = `${focus.cash.toFixed(1)} / ${focus.earned.toFixed(0)}`;
    $("cGen").textContent = `${focus.generation} / ${focus.children}`;
    $("cSize").textContent = `${focus.p.len.toFixed(0)} x ${focus.p.wid.toFixed(1)}, ${focus.p.mass.toFixed(1)}`;
    $("cPerf").textContent = `${focus.p.maxSpeed.toFixed(0)} / ${focus.body.capacity.toFixed(1)}`;
    $("cJob").textContent = focus.job.kind ? `${focus.job.kind}${focus.job.load ? `, ${focus.job.load.toFixed(1)} load` : ""}` : "empty";
  }
}

function frame() {
  if (running) {
    // at high speed, simulate on a time budget so the page stays responsive
    const until = performance.now() + 28;
    for (let i = 0; i < speed && performance.now() < until; i++) world.step();
  }
  draw();
  requestAnimationFrame(frame);
}

panZoom(view, cam, (wx, wy) => {
  let best = null, bd = 20 / cam.k + 10;
  for (const d of world.cars) {
    const dd = Math.hypot(d.x - wx, d.y - wy);
    if (dd < bd) { bd = dd; best = d; }
  }
  selected = best;
});
view.addEventListener("dblclick", () => { cam.fitted = false; follow = false; $("follow").dataset.on = false; });

$("play").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause" : "Play"; };
for (const b of document.querySelectorAll("[data-speed]")) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((x) => (x.dataset.on = x === b));
  };
}
$("colour").onclick = (e) => {
  colourBy = colourBy === "species" ? "job" : "species";
  e.target.textContent = `Colour: ${colourBy}`;
};
$("rays").onclick = (e) => { showRays = !showRays; e.target.dataset.on = showRays; };
$("follow").onclick = (e) => {
  follow = !follow;
  e.target.dataset.on = follow;
  if (follow) cam.k = Math.max(cam.k, 3);
};
for (const b of document.querySelectorAll("[data-control]")) {
  b.onclick = () => {
    control = b.dataset.control;
    document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x === b));
    world.control = control;
  };
}
$("again").onclick = () => reset(Math.floor(Math.random() * 9999) + 1);
window.addEventListener("resize", layout);

window.gridlock = { get world() { return world; } };

// Founders come from the trained drivers if they are there, from scratch if
// not (which works, it just takes a long time to get anywhere).
layout();
try {
  const r = await fetch("docs/trained.json");
  if (r.ok) founders = Population.fromJSON((await r.json()).pop);
} catch { /* no founders: start from minimal brains */ }
reset(3);
frame();
