// Drawing the city and the cars on it, shared by the generations page and
// the ecosystem page. Everything here draws in world coordinates into
// whatever transform the caller has set up.
import { rayAngles } from "./driver.js";
import { LANE_W } from "./city.js";

const ANGLES = rayAngles();

export function fitCanvas(c, cssW, cssH) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = cssW * dpr; c.height = cssH * dpr;
  c.style.width = cssW + "px"; c.style.height = cssH + "px";
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Roads are drawn the way they were baked: a fat round-capped stroke per edge
// and a disc per junction apron, so the picture and the collision mask agree.
export function drawCity(ctx, c, k) {
  ctx.lineCap = "round";
  for (const pass of [0, 1]) {
    ctx.strokeStyle = ctx.fillStyle = pass ? "#1b1d24" : "rgba(255,255,255,0.16)";
    const grow = pass ? 0 : 1.5 / k;
    for (const e of c.edges) {
      const a = c.nodes[e.a], b = c.nodes[e.b];
      ctx.lineWidth = (e.hw + 2) * 2 + grow * 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of c.nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r + grow, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Lane markings stop short of the junction aprons, as painted ones do.
  ctx.lineCap = "butt";
  for (const e of c.edges) {
    const a = c.nodes[e.a], b = c.nodes[e.b];
    const ux = (b.x - a.x) / e.len, uy = (b.y - a.y) / e.len;
    const nx = -uy, ny = ux;
    const s0 = a.r, s1 = e.len - b.r;
    if (s1 <= s0) continue;
    const line = (off, dash, col) => {
      ctx.setLineDash(dash);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2 / k;
      ctx.beginPath();
      ctx.moveTo(a.x + ux * s0 + nx * off, a.y + uy * s0 + ny * off);
      ctx.lineTo(a.x + ux * s1 + nx * off, a.y + uy * s1 + ny * off);
      ctx.stroke();
    };
    if (e.lanes > 1) line(0, [], "rgba(232,196,106,0.35)");
    else line(0, [6, 8], "rgba(255,255,255,0.18)");
    for (let l = 1; l < e.lanes; l++) {
      line(l * LANE_W, [5, 9], "rgba(255,255,255,0.14)");
      line(-l * LANE_W, [5, 9], "rgba(255,255,255,0.14)");
    }
  }
  ctx.setLineDash([]);
}

// The roads never move, so they are drawn once into an offscreen canvas and
// copied each frame, and only redrawn when the view or the map changes. On a
// large city that is the difference between 40 frames a second and 60.
export function cityLayer() {
  const layer = document.createElement("canvas"), lctx = layer.getContext("2d");
  let key = "";
  return (ctx, city, cam, W, H) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const k = `${city.seed}|${city.w}x${city.h}|${city.version}|${cam.x}|${cam.y}|${cam.k}|${W}|${H}|${dpr}`;
    if (k !== key) {
      key = k;
      if (layer.width !== W * dpr || layer.height !== H * dpr) { layer.width = W * dpr; layer.height = H * dpr; }
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      lctx.translate(W / 2, H / 2);
      lctx.scale(cam.k, cam.k);
      lctx.translate(-cam.x, -cam.y);
      drawCity(lctx, city, cam.k);
    }
    ctx.drawImage(layer, 0, 0, W, H);
  };
}

// The heatmap is a tiny image, one pixel per heat cell, scaled up with
// smoothing on. Thousands of cells cost one drawImage instead of a rect each.
const heatCanvas = document.createElement("canvas"), hctx = heatCanvas.getContext("2d");
export function drawHeat(ctx, h, mode) {
  const grid = mode === 1 ? h.crash : h.slow;
  if (heatCanvas.width !== h.w || heatCanvas.height !== h.h) { heatCanvas.width = h.w; heatCanvas.height = h.h; }
  let max = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
  const img = hctx.createImageData(h.w, h.h);
  const [r, g, b] = mode === 1 ? [232, 110, 100] : [232, 196, 106];
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    // square root so a few hot spots do not wash everything else out
    const t = Math.sqrt(grid[i] / max);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(40 + 215 * t);
  }
  hctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(heatCanvas, 0, 0, h.w * h.cell, h.h * h.cell);
}

