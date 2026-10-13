// Browser front end for the ecosystem: no generations, one long-running city.
import { EcoWorld, ECON } from "./ecoworld.js";
import { Population, Rng } from "./neat.js";
import { Crowd } from "./pedestrians.js";
import { fitCanvas, panZoom, announceToggles, shortcuts, busiestCar, cityLayer, drawHeat, drawClosures, drawLights, drawRoute, drawRays, drawCar, speciesColour } from "./render.js";
import { drawNetwork } from "./netview.js";

const $ = (id) => document.getElementById(id);

// highlight where we are in the nav
{
  const q = new URLSearchParams(location.search), page = location.pathname.endsWith("eco.html") ? "eco" : "gen";
  const view = q.get("map") === "crossroads" ? "cross" : ["turin", "barcelona"].includes(q.get("map")) ? q.get("map") : page;
  document.querySelector(`nav.views [data-view="${view}"]`)?.classList.add("here");
}
const view = $("view"), vctx = view.getContext("2d");
const brain = $("brain"), bctx = brain.getContext("2d");
const spc = $("species"), sctx = spc.getContext("2d");
const bod = $("bodies"), octx = bod.getContext("2d");
const tree = $("tree"), tctx = tree.getContext("2d");

let world, founders = {}, graph = null, size = "small", running = true, speed = 1, showRays = true, follow = false;
let director = false, nextCut = 0;
let selected = null, colourBy = "species", control = "none", editing = false, draft = null;
const cam = { x: 0, y: 0, k: 1, fitted: false };
const roads = cityLayer();

function layout() {
  const w = Math.max(320, Math.floor(view.parentElement.getBoundingClientRect().width - 20));
  fitCanvas(view, w, Math.round(w * 0.66));
  const bw = brain.parentElement.getBoundingClientRect().width - 28;
  fitCanvas(brain, bw, 150);
  fitCanvas(spc, bw, 110);
  fitCanvas(bod, bw, 130);
  fitCanvas(tree, bw, 140);
  cam.fitted = false;
}

function fitCam() {
  const c = world.city;
  cam.k = Math.min(view.clientWidth / c.w, view.clientHeight / c.h) * 0.98;
  cam.x = c.w / 2; cam.y = c.h / 2;
  cam.fitted = true;
}

