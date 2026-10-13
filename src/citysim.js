// Browser front end for the city: run it, draw it, pan and zoom, inspect a car.
import { CityWorld } from "./cityworld.js";
import { BODY, rayAngles } from "./driver.js";
import { LANE_W } from "./city.js";
import { drawNetwork } from "./netview.js";
import { drawSparkline } from "./sparkline.js";

const ANGLES = rayAngles();
const $ = (id) => document.getElementById(id);
const view = $("view"), vctx = view.getContext("2d");
const brain = $("brain"), bctx = brain.getContext("2d");
const spark = $("spark"), sctx = spark.getContext("2d");

let world, running = true, speed = 1, showRays = true, showAll = true, follow = false;
let pending = 0, selected = null;
const cam = { x: 0, y: 0, k: 1, fitted: false };

function fitCanvas(c, cssW, cssH) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = cssW * dpr; c.height = cssH * dpr;
  c.style.width = cssW + "px"; c.style.height = cssH + "px";
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

function layout() {
  const w = Math.max(320, Math.floor(view.parentElement.getBoundingClientRect().width - 20));
  fitCanvas(view, w, Math.round(w * 0.66));
  const bw = brain.parentElement.getBoundingClientRect().width - 28;
  fitCanvas(brain, bw, 170);
  fitCanvas(spark, bw, 60);
  cam.fitted = false;
}

function fitCam() {
  const c = world.city;
  cam.k = Math.min(view.clientWidth / c.w, view.clientHeight / c.h) * 0.98;
  cam.x = c.w / 2; cam.y = c.h / 2;
  cam.fitted = true;
}

function reset(seed) {
  world = new CityWorld({ seed, popSize: 120 });
  selected = null;
  cam.fitted = false;
  $("seed").textContent = seed;
}

const toWorld = (sx, sy) => [(sx - view.clientWidth / 2) / cam.k + cam.x, (sy - view.clientHeight / 2) / cam.k + cam.y];

// Roads are drawn the way they were baked: a fat round-capped stroke per edge
// and a disc per junction apron, so the picture and the collision mask agree.
function drawCity(c, k) {
  vctx.lineCap = "round";
  for (const pass of [0, 1]) {
    vctx.strokeStyle = vctx.fillStyle = pass ? "#1b1d24" : "rgba(255,255,255,0.16)";
    const grow = pass ? 0 : 1.5 / k;
    for (const e of c.edges) {
      const a = c.nodes[e.a], b = c.nodes[e.b];
      vctx.lineWidth = (e.hw + 2) * 2 + grow * 2;
      vctx.beginPath(); vctx.moveTo(a.x, a.y); vctx.lineTo(b.x, b.y); vctx.stroke();
    }
    for (const n of c.nodes) {
      vctx.beginPath(); vctx.arc(n.x, n.y, n.r + grow, 0, Math.PI * 2); vctx.fill();
    }
  }
  // Lane markings stop short of the junction aprons, as painted ones do.
  vctx.lineCap = "butt";
  for (const e of c.edges) {
    const a = c.nodes[e.a], b = c.nodes[e.b];
    const ux = (b.x - a.x) / e.len, uy = (b.y - a.y) / e.len;
    const nx = -uy, ny = ux;
    const s0 = a.r, s1 = e.len - b.r;
    if (s1 <= s0) continue;
    const line = (off, dash, col) => {
      vctx.setLineDash(dash);
      vctx.strokeStyle = col;
      vctx.lineWidth = 1.2 / k;
      vctx.beginPath();
      vctx.moveTo(a.x + ux * s0 + nx * off, a.y + uy * s0 + ny * off);
      vctx.lineTo(a.x + ux * s1 + nx * off, a.y + uy * s1 + ny * off);
      vctx.stroke();
    };
    if (e.lanes > 1) line(0, [], "rgba(232,196,106,0.35)");
    else line(0, [6, 8], "rgba(255,255,255,0.18)");
    for (let l = 1; l < e.lanes; l++) {
      line(l * LANE_W, [5, 9], "rgba(255,255,255,0.14)");
      line(-l * LANE_W, [5, 9], "rgba(255,255,255,0.14)");
    }
  }
  vctx.setLineDash([]);
}

function drawRoute(d, k) {
  const n = world.city.nodes;
  vctx.strokeStyle = "rgba(110,168,255,0.55)";
  vctx.lineWidth = 3 / k;
  vctx.lineJoin = "round";
  vctx.beginPath();
  vctx.moveTo(d.x, d.y);
  for (let i = d.seg + 1; i < d.route.length; i++) vctx.lineTo(n[d.route[i]].x, n[d.route[i]].y);
  vctx.stroke();
  const end = n[d.route[d.route.length - 1]];
  vctx.fillStyle = "#6ea8ff";
  vctx.beginPath(); vctx.arc(end.x, end.y, 5, 0, Math.PI * 2); vctx.fill();
  if (d.tx !== undefined) {
    vctx.fillStyle = "#e8c46a";
    vctx.beginPath(); vctx.arc(d.tx, d.ty, 2.5, 0, Math.PI * 2); vctx.fill();
  }
}