// What the selected car is feeling right now: every input to its network,
// grouped the way the network sees them.
export function drawSenses(canvas, d) {
  const nctx = canvas.getContext("2d");
  const W = canvas.clientWidth, H = canvas.clientHeight;
  nctx.clearRect(0, 0, W, H);
  if (!d) return;
  const groups = [["wall", 0, 3], ["car", 1, 3], ["closing", 2, 3]];
  const colW = W / 4, barH = 34, top = 4;
  nctx.font = "9px ui-monospace, monospace";
  nctx.textBaseline = "top";
  groups.forEach(([label, off, stride], gi) => {
    const x0 = gi * colW;
    for (let i = 0; i < 5; i++) {
      const v = d.inputs[i * stride + off];
      const bw = colW / 6, x = x0 + 4 + i * (bw + 1);
      nctx.fillStyle = "#232733";
      nctx.fillRect(x, top, bw, barH);
      nctx.fillStyle = label === "closing" ? (v > 0 ? "#e86e64" : "#5ac8a0") : "#6ea8ff";
      const hgt = label === "closing" ? Math.abs(v) * barH : (1 - v) * barH;
      nctx.fillRect(x, top + barH - hgt, bw, hgt);
    }
    nctx.fillStyle = "#8b93a7";
    nctx.fillText(label, x0 + 4, top + barH + 6);
  });
  // a brain with a memory channel shows it as a seventh bar
  const route = ["spd", "hdg", "lat", "jct", "trn", "sig", ...(d.inputs.length > 21 ? ["mem"] : [])];
  for (let i = 0; i < route.length; i++) {
    const v = d.inputs[15 + i];
    const bw = colW / 7, x = 3 * colW + 4 + i * (bw + 1);
    nctx.fillStyle = "#232733";
    nctx.fillRect(x, top, bw, barH);
    nctx.fillStyle = "#e8c46a";
    const mid = top + barH / 2, hgt = Math.max(-1, Math.min(1, v)) * barH / 2;
    if (i === 6) nctx.fillStyle = "#8b7cf6";
    if (i === 5) { nctx.fillStyle = v > 0 ? "#5ac8a0" : "#e86e64"; nctx.fillRect(x, top + barH / 2 - 4, bw, v ? 8 : 0); }
    else if (i === 0 || (i >= 3 && i < 6)) nctx.fillRect(x, top + barH - Math.abs(v) * barH, bw, Math.abs(v) * barH);
    else nctx.fillRect(x, hgt > 0 ? mid - hgt : mid, bw, Math.abs(hgt));
  }
  nctx.fillStyle = "#8b93a7";
  nctx.fillText("route", 3 * colW + 4, top + barH + 6);
}

// Roads closed by the editor: a red dashed line down the middle and a bar
// across each end.
export function drawClosures(ctx, c, k) {
  if (!c.closed || !c.closed.size) return;
  ctx.strokeStyle = "#e86e64";
  ctx.lineWidth = 2.5 / k;
  for (const id of c.closed) {
    const e = c.edges[id], a = c.nodes[e.a], b = c.nodes[e.b];
    const ux = (b.x - a.x) / e.len, uy = (b.y - a.y) / e.len;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(a.x + ux * a.r, a.y + uy * a.r); ctx.lineTo(b.x - ux * b.r, b.y - uy * b.r); ctx.stroke();
    ctx.setLineDash([]);
    for (const [n, s] of [[a, 1], [b, -1]]) {
      const cx = n.x + ux * n.r * s, cy = n.y + uy * n.r * s;
      ctx.beginPath(); ctx.moveTo(cx - uy * e.hw, cy + ux * e.hw); ctx.lineTo(cx + uy * e.hw, cy - ux * e.hw); ctx.stroke();
    }
  }
}

