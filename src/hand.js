// A hand-written driver in the shape of a brain: the third arm of Study 2,
// drivers that cannot evolve. It is a Genome with no connections, so the
// economy's species, distance and save code run over it unchanged; mutate()
// leaves it alone and a clone is the same object.
//
// Pure pursuit on the route target (steer at the heading error), slow for
// the next turn and for a wide heading error, brake for a car that is close
// and closing on the middle rays or a wall right ahead.
import { Genome, Innovations } from "./genome.js";
import { N_RAYS, N_INPUTS, N_OUTPUTS } from "./driver.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const MID = N_RAYS >> 1, K = N_RAYS * 3;    // input layout: wall, car, closing per ray, then v, heading, lateral, dist, turn, light

export class HandBrain extends Genome {
  constructor() { super(N_INPUTS, N_OUTPUTS); this.hand = true; }

  activate(inp, out) {
    const v = inp[K], err = inp[K + 1], dist = inp[K + 3], turn = inp[K + 4], light = inp[K + 5];
    let target = 0.8 - 0.5 * Math.abs(err) * 3;
    if (dist < 0.4) target = Math.min(target, 0.75 - 0.6 * turn);
    if (light < 0) target = Math.min(target, dist * 2);
    for (let i = Math.max(0, MID - 1); i <= Math.min(N_RAYS - 1, MID + 1); i++) {
      const wall = inp[i * 3], car = inp[i * 3 + 1], closing = inp[i * 3 + 2];
      target = Math.min(target, wall * 1.2, car * 1.5 + (closing > 0 ? -closing : 0));
    }
    out[0] = clamp(err * 1.5, -1, 1);
    out[1] = clamp((Math.max(0.05, target) - v) * 4, -1, 1);
  }

  clone() { return this; }
  toJSON() { return { hand: 1 }; }
  static fromJSON() { return new HandBrain(); }
  // what EcoWorld takes as `founders`
  static founders() { return { genomes: [new HandBrain()], innov: new Innovations(N_INPUTS + 1 + N_OUTPUTS) }; }
}
Genome.Hand = HandBrain;    // so Genome.fromJSON can rebuild one from a save
