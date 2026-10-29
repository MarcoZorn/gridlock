// Draws the leader's brain. This is the part people actually stare at: you can
// watch a connection appear, and a few generations later watch the car start
// using it. With `live` ({ inputs, mouse }) the neurons light up with what the
// car is feeling right now, and the one under the mouse is traced: its value,
// and the three connections into it that are pushing hardest. Click it to
// mute it, scroll over it to turn it up or down (editNeuron).
const RAY = ["far left", "left", "ahead", "right", "far right"];
const NAMES = [...RAY.flatMap((r) => [`wall ${r}`, `car ${r}`, `closing ${r}`]), "own speed", "heading error", "sideways", "junction", "next turn", "light"];
const OUT = ["steer", "throttle"];
const scratch = new Float64Array(8);

// Where each neuron sits: inputs on the left, outputs on the right, hidden
// neurons by depth between.
function layout(g, w, h) {
  const pad = 18;
  const byDepth = new Map();
  for (const n of g.nodes.values()) {
    const d = n.depth;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const pos = new Map();
  for (const d of depths) {
    const col = byDepth.get(d).sort((a, b) => a.id - b.id);
    const x = pad + d * (w - pad * 2);
    col.forEach((n, i) => {
      const y = col.length === 1 ? h / 2 : pad + (i * (h - pad * 2)) / (col.length - 1);
      pos.set(n.id, { x, y, kind: n.kind });
    });
  }
  return pos;
}

const nearest = (pos, m) => {
  let best = 9, id = null;
  for (const [k, p] of pos) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < best) { best = d; id = k; } }
  return id;
};
export const neuronAt = (g, w, h, m) => (g ? nearest(layout(g, w, h), m) : null);

// Editing by hand. "mute" cuts a neuron's outgoing connections (again: puts
// them back); "up"/"down" scale them by a tenth. An output has no outgoing
// connections, so for it both act on the incoming ones.
export function editNeuron(g, id, op) {
  const n = g.nodes.get(id);
  if (!n) return;
  const out = n.kind === "output", mine = [...g.conns.values()].filter((c) => (out ? c.outId : c.inId) === id);
  if (op === "mute") {
    const muted = mine.filter((c) => c.muted);
    if (muted.length) for (const c of muted) { c.on = true; c.muted = false; }
    else for (const c of mine) if (c.on) { c.on = false; c.muted = true; }
  } else for (const c of mine) c.w *= op === "up" ? 1.1 : 1 / 1.1;
  g.dirty();
}

export function drawNetwork(ctx, g, w, h, live = null) {
  ctx.clearRect(0, 0, w, h);
  if (!g) return;
  const pos = layout(g, w, h);

  // live values: re-run the brain on the car's last inputs (same inputs, same
  // values, so the car's own state is untouched)
  let val = null;
  if (live?.inputs) {
    g.activate(live.inputs, scratch);
    const { buf, slot } = g._net;
    val = (id) => buf[slot.get(id) ?? buf.length - 1];
  }
  const hover = live?.mouse ? nearest(pos, live.mouse) : null;

  const into = [];
  for (const c of g.conns.values()) {
    if (!c.on) continue;
    const a = pos.get(c.inId), b = pos.get(c.outId);
    if (!a || !b) continue;
    const lit = hover === null || c.outId === hover || c.inId === hover;
    if (c.outId === hover) into.push(c);
    ctx.globalAlpha = lit ? 1 : 0.12;
    ctx.strokeStyle = c.w >= 0 ? "rgba(90,200,160,0.75)" : "rgba(232,110,100,0.75)";
    ctx.lineWidth = Math.min(3, 0.4 + Math.abs(c.w) * 0.5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // Bow the edges so parallel connections between the same two layers stay
    // visually separable instead of collapsing into one thick line.
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - (b.y - a.y) * 0.12;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const colour = { input: "#6ea8ff", bias: "#8b7cf6", hidden: "#e8c46a", output: "#ff8a5c" };
  for (const [id, p] of pos) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === "hidden" ? 4 : 5.5, 0, Math.PI * 2);
    ctx.fillStyle = colour[p.kind] || "#999";
    // dim when quiet, full when the neuron is driving hard either way
    ctx.globalAlpha = val ? 0.25 + 0.75 * Math.min(1, Math.abs(val(id))) : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (id === hover) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  if (hover === null) return;
  const name = (id) => {
    const n = g.nodes.get(id);
    if (n.kind === "input") return NAMES[id] || `input ${id}`;
    if (n.kind === "bias") return "bias";
    if (n.kind === "output") { const k = g.outIds.indexOf(id); return OUT[k] || `out ${k}`; }
    return `hidden ${id}`;
  };
  const muted = [...g.conns.values()].some((c) => c.muted && (c.inId === hover || c.outId === hover));
  const lines = [`${name(hover)}${val ? ` ${val(hover).toFixed(2)}` : ""}${muted ? " (muted)" : ""}`];
  if (val) {
    into.sort((a, b) => Math.abs(b.w * val(b.inId)) - Math.abs(a.w * val(a.inId)));
    for (const c of into.slice(0, 3)) { const x = c.w * val(c.inId); lines.push(`${x >= 0 ? "+" : ""}${x.toFixed(2)} from ${name(c.inId)}`); }
  }
  const p = pos.get(hover);
  ctx.font = "11px system-ui, sans-serif";
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10, th = lines.length * 14 + 6;
  // beside the neuron, on whichever side has room, never over it
  const bx = p.x + 10 + tw <= w ? p.x + 10 : Math.max(2, p.x - 10 - tw), by = Math.min(h - th - 2, Math.max(2, p.y - th / 2));
  ctx.fillStyle = "rgba(10,12,16,0.88)";
  ctx.fillRect(bx, by, tw, th);
  ctx.fillStyle = "#e6e6e6";
  lines.forEach((l, i) => ctx.fillText(l, bx + 5, by + 15 + i * 14));
}