// A light is a short bar across each road where it meets the junction apron.
export function drawLights(ctx, c, k) {
  if (c.roundabouts) {
    for (const n of c.nodes) {
      if (!n.island) continue;
      ctx.fillStyle = "#2a3a30";
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.2 / k;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.island, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    return;
  }
  if (c.control !== "lights") return;
  ctx.lineWidth = 3 / k;
  ctx.lineCap = "butt";
  for (const n of c.nodes) {
    if (!n.light) continue;
    for (const e of n.edges) {
      const m = c.other(e, n.id), o = c.nodes[m];
      const len = Math.hypot(o.x - n.x, o.y - n.y);
      const ux = (o.x - n.x) / len, uy = (o.y - n.y) / len;
      const cx = n.x + ux * n.r, cy = n.y + uy * n.r;
      ctx.strokeStyle = c.green(n.id, m) ? "#5ac8a0" : "#e86e64";
      ctx.beginPath();
      ctx.moveTo(cx - uy * e.hw, cy + ux * e.hw);
      ctx.lineTo(cx + uy * e.hw, cy - ux * e.hw);
      ctx.stroke();
    }
  }
}

export function drawRoute(ctx, city, d, k) {
  const n = city.nodes;
  ctx.strokeStyle = "rgba(110,168,255,0.55)";
  ctx.lineWidth = 3 / k;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(d.x, d.y);
  for (let i = d.seg + 1; i < d.route.length; i++) ctx.lineTo(n[d.route[i]].x, n[d.route[i]].y);
  ctx.stroke();
  const end = n[d.route[d.route.length - 1]];
  ctx.fillStyle = "#6ea8ff";
  ctx.beginPath(); ctx.arc(end.x, end.y, 5, 0, Math.PI * 2); ctx.fill();
  if (d.tx !== undefined) {
    ctx.fillStyle = "#e8c46a";
    ctx.beginPath(); ctx.arc(d.tx, d.ty, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawRays(ctx, d, k) {
  ctx.lineWidth = 1 / k;
  for (let i = 0; i < ANGLES.length; i++) {
    const ang = d.a + ANGLES[i];
    const car = d.carRay[i] < d.wallRay[i];
    const r = car ? d.carRay[i] : d.wallRay[i];
    ctx.strokeStyle = car ? "rgba(255,138,92,0.7)" : "rgba(110,168,255,0.4)";
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + Math.cos(ang) * r, d.y + Math.sin(ang) * r);
    ctx.stroke();
  }
}

export function drawCar(ctx, d, colour, alpha) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.a);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = d.towing > 0 ? "#e86e64" : colour;
  const { len, wid } = d.p;
  ctx.fillRect(-len / 2, -wid / 2, len, wid);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(len * 0.1, -wid / 2 + 0.8, len * 0.22, wid - 1.6);
  // brake lights: the brain's throttle output is braking, and the car is
  // still moving forward. Watching who lights up at a junction is the
  // quickest way to see who is giving way to whom.
  if (d.out && d.out[1] < -0.15 && d.v > 3 && !d.towing) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff3b30";
    const w = Math.min(1.6, wid * 0.3);
    ctx.fillRect(-len / 2 - 0.6, -wid / 2 + 0.3, 1.2, w);
    ctx.fillRect(-len / 2 - 0.6, wid / 2 - 0.3 - w, 1.2, w);
  }
  ctx.restore();
}