function reset(seed) {
  // founded by drivers raised under this junction control, if there are any
  world = new EcoWorld({ seed, control, founders: founders[control] || founders.none || null, graph, size });
  selected = null;
  $("peds-on").dataset.on = false;
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

// The family tree of everyone alive: each remembered birth is a line from
// parent to child, across by time, up by generation. Lineages that died out
// are already forgotten, so what is left is the shape of the survivors.
function drawTree(focus) {
  const W = tree.clientWidth, H = tree.clientHeight, P = 6;
  tctx.clearRect(0, 0, W, H);
  const anc = world.ancestry;
  if (!anc.size) return;
  let t0 = Infinity, g1 = 1;
  for (const a of anc.values()) { if (a.born < t0) t0 = a.born; if (a.generation > g1) g1 = a.generation; }
  const t1 = Math.max(world.tick, t0 + 1);
  const X = (t) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P), Y = (g) => H - P - (g / g1) * (H - 2 * P);
  tctx.lineWidth = 1;
  for (const a of anc.values()) {
    const p = anc.get(a.parent);
    if (!p) continue;
    tctx.strokeStyle = speciesColour(a.species, 55);
    tctx.beginPath(); tctx.moveTo(X(p.born), Y(p.generation)); tctx.lineTo(X(a.born), Y(a.generation)); tctx.stroke();
  }
  for (const d of world.cars) {
    const a = anc.get(d.id);
    if (!a) continue;
    tctx.fillStyle = speciesColour(d.species);
    tctx.fillRect(X(a.born) - 1.5, Y(a.generation) - 1.5, 3, 3);
  }
  if (focus) {
    const line = world.lineage(focus);
    tctx.strokeStyle = "#ffffff"; tctx.lineWidth = 2;
    tctx.beginPath();
    line.forEach((a, i) => (i ? tctx.lineTo(X(a.born), Y(a.generation)) : tctx.moveTo(X(a.born), Y(a.generation))));
    tctx.stroke();
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
  // square-root axis: most cars carry next to nothing, and on a straight
  // axis they all sat in one corner
  const cx = (c) => P + Math.sqrt(Math.min(1, c / capMax)) * (W - 2 * P);
  const fx = cx(ECON.freightMin);
  octx.fillRect(fx, 0, W - fx, H);
  for (const d of world.cars) {
    const px = cx(d.body.capacity);
    const py = H - P - Math.max(0, Math.min(1, (d.p.maxSpeed - vMin) / (vMax - vMin))) * (H - 2 * P);
    octx.fillStyle = speciesColour(d.species);
    octx.beginPath(); octx.arc(px, py, d === selected ? 4 : 2.5, 0, Math.PI * 2); octx.fill();
  }
}

// Night falls on the city: a dark wash from evening to dawn, and headlights.
// It is only paint, but it makes the clock readable at a glance, and the
// quiet of the small hours, when demand drops, visible.
function darkness(hour) {
  // 0 by day, up to 0.55 deep in the night, with an hour of dusk and dawn
  const ramp = (a, b, h) => Math.max(0, Math.min(1, (h - a) / (b - a)));
  return 0.55 * (hour >= 12 ? ramp(19, 21, hour) : 1 - ramp(5.5, 7.5, hour));
}
function drawNight(W, H, k) {
  const dark = darkness(((world.city.time / 60) % 24 + 24) % 24);
  if (dark < 0.01) return;
  vctx.fillStyle = `rgba(4,6,16,${dark})`;
  vctx.fillRect(0, 0, W, H);
  vctx.save();
  vctx.translate(W / 2, H / 2);
  vctx.scale(k, k);
  vctx.translate(-cam.x, -cam.y);
  vctx.globalCompositeOperation = "lighter";
  const glow = 0.22 * dark / 0.55;
  for (const d of world.cars) {
    const len = d.p.len, reach = 24, ca = Math.cos(d.a), sa = Math.sin(d.a);
    const fx = d.x + ca * len / 2, fy = d.y + sa * len / 2;
    // a beam that fades with distance, not a solid wedge
    const g = vctx.createLinearGradient(fx, fy, fx + ca * reach, fy + sa * reach);
    g.addColorStop(0, `rgba(255,236,190,${glow})`);
    g.addColorStop(1, "rgba(255,236,190,0)");
    vctx.fillStyle = g;
    vctx.beginPath();
    vctx.moveTo(fx - sa * 1.5, fy + ca * 1.5);
    vctx.lineTo(fx + ca * reach - sa * 7, fy + sa * reach + ca * 7);
    vctx.lineTo(fx + ca * reach + sa * 7, fy + sa * reach - ca * 7);
    vctx.lineTo(fx + sa * 1.5, fy - ca * 1.5);
    vctx.closePath();
    vctx.fill();
  }
  vctx.restore();
}

function clock(t) {
  const m = Math.floor(t) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// Follow whoever has the most traffic around them, a few seconds at a time.
function directorCut(now) {
  if (!director || now < nextCut) return;
  nextCut = now + 6000;
  const best = busiestCar(world.cars);
  if (best) { selected = best; follow = true; cam.k = Math.max(cam.k, 3); }
}

function draw() {
  directorCut(performance.now());
  if (!cam.fitted) fitCam();
  if (selected && !world.cars.includes(selected)) selected = null;
  const focus = selected || world.richest();
  if (follow && focus) { cam.x += (focus.x - cam.x) * 0.15; cam.y += (focus.y - cam.y) * 0.15; }

  const W = view.clientWidth, H = view.clientHeight, k = cam.k;
  vctx.clearRect(0, 0, W, H);
  roads(vctx, world.city, cam, W, H);
  vctx.save();
  vctx.translate(W / 2, H / 2);
  vctx.scale(k, k);
  vctx.translate(-cam.x, -cam.y);
  drawLights(vctx, world.city, k);
  drawClosures(vctx, world.city, k);
  if (draft) {
    vctx.strokeStyle = "rgba(232,196,106,0.8)";
    vctx.lineWidth = 3 / k;
    vctx.setLineDash([6 / k, 4 / k]);
    vctx.beginPath(); vctx.moveTo(draft.from.x, draft.from.y); vctx.lineTo(draft.x, draft.y); vctx.stroke();
    vctx.setLineDash([]);
  }
  if (focus) drawRoute(vctx, world.city, focus, k);
  if (world.crowd) {
    for (const p of world.crowd.people) {
      vctx.fillStyle = p.crossing ? "#ffffff" : "rgba(230,232,238,0.45)";
      vctx.beginPath(); vctx.arc(p.x, p.y, p.crossing ? 1.6 : 1.2, 0, Math.PI * 2); vctx.fill();
    }
  }
  for (const d of world.cars) if (d !== focus) drawCar(vctx, d, colourOf(d), 0.9);
  if (focus) {
    if (showRays) drawRays(vctx, focus, k);
    drawCar(vctx, focus, "#ffffff", 1);
  }
  vctx.restore();
  drawNight(W, H, k);
  if (heatMode) {
    // a reading, not part of the scene: drawn over the night, not under it
    vctx.save();
    vctx.translate(W / 2, H / 2); vctx.scale(k, k); vctx.translate(-cam.x, -cam.y);
    drawHeat(vctx, world.city.heatGrid(), heatMode);
    vctx.restore();
  }

  drawNetwork(bctx, focus ? focus.genome : null, brain.clientWidth, brain.clientHeight);
  drawSpecies();
  drawTree(focus);
  drawBodies();

  const last = world.log.slice(-6);
  const sum = (key) => last.reduce((a, r) => a + r[key], 0);
  $("clock").textContent = clock(world.city.time);
  $("cars").textContent = world.cars.length;
  $("queues").textContent = `${Math.floor(world.passengers)} / ${Math.floor(world.freight)}`;
  $("bd").textContent = last.length ? `${sum("births")} / ${sum("deaths")}` : "-";
  // per car on the road, so a growing city does not look like a careless one
  const carHours = last.reduce((a, r) => a + r.cars, 0) / 6;
  $("crashRate").textContent = carHours ? `${(sum("crashes") / carHours).toFixed(1)} / ${(sum("trips") / carHours).toFixed(1)}` : "-";
  $("cash").textContent = (world.cars.reduce((a, d) => a + d.cash, 0) / Math.max(1, world.cars.length)).toFixed(1);
  $("maxgen").textContent = Math.max(0, ...world.cars.map((d) => d.generation));
  $("nspecies").textContent = world.species.length;
  if (world.crowd) {
    const ped = last.filter((r) => r.ped), x = ped.reduce((a, r) => a + r.ped.crossings, 0), h = ped.reduce((a, r) => a + r.ped.hit, 0);
    $("peds").textContent = `${world.crowd.people.length} / ${x ? ((100 * h) / x).toFixed(1) : "-"}`;
  } else $("peds").textContent = "-";
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
  if (editing) {
    const { edge, dist } = world.city.nearestEdge(wx, wy);
    if (edge && dist < edge.hw + 6) { world.city.toggleClosed(edge); world.cityEdited(); }
    return;
  }
  let best = null, bd = 20 / cam.k + 10;
  for (const d of world.cars) {
    const dd = Math.hypot(d.x - wx, d.y - wy);
    if (dd < bd) { bd = dd; best = d; }
  }
  selected = best;
}, (wx, wy) => {
  // in edit mode a drag that starts on a junction builds a road
  if (!editing) return null;
  const { node, dist } = world.city.nearestNode(wx, wy);
  if (!node || dist > node.r + 8) return null;
  draft = { from: node, x: wx, y: wy };
  return {
    move(x, y) { draft.x = x; draft.y = y; },
    end(x, y) {
      const { node: to, dist: d } = world.city.nearestNode(x, y);
      if (to && d < to.r + 12) world.build(node.id, to.id);
      draft = null;
    },
  };
});
view.addEventListener("dblclick", () => { cam.fitted = false; follow = false; $("follow").dataset.on = false; });

$("play").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause" : "Play"; };
for (const b of document.querySelectorAll("[data-speed]")) {
  b.onclick = () => {
    speed = +b.dataset.speed;
    document.querySelectorAll("[data-speed]").forEach((x) => (x.dataset.on = x === b));
  };
}
$("director").onclick = (e) => {
  director = !director;
  e.target.dataset.on = director;
  nextCut = 0;
  if (!director) { follow = false; $("follow").dataset.on = false; selected = null; }
};
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
    syncUrl();
  };
}
for (const b of document.querySelectorAll("[data-size]")) {
  b.onclick = () => {
    size = b.dataset.size;
    document.querySelectorAll("[data-size]").forEach((x) => (x.dataset.on = x === b));
    reset(world.seed);
    syncUrl();
  };
}
// Growing keeps the camera where it was, so you can watch the new blocks fill.
$("grow-east").onclick = () => world.grow("east");
$("grow-south").onclick = () => world.grow("south");
function adoptEco(w) {
  world = w;
  control = world.control; size = world.size || "small"; graph = world.graph || null;
  document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x.dataset.control === control));
  document.querySelectorAll("[data-size]").forEach((x) => (x.dataset.on = x.dataset.size === size));
  $("peds-on").dataset.on = !!world.crowd;
  selected = null; cam.fitted = false;
}

