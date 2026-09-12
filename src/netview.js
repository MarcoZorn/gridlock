// Draws the leader's brain. This is the part people actually stare at: you can
// watch a connection appear, and a few generations later watch the car start
// using it.
export function drawNetwork(ctx, g, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (!g) return;

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

  for (const c of g.conns.values()) {
    if (!c.on) continue;
    const a = pos.get(c.inId), b = pos.get(c.outId);
    if (!a || !b) continue;
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

  const colour = { input: "#6ea8ff", bias: "#8b7cf6", hidden: "#e8c46a", output: "#ff8a5c" };
  for (const [, p] of pos) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.kind === "hidden" ? 4 : 5.5, 0, Math.PI * 2);
    ctx.fillStyle = colour[p.kind] || "#999";
    ctx.fill();
  }
}
