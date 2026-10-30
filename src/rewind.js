import { EcoWorld } from "./ecoworld.js";
// A save of the economy every city hour (3600 ticks), the last `keep` of
// them. Restores are exact, so stepping on from one retraces the same run.
export class Rewind {
  constructor(keep = 24) { this.keep = keep; this.saves = []; }
  clear() { this.saves.length = 0; }
  // call after every step: saves on the hour, once
  record(w) {
    if (w.tick % 3600 || this.saves.at(-1)?.tick === w.tick) return;
    this.saves.push({ tick: w.tick, json: JSON.stringify(w) });
    if (this.saves.length > this.keep) this.saves.shift();
  }
  // the world at the start of this city hour (or the one before, if already on the hour), or null
  back(w) {
    while (this.saves.length && this.saves.at(-1).tick >= w.tick) this.saves.pop();
    const s = this.saves.at(-1);
    return s ? EcoWorld.fromJSON(JSON.parse(s.json)) : null;
  }
}
