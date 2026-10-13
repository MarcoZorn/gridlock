// One wave of a traffic generation, on a worker thread (headless runs only).
// Gets the world as it stands at the start of the generation and a wave
// number, runs that wave, and hands back what CityWorld.mergeWaves needs.
import { parentPort } from "node:worker_threads";
import { CityWorld } from "./cityworld.js";

parentPort.on("message", ({ id, world, k }) => {
  const w = CityWorld.fromJSON(JSON.parse(world));
  parentPort.postMessage({ id, result: w.runWave(k) });
});
