// 95% interval of the mean, by resampling the seeds (a deterministic stream).
export function bootstrap(xs, reps = 4000) {
  let r = 12345;
  const rnd = () => ((r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const means = [];
  for (let k = 0; k < reps; k++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)]; means.push(s / xs.length); }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)], means[Math.floor(0.975 * reps)]];
}