function drawRays(d, k) {
  vctx.lineWidth = 1 / k;
  for (let i = 0; i < ANGLES.length; i++) {
    const ang = d.a + ANGLES[i];
    const car = d.carRay[i] < d.wallRay[i];
    const r = car ? d.carRay[i] : d.wallRay[i];
    vctx.strokeStyle = car ? "rgba(255,138,92,0.7)" : "rgba(110,168,255,0.4)";
    vctx.beginPath();
    vctx.moveTo(d.x, d.y);
    vctx.lineTo(d.x + Math.cos(ang) * r, d.y + Math.sin(ang) * r);
    vctx.stroke();
  }
}

function drawCar(d, colour, alpha) {
  vctx.save();
  vctx.translate(d.x, d.y);
  vctx.rotate(d.a);
  vctx.globalAlpha = alpha;
  vctx.fillStyle = d.towing > 0 ? "#e86e64" : colour;
  vctx.fillRect(-BODY.len / 2, -BODY.wid / 2, BODY.len, BODY.wid);
  vctx.fillStyle = "rgba(0,0,0,0.35)";
  vctx.fillRect(BODY.len * 0.1, -BODY.wid / 2 + 0.8, BODY.len * 0.22, BODY.wid - 1.6);
  vctx.restore();
}

function draw() {
  if (!cam.fitted) fitCam();
  const focus = selected && selected.alive ? selected : world.leader();
  if (follow && focus) { cam.x += (focus.x - cam.x) * 0.15; cam.y += (focus.y - cam.y) * 0.15; }

  const W = view.clientWidth, H = view.clientHeight, k = cam.k;
  vctx.clearRect(0, 0, W, H);
  vctx.save();
  vctx.translate(W / 2, H / 2);
  vctx.scale(k, k);
  vctx.translate(-cam.x, -cam.y);

  drawCity(world.city, k);
  if (focus) drawRoute(focus, k);
  if (showAll) {
    for (const d of world.cars) {
      if (d === focus || !d.alive) continue;
      drawCar(d, "#5a6a8a", 0.8);
    }
  }
  if (focus) {
    if (showRays && focus.alive) drawRays(focus, k);
    drawCar(focus, selected ? "#6ea8ff" : "#ff8a5c", 1);
  }
  vctx.restore();

  drawNetwork(bctx, focus ? focus.genome : null, brain.clientWidth, brain.clientHeight);
  drawSparkline(sctx, world.history, spark.clientWidth, spark.clientHeight);

  let alive = 0, trips = 0, crashes = 0;
  for (const d of world.cars) { if (d.alive) alive++; trips += d.trips; crashes += d.crashes; }
  const last = world.history[world.history.length - 1];
  $("gen").textContent = world.pop.generation;
  $("city").textContent = `${world.pop.generation % world.cities.length + 1} of ${world.cities.length}`;
  $("alive").textContent = `${alive}/${world.cars.length}`;
  $("tick").textContent = pending > 0 ? `fast-forward ${pending}` : `${Math.round((world.tick / world.ticksPerGen) * 100)}%`;
  $("trips").textContent = trips;
  $("crashes").textContent = crashes;
  $("species").textContent = world.pop.species.length || "-";
  $("best").textContent = last ? Math.round(last.best) : "-";
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

// Pan by dragging, zoom about the cursor, click without dragging to select.
let drag = null;
view.addEventListener("pointerdown", (e) => {
  view.setPointerCapture(e.pointerId);
  drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
});
view.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; view.classList.add("dragging"); }
  if (drag.moved) { cam.x = drag.cx - dx / cam.k; cam.y = drag.cy - dy / cam.k; }
});
view.addEventListener("pointerup", (e) => {
  view.classList.remove("dragging");
  if (drag && !drag.moved) {
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    let best = null, bd = 20 / cam.k + BODY.len;
    for (const d of world.cars) {
      if (!d.alive) continue;
      const dd = Math.hypot(d.x - wx, d.y - wy);
      if (dd < bd) { bd = dd; best = d; }
    }
    selected = best;
  }
  drag = null;
});
view.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [wx, wy] = toWorld(e.offsetX, e.offsetY);
  cam.k = Math.max(0.2, Math.min(12, cam.k * Math.exp(-e.deltaY * 0.0015)));
  const [nx, ny] = toWorld(e.offsetX, e.offsetY);
  cam.x += wx - nx; cam.y += wy - ny;
}, { passive: false });
view.addEventListener("dblclick", () => { cam.fitted = false; follow = false; $("follow").dataset.on = false; });

$("play").onclick = (e) => { running = !running; e.target.textContent = running ? "Pause" : "Play"; };
$("skip").onclick = () => { pending += 1; };
$("jump").onclick = () => { pending += 25; };
$("again").onclick = () => { pending = 0; reset(Math.floor(Math.random() * 9999) + 1); };
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

layout();
reset(3);
frame();
