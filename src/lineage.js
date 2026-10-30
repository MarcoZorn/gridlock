// The generation page's lineage card: the leader's ancestors, one bar per
// generation, as far back as the population remembers (Population.lineage).
// Bar height is the ancestor's fitness, colour its species, a dot on top marks
// a child of two parents (crossover); the last bar, the leader itself, is outlined.
// No imports: render.js needs a DOM, and describe() is tested in node. The page passes
// its own species colour.

// the current generation is not speciated until it breeds: until then a genome
// takes its first parent's species
const speciesOf = (chain, i) => { for (; i >= 0; i--) if (chain[i].species != null) return chain[i].species; return null; };

// the words under the card: species, parents and how far back the line goes
export function describe(chain) {
  const me = chain.at(-1);
  if (!me) return "-";
  const how = !me.parents.length ? "from the first generation" : me.parents.length > 1 ? "child of two parents (crossover)" : "copy of one parent, mutated";
  const sp = speciesOf(chain, chain.length - 1), est = me.species == null && sp != null ? " (its parent's)" : "";
  return `species ${sp ?? "?"}${est}, ${how}, ${chain.length - 1} generations of ancestors known`;
}

export function drawLineage(ctx, W, H, chain, leaderFitness, colour) {
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "#232733"; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  if (!chain.length) return;
  const fit = chain.map((a, i) => (i === chain.length - 1 && a.fitness == null ? leaderFitness : a.fitness) || 0);
  const top = Math.max(1, ...fit), slot = (W - 8) / chain.length;
  chain.forEach((a, i) => {
    const h = Math.max(2, (H - 14) * Math.max(0, fit[i]) / top), x = 4 + slot * i;
    ctx.fillStyle = colour(speciesOf(chain, i) ?? 0);
    ctx.fillRect(x, H - 3 - h, Math.max(1, slot - 1), h);
    if (a.parents.length > 1) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x + Math.max(0, slot / 2 - 1.5), H - 3 - h - 4, 3, 3); }
  });
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  ctx.strokeRect(4 + slot * (chain.length - 1) - 0.5, 1.5, Math.max(1, slot - 1) + 1, H - 3);
}
