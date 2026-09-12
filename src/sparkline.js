export function drawSparkline(ctx, history, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (history.length < 2) return;
  const max = Math.max(...history.map((r) => r.best)) || 1;
  const line = (key, colour, fill) => {
    ctx.beginPath();
    history.forEach((r, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - (r[key] / max) * (h - 4) - 2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (fill) {
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }
  };
  line("best", "#ff8a5c", "rgba(255,138,92,0.10)");
  line("mean", "#5ac8a0", null);
}