// Pan by dragging, zoom about the cursor, and a click that did not drag is a
// pick at that world position. `cam` is { x, y, k }: the world point at the
// centre of the canvas, and the scale.
//
// `grab(wx, wy)` may claim a drag before it pans: return { move(wx, wy),
// end(wx, wy) } to take it over, or nothing to pan as usual.
export function panZoom(view, cam, onPick, grab = null) {
  const toWorld = (sx, sy) => [(sx - view.clientWidth / 2) / cam.k + cam.x, (sy - view.clientHeight / 2) / cam.k + cam.y];
  // canvas-relative position from client coordinates: offsetX is not
  // reliable across browsers and for synthetic events
  const at = (e) => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let drag = null;
  let held = null;
  // Two fingers down is a pinch: zoom by the change in their spread, about
  // their midpoint. Any drag or pick in progress is abandoned.
  const touches = new Map();
  let pinch = null;
  const spread = () => { const [a, b] = [...touches.values()]; return [Math.hypot(a[0] - b[0], a[1] - b[1]), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  view.addEventListener("pointerdown", (e) => {
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
    const [px, py] = at(e);
    touches.set(e.pointerId, [px, py]);
    if (touches.size === 2) {
      const [d] = spread();
      pinch = { d, k: cam.k };
      drag = null; held = null;
      return;
    }
    drag = { x: px, y: py, cx: cam.x, cy: cam.y, moved: false };
    held = grab ? grab(...toWorld(px, py)) : null;
  });
  view.addEventListener("pointermove", (e) => {
    const [px, py] = at(e);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, [px, py]);
    if (pinch && touches.size === 2) {
      const [d, mx, my] = spread();
      const [wx, wy] = toWorld(mx, my);
      cam.k = Math.max(0.2, Math.min(12, pinch.k * (d / Math.max(1, pinch.d))));
      const [nx, ny] = toWorld(mx, my);
      cam.x += wx - nx; cam.y += wy - ny;
      return;
    }
    if (!drag) return;
    if (held) {
      if (Math.abs(px - drag.x) + Math.abs(py - drag.y) > 4) drag.moved = true;
      held.move(...toWorld(px, py));
      return;
    }
    const dx = px - drag.x, dy = py - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; view.classList.add("dragging"); }
    if (drag.moved) { cam.x = drag.cx - dx / cam.k; cam.y = drag.cy - dy / cam.k; }
  });
  const lift = (e) => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; drag = null; held = null; return true; }
    return false;
  };
  view.addEventListener("pointercancel", lift);
  view.addEventListener("pointerup", (e) => {
    view.classList.remove("dragging");
    if (lift(e)) return;
    const [px, py] = at(e);
    if (held && drag && drag.moved) held.end(...toWorld(px, py));
    else if (drag && !drag.moved) onPick(...toWorld(px, py));
    drag = null;
    held = null;
  });
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = at(e);
    const [wx, wy] = toWorld(px, py);
    cam.k = Math.max(0.2, Math.min(12, cam.k * Math.exp(-e.deltaY * 0.0015)));
    const [nx, ny] = toWorld(px, py);
    cam.x += wx - nx; cam.y += wy - ny;
  }, { passive: false });
}

// One colour per species id, spread round the wheel by the golden angle so
// neighbouring ids never look alike.
export const speciesColour = (id, l = 62) => `hsl(${(id * 137.508) % 360}, 65%, ${l}%)`;

// Toggle buttons show their state with data-on; mirror it into aria-pressed
// so it is announced, not just coloured.
export function announceToggles(root = document) {
  const sync = (b) => { if (b.hasAttribute("data-on")) b.setAttribute("aria-pressed", b.dataset.on === "true"); };
  for (const b of root.querySelectorAll("button")) {
    sync(b);
    new MutationObserver(() => sync(b)).observe(b, { attributes: true, attributeFilter: ["data-on"] });
  }
}

// Keyboard shortcuts: each key clicks a button, so a shortcut can never do
// something the button would not. Typing in a field is left alone.
export function shortcuts(map) {
  window.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
    const sel = map[e.key === " " ? "space" : e.key.toLowerCase()];
    const b = sel && document.querySelector(sel);
    if (!b) return;
    e.preventDefault();
    b.click();
  });
  for (const [key, sel] of Object.entries(map)) {
    const b = document.querySelector(sel);
    if (b) b.title = `${b.title ? b.title + " " : ""}(${key === "space" ? "space" : key.toUpperCase()})`;
  }
}

// The director: every few seconds, the car with the most traffic within 70
// units of it. Both pages follow whatever this returns.
export function busiestCar(cars) {
  let best = null, bn = -1;
  for (const d of cars) {
    if (d.alive === false || d.towing) continue;
    let n = 0;
    for (const o of cars) if (o !== d && o.alive !== false && Math.abs(o.x - d.x) < 70 && Math.abs(o.y - d.y) < 70) n++;
    if (n > bn) { bn = n; best = d; }
  }
  return best;
}
