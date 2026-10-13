// Fast-forward off the main thread. Takes an ecosystem as JSON, runs it for
// the requested number of ticks, reports progress, and hands it back as JSON.
// The page keeps drawing the whole time; it just is not watching this copy.
import { EcoWorld } from "./ecoworld.js";

self.onmessage = (e) => {
  const { world, heat, ticks } = e.data;
  const w = EcoWorld.fromJSON(world);
  w.city.heat = heat;
  const every = Math.max(1, Math.floor(ticks / 50));
  for (let i = 0; i < ticks; i++) {
    w.step();
    if (i % every === 0) self.postMessage({ progress: i / ticks, tick: w.tick, cars: w.cars.length });
  }
  self.postMessage({ done: true, world: JSON.parse(JSON.stringify(w)), heat: w.city.heatGrid() });
};