// The whole ecosystem, wallets, families, edits and all, as one file.
$("save").onclick = () => {
  const blob = new Blob([JSON.stringify(world)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gridlock-eco-seed${world.seed}-day${(world.tick / 86400).toFixed(1)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$("load").onclick = () => $("loadFile").click();

// A city that has already run for forty days: lineages ninety generations
// deep, and the small, cheap cars forty days of the economy bred.
$("mature").onclick = async () => {
  try {
    const r = await fetch("docs/eco-day40.json");
    adoptEco(EcoWorld.fromJSON(await r.json()));
  } catch (err) { alert(`Could not load it: ${err.message}`); }
};
$("loadFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    adoptEco(EcoWorld.fromJSON(JSON.parse(await f.text())));
  } catch (err) { alert(`Not a gridlock ecosystem: ${err.message}`); }
  e.target.value = "";
};
$("peds-on").onclick = (e) => {
  world.crowd = world.crowd ? null : new Crowd(world.city, new Rng(world.seed * 7 + 1), 40);
  e.target.dataset.on = !!world.crowd;
};
$("edit").onclick = (e) => {
  editing = !editing;
  e.target.dataset.on = editing;
  $("editHint").hidden = !editing;
  view.style.cursor = editing ? "crosshair" : "";
};
$("again").onclick = () => { reset(Math.floor(Math.random() * 9999) + 1); syncUrl(); };

// A day of city time in a worker. The live world carries on meanwhile; when
// the worker is done its world replaces this one, a day older.
let worker = null;
$("ffDay").onclick = (e) => {
  if (worker) return;
  const btn = e.target;
  worker = new Worker(new URL("./ffworker.js", import.meta.url), { type: "module" });
  worker.onmessage = (m) => {
    if (m.data.done) {
      world = EcoWorld.fromJSON(m.data.world);
      world.city.heat = m.data.heat;   // the skipped day stays on the heatmap
      selected = null;
      worker.terminate(); worker = null;
      btn.textContent = "Fast-forward a day";
      return;
    }
    btn.textContent = `Fast-forwarding ${Math.round(m.data.progress * 100)}%`;
  };
  worker.postMessage({ world: JSON.parse(JSON.stringify(world)), heat: world.city.heatGrid(), ticks: 24 * 60 * 60 });
};

// The city is its seed and its junction control; a link is enough to share it.
function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set("seed", world.seed);
  u.searchParams.set("control", control);
  u.searchParams.set("size", size);
  if (graph) u.searchParams.set("map", new URLSearchParams(location.search).get("map"));
  history.replaceState(null, "", u);
}
$("share").onclick = async (e) => {
  syncUrl();
  try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
  catch { e.target.textContent = "Copy the address bar"; }
  setTimeout(() => (e.target.textContent = "Copy link"), 1500);
};
window.addEventListener("resize", layout);

window.gridlock = { get world() { return world; }, cam };

// Where the cars crash and where they crawl, since this city was built or
// last changed shape.
const HEAT_MODES = ["off", "crashes", "congestion"];
let heatMode = 0;
$("heat").onclick = (e) => {
  heatMode = (heatMode + 1) % HEAT_MODES.length;
  e.target.dataset.on = heatMode > 0;
  e.target.textContent = `Heatmap: ${HEAT_MODES[heatMode]}`;
};
announceToggles();
shortcuts({ space: "#play", 1: '[data-speed="1"]', 2: '[data-speed="4"]', 3: '[data-speed="16"]', 4: '[data-speed="64"]', f: "#follow", d: "#director", s: "#rays", c: "#colour", e: "#edit", h: "#heat" });
layout();
// Founders come from the trained drivers if they are there, from scratch if
// not (which works, it just takes a long time to get anywhere).
// Founders: the drivers raised without signals, and if they were shipped,
// the ones raised under lights and on roundabouts, for a city run that way.
// Only the sets this page needs right now are waited for; the rest load in
// the background, ready for when the junction control is changed.
const FOUNDER_FILES = { none: "trained", lights: "trained-lights", roundabouts: "trained-roundabouts" };
const loadFounders = (c) => fetch(`docs/${FOUNDER_FILES[c]}.json`)
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { if (j) founders[c] = Population.fromJSON(j.pop); })
  .catch(() => { /* that set is missing: fall back to the others */ });
const params = new URLSearchParams(location.search);
if (["small", "medium", "large"].includes(params.get("size"))) {
  size = params.get("size");
  document.querySelectorAll("[data-size]").forEach((x) => (x.dataset.on = x.dataset.size === size));
}
// ?map=turin drives on maps/turin.json, a real street map
if (/^[a-z0-9-]+$/.test(params.get("map") || "")) {
  try {
    const r = await fetch(`maps/${params.get("map")}.json`);
    if (r.ok) graph = await r.json();
  } catch { /* fall back to a generated city */ }
}
if (["none", "lights", "roundabouts"].includes(params.get("control"))) {
  control = params.get("control");
  document.querySelectorAll("[data-control]").forEach((x) => (x.dataset.on = x.dataset.control === control));
}
await Promise.all([loadFounders("none"), control !== "none" ? loadFounders(control) : null]);
for (const c of Object.keys(FOUNDER_FILES)) if (!founders[c]) loadFounders(c);
reset(+params.get("seed") || 3);
frame();
