// The second genome: what the car is, as opposed to how it drives.
//
// Every trait is a number in [0, 1] and the physics is derived from them, so
// nothing about a body is free. A bigger engine accelerates harder and burns
// more. Cargo space earns on freight and makes you heavy. Long sensors see
// trouble sooner and cost upkeep. Whatever mix survives is whatever the city
// pays for, which is the point.
import { BODY } from "./driver.js";

export const TRAITS = ["length", "width", "engine", "brakes", "range", "rays", "cargo", "jam"];

const lerp = (a, b, t) => a + (b - a) * t;
// genes that come out as the standard week-1 car: 10 x 5, ~170 accel, 120 range
const STOCK = { length: 0.17, width: 0.33, engine: 0.47, brakes: 0.5, range: 0.43, rays: 0.8, cargo: 0.1, jam: 0 };

export class Body {
  constructor(genes) {
    // { trait: 0..1 }; saves from before a trait existed get its stock value
    this.genes = { ...STOCK, ...genes };
    this.derive();
  }

  // Something close to the stock car of week 1, give or take a little, so the
  // first generation of an ecosystem can already drive.
  static stock(rng) {
    const g = {};
    for (const t of TRAITS) g[t] = Math.max(0, Math.min(1, STOCK[t] + rng.normal() * 0.03));
    return new Body(g);
  }

  // Anything at all. Founders are half stock cars and half these, because a
  // truck is a long walk from a stock car through bodies that earn nothing
  // extra on the way; evolution only gets to choose among what exists.
  static random(rng) {
    const g = {};
    for (const t of TRAITS) g[t] = rng.next();
    return new Body(g);
  }

  derive() {
    const g = this.genes;
    const len = lerp(8, 20, g.length);
    const wid = lerp(4, 7, g.width);
    const cargo = g.cargo;                       // share of the hull that carries goods
    const mass = (len * wid) / 50 * (1 + cargo * 1.5);
    const engine = lerp(0.6, 1.6, g.engine);
    // Acceleration is engine over mass. Top speed rises with engine, falls
    // with frontal area and load. Long vehicles turn slower.
    this.p = {
      ...BODY,
      len, wid, mass,
      accel: BODY.accel * engine / Math.sqrt(mass),
      brake: BODY.brake * lerp(0.6, 1.4, g.brakes) / Math.sqrt(mass),
      maxSpeed: BODY.maxSpeed * Math.pow(engine, 0.35) / (1 + cargo * 0.35) * Math.pow(5 / wid, 0.15),
      turnRate: BODY.turnRate * Math.sqrt(10 / len),
      rayRange: lerp(60, 200, g.range),
      rays: g.rays < 0.5 ? 3 : 5,
    };
    this.capacity = cargo * len * wid / 10;      // how much freight fits
    // Running costs per second of existing and per unit driven.
    this.upkeep = 0.02 + 0.03 * g.range * (this.p.rays === 5 ? 1 : 0.6) + 0.02 * mass;
    this.fuel = 0.0016 * mass * engine;
    // Not physics but planning: how much this driver lets traffic push its
    // route away from the shortest one. The map is free; the choice is not.
    this.jam = g.jam * 3;
  }

  mutate(rng, sigma = 0.04) {
    const g = { ...this.genes };
    for (const t of TRAITS) {
      if (rng.next() < 0.5) g[t] = Math.max(0, Math.min(1, g[t] + rng.normal() * sigma));
    }
    return new Body(g);
  }

  distance(o) {
    let d = 0;
    for (const t of TRAITS) d += (this.genes[t] - o.genes[t]) ** 2;
    return Math.sqrt(d / TRAITS.length);
  }

  toJSON() { return this.genes; }
  static fromJSON(j) { return new Body({ ...j }); }
}
