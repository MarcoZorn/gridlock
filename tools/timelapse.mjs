import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EcoWorld, DAY } from "../src/ecoworld.js";
import { DT } from "../src/cityworld.js";
// A time-lapse of one city day, without a browser: an economy from a
// checkpoint runs on for a day, and every few city minutes a frame is drawn
// as SVG (streets, every car a dot in its species' colour, the clock and the
// count), turned into PNG by rsvg-convert, and the frames into a GIF by
// ffmpeg.
//
//   node tools/timelapse.mjs runs/inh-base-s7/state.json docs/day.gif [minutes per frame, 10]
const [state, out = "tmp/day.gif", every = 10] = process.argv.slice(2);
const w = EcoWorld.fromJSON(JSON.parse(fs.readFileSync(state, "utf8")));
const c = w.city, tmp = fs.mkdtempSync(path.join("tmp", "lapse-"));
const xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
const x0 = Math.min(...xs) - 30, y0 = Math.min(...ys) - 30, W = Math.max(...xs) + 30 - x0, H = Math.max(...ys) + 30 - y0;
const size = 480, scale = size / Math.max(W, H);
const hue = (s) => ((s * 137.508) % 360).toFixed(0);
let streets = "";
for (const e of c.edges) {
  const a = c.nodes[e.a], b = c.nodes[e.b];
  streets += `<line x1="${((a.x - x0) * scale).toFixed(1)}" y1="${((a.y - y0) * scale).toFixed(1)}" x2="${((b.x - x0) * scale).toFixed(1)}" y2="${((b.y - y0) * scale).toFixed(1)}"/>`;
}
const perFrame = (every * 60) / DT / 60;   // a city minute is 60 ticks
const frames = (DAY / DT) / perFrame;
for (let f = 0; f < frames; f++) {
  for (let t = 0; t < perFrame; t++) w.step();
  const hour = ((w.city.time / 60) % 24 + 24) % 24, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * scale).toFixed(0)}" height="${(H * scale + 22).toFixed(0)}">`;
  svg += `<rect width="100%" height="100%" fill="#14161c"/><g stroke="#2b3040" stroke-width="${Math.max(2, 14 * scale).toFixed(1)}" stroke-linecap="round">${streets}</g>`;
  for (const d of w.cars) svg += `<circle cx="${((d.x - x0) * scale).toFixed(1)}" cy="${((d.y - y0) * scale).toFixed(1)}" r="2.2" fill="hsl(${hue(d.species)},70%,62%)"/>`;
  svg += `<text x="6" y="${(H * scale + 16).toFixed(0)}" fill="#e6e8ee" font-family="monospace" font-size="13">${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}  ${w.cars.length} cars  ${w.species.length} species</text></svg>`;
  const svgPath = path.join(tmp, `f${String(f).padStart(4, "0")}.svg`);
  fs.writeFileSync(svgPath, svg);
  execFileSync("rsvg-convert", [svgPath, "-o", svgPath.replace(/svg$/, "png")]);
}
// a palette from all the frames keeps the GIF small and the colours steady
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", path.join(tmp, "f%04d.png"), "-vf", "split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse", out]);
fs.rmSync(tmp, { recursive: true });
console.log(`${out}: ${frames} frames, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
