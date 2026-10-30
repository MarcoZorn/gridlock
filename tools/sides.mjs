// Which side of the road do the cars of many runs keep to? For each run, over
// one city day (DAY, default 4: ticks in (3 days, 4 days]), the share of
// cars on two-way roads right of the middle, from the telemetry's sideRight and
// sideAll. "One side" is whichever side the run's majority keeps: its share is
// max(r, 1 - r). Prints how many runs keep one side at LEVEL (default 0.75)
// or more, with a Wilson interval, and how many of the runs keep the right
// (a coin flip would give about half, tested two-sided with the exact binomial).
//
//   node tools/sides.mjs "runs/trial-turin-base-d6-s{s}"      (seeds 101..; SEEDS=20 DAY=4 LEVEL=0.75)
import fs from "node:fs";

export const wilson = (k, n) => { const z = 1.96, p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = (z / (1 + z * z / n)) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [c - h, c + h]; };

// two-sided exact binomial p-value for k of n at p = 1/2
export function binomial(k, n) {
  const c = (j) => { let r = 1; for (let i = 1; i <= j; i++) r = r * (n - j + i) / i; return r; };
  const pr = (j) => c(j) / 2 ** n;
  let p = 0; for (let j = 0; j <= n; j++) if (pr(j) <= pr(k) + 1e-12) p += pr(j);
  return Math.min(1, p);
}

export function share(dir, day) {
  const rows = fs.readFileSync(`${dir}/telemetry.jsonl`, "utf8").trim().split("\n").map(JSON.parse).filter((x) => x.tick > (day - 1) * 86400 && x.tick <= day * 86400);
  const all = rows.reduce((a, x) => a + x.sideAll, 0), right = rows.reduce((a, x) => a + x.sideRight, 0);
  return all ? right / all : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pat = process.argv[2], n = +(process.env.SEEDS || 20), day = +(process.env.DAY || 4), level = +(process.env.LEVEL || 0.75);
  const rs = [];
  for (let i = 0; i < n; i++) { const d = pat.replace("{s}", 101 + i); if (fs.existsSync(`${d}/telemetry.jsonl`)) { const r = share(d, day); if (r !== null) rs.push(r); } }
  const one = rs.map((r) => Math.max(r, 1 - r)), keep = one.filter((x) => x >= level).length, right = rs.filter((r) => r > 0.5).length;
  const [lo, hi] = wilson(keep, rs.length);
  console.log(`${pat}, day ${day}: ${rs.length} runs; share on the majority side per run: ${one.map((x) => x.toFixed(2)).join(" ")}`);
  console.log(`  ${keep} of ${rs.length} keep one side at ${level} or more (Wilson 95% [${(100 * lo).toFixed(0)}%, ${(100 * hi).toFixed(0)}%]); ${right} of ${rs.length} keep the right (exact binomial p ${binomial(right, rs.length).toFixed(3)})`);
}
