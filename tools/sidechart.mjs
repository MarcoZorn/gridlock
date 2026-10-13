import fs from "node:fs";
// Which side of the road an ecosystem keeps to, hour by hour: the share of
// cars on two-way roads right of the middle, one line per run.
//
//   node tools/sidechart.mjs docs/side-of-road.svg runs/a runs/b ...
const runs = process.argv.slice(3), out = process.argv[2];
const W = 640, H = 260, P = 40, DAYS = 6, cols = ["#ff8a5c", "#6aa8ff", "#7fd1a3"];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="11"><rect width="${W}" height="${H}" fill="#14161c"/>`;
const X = (d) => P + (d / DAYS) * (W - 2 * P), Y = (v) => H - P - v * (H - 2 * P);
for (const v of [0, 0.5, 1]) svg += `<line x1="${P}" x2="${W - P}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2a2d37"/><text x="4" y="${Y(v) + 4}" fill="#8b90a0">${v === 0 ? "left" : v === 1 ? "right" : "50%"}</text>`;
for (let d = 0; d <= DAYS; d++) svg += `<text x="${X(d) - 4}" y="${H - P + 16}" fill="#8b90a0">${d}</text>`;
svg += `<text x="${W / 2 - 40}" y="${H - 6}" fill="#8b90a0">city days</text>`;
runs.forEach((run, k) => {
  const rows = fs.readFileSync(`${run}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
  const pts = [];
  for (let i = 0; i + 6 <= rows.length; i += 6) {
    const h = rows.slice(i, i + 6), all = h.reduce((a, r) => a + r.sideAll, 0);
    if (all >= 50) pts.push([X(h[5].tick / 86400), Y(h.reduce((a, r) => a + r.sideRight, 0) / all)]);
  }
  svg += `<polyline fill="none" stroke="${cols[k]}" stroke-width="1.6" points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}"/>`;
  svg += `<text x="${P + 150 * k}" y="18" fill="${cols[k]}">${run.split("/").pop()}</text>`;
});
fs.writeFileSync(out, svg + "</svg>");
