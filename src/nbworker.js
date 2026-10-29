// The notebook's engine: runs the page's code off the main thread, with the
// simulator in scope, and sends back whatever it logs. A cell is the body of
// an async function, so it can await; Stop on the page ends the worker.
import { EcoWorld, ECON, DAY, gini } from "./ecoworld.js";
import { CityWorld, DT } from "./cityworld.js";
import { Population, Rng } from "./neat.js";
import { BODY } from "./driver.js";

const base = new URL("../", import.meta.url);
const map = async (name) => (await fetch(new URL(`maps/${name}.json`, base))).json();
let trained = null;
const founders = async () => Population.fromJSON((trained ??= await (await fetch(new URL("docs/trained.json", base))).json()).pop);
const show = (x) => (typeof x === "string" ? x : JSON.stringify(x));
const log = (...a) => self.postMessage({ log: a.map(show).join(" ") });

self.onmessage = async (e) => {
  const ECON0 = { ...ECON };
  try {
    const cell = new Function("EcoWorld", "CityWorld", "ECON", "BODY", "DAY", "DT", "Population", "Rng", "gini", "map", "founders", "log",
      `return (async () => {\n${e.data.code}\n})();`);
    const out = await cell(EcoWorld, CityWorld, ECON, BODY, DAY, DT, Population, Rng, gini, map, founders, log);
    if (out !== undefined) log(out);
    self.postMessage({ done: true });
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err) });
  }
  Object.assign(ECON, ECON0);   // the next run starts from the defaults
};
