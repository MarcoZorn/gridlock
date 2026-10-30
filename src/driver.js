// A car in the city. Same arcade physics as the track car, new senses.
//
// The route is coded: A* hands the car a list of junctions. Driving it is
// evolved. The brain is told which way the next waypoint is, how far off the
// road's centreline it sits, how far the junction is and which way the route
// turns there, and it gets a fan of rays that see walls and other cars. It is
// never told about lanes, right of way, or that other cars exist as a concept.
// If it learns any of that, it learned it.
// GRIDLOCK_RAYS (in Node only) tries another count, for experiments
export const N_RAYS = +(globalThis.process?.env?.GRIDLOCK_RAYS) || 5;
const PER_RAY = 3;             // wall distance, car distance, closing speed
export const N_INPUTS = N_RAYS * PER_RAY + 6;
export const N_OUTPUTS = 2;    // steering, throttle

export const BODY = {
  accel: 170, brake: 320, drag: 0.6,
  maxSpeed: 110, maxReverse: 30,
  turnRate: 3.0, minTurnSpeed: 8,
  len: 10, wid: 5,
  rayRange: 120, rayStep: 6,
  fov: Math.PI * 1.1,
  lostTicks: 240,   // moving but no route progress for this long: lost
  stuckTicks: 1800, // standing still with no progress for this long: stuck
  lookahead: 35,    // how far down the route the steering target sits
  keepLine: 1,      // 1: target keeps the car's lateral offset, 0: target on the centreline
  lane: 0,          // on a two-way road the target sits mid-way to one kerb: 1 right, -1 left
  dropSpeed: 40,    // must be this slow at the destination to deliver
  stoppedSpeed: 6,  // below this a car in a junction counts as waiting
  redFine: 0.2,     // damage-equivalent of running a red light
  wallDamage: 1,    // damage from a kerb strike, relative to hitting a car
  wrecks: 0,        // 1: a crashed car blocks the road until it is towed (an experiment)
  wreckBlame: 0,    // 1: and pays for every car that runs into it while it does
  junctionPrice: 1, // a crash inside a junction costs this many times as much
  towTicks: 120, graceTicks: 45, maxCrashes: 12, damageCost: 1,
};

// Senses that can be switched off, to see what drivers do without them (and
// what evolution does about it). Off means the input reads as empty road.
export const SENSES = { cars: true, walls: true };

// The fan follows BODY.fov, so --body fov=... changes it; a full circle
// spaces the rays evenly round instead of putting two on the same bearing.
let ANGLES = null, fanFor = null;
export const rayAngles = () => {
  if (fanFor !== BODY.fov) {
    const full = BODY.fov >= 2 * Math.PI - 1e-9;
    ANGLES = Array.from({ length: N_RAYS }, (_, i) => (full ? -Math.PI + (2 * Math.PI * i) / N_RAYS : -BODY.fov / 2 + (BODY.fov * i) / (N_RAYS - 1)));
    fanFor = BODY.fov;
  }
  return ANGLES;
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Driver {
  // `t0` is how far along the first road the car starts, so a city full of
  // cars does not begin with everyone stacked on the same junction.
  //
  // `p` is the car's physical make-up: engine, brakes, size, sensor range,
  // how many of its rays work. It defaults to the standard BODY; an evolved
  // body hands in its own. Inputs stay normalised against BODY's top speed,
  // so a number means the same thing to every brain whatever it drives.
  constructor(genome, city, route, t0 = 0, p = BODY) {
    this.genome = genome;
    this.p = p;
    this.city = city;
    this.alive = true;
    this.crashed = false;
    this.crashes = 0;
    this.damage = 0;       // sum of (impact speed / top speed) squared
    this.towing = 0;       // ticks left sitting at the kerb after a crash
    this.grace = 0;        // ticks after a tow when the car cannot be hit yet
    this.v = 0;
    this.ticks = 0;
    this.trips = 0;
    this.banked = 0;       // route distance from finished trips
    this.tripTicks = [];
    this.dist = 0;         // distance actually driven, for crashes per km
    this.waitTicks = 0;    // ticks spent stopped inside a junction
    this.redRuns = 0;      // junctions entered against a red light
    this.inJunction = -1;
    this.wallRay = new Float64Array(N_RAYS);
    this.carRay = new Float64Array(N_RAYS);
    this.closing = new Float64Array(N_RAYS);
    this.dx = new Float64Array(N_RAYS);   // ray directions, worked out once per tick
    this.dy = new Float64Array(N_RAYS);
    // Sized by the brain, not the constants: a brain with one more input and
    // one more output than standard has a memory channel (see step).
    this.inputs = new Float64Array(genome.nIn || N_INPUTS);
    this.out = new Float64Array(genome.nOut || N_OUTPUTS);
    this.memory = new Float64Array(Math.max(0, this.inputs.length - N_INPUTS));
    this.signal = 0;      // 1: an indicator to show, and a sense of others' (useSignal)
    this.indicator = 0;   // what this car shows, -1..1, set by its brain
    this.seen = null;     // the nearest car its rays see
    this.place(route, t0);
  }

  // Signalling: one more output, an indicator the car shows, and one more
  // input, the indicator of the nearest car its rays can see. Nothing says
  // what a signal means; if it comes to mean anything, it evolved to.
  useSignal() {
    this.signal = 1;
    this.memory = new Float64Array(Math.max(0, this.inputs.length - N_INPUTS - 1));
    return this;
  }

  // Put the car on the first road of `route`, `t0` of the way along, at a
  // standstill. Used at birth, and to drop a lost car somewhere new.
  place(route, t0 = 0) {
    const n0 = this.city.nodes[route[0]], n1 = this.city.nodes[route[1]];
    // never on a roundabout island
    const len0 = Math.hypot(n1.x - n0.x, n1.y - n0.y);
    const s0 = Math.max(t0, n0.island ? n0.r / len0 : 0);
    this.x = n0.x + (n1.x - n0.x) * s0; this.y = n0.y + (n1.y - n0.y) * s0;
    this.a = Math.atan2(n1.y - n0.y, n1.x - n0.x);
    this.v = 0;
    this.alive = true;
    this.towing = 0;
    this.grace = BODY.graceTicks;
    this.setRoute(route);
  }

  setRoute(route) {
    this.route = route;
    this.seg = 0;          // driving from route[seg] to route[seg + 1]
    this.done = 0;         // length of the segments already finished
    this.best = 0;         // furthest progress along this route
    this.sinceBest = 0;
    this.still = 0;
    this.tripStart = this.ticks;
    this.routeLen = this.city.pathLength(route);
  }

  // Solid cars collide and show up on other cars' rays. A car being towed, or
  // just put back on the road, is neither: it would otherwise be dropped on
  // top of whoever is passing and crash again on the spot.
  // A car being towed is a ghost, unless BODY.wrecks: then it stays where it
  // crashed, solid, until the tow truck takes it.
  get solid() { return this.alive && (this.towing === 0 || BODY.wrecks) && this.grace === 0; }

  get vx() { return Math.cos(this.a) * this.v; }
  get vy() { return Math.sin(this.a) * this.v; }

  // Where the car is relative to the segment it is meant to be on.
  frame() {
    const c = this.city;
    const A = c.nodes[this.route[this.seg]], B = c.nodes[this.route[this.seg + 1]];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const rx = this.x - A.x, ry = this.y - A.y;
    return { A, B, len, ux, uy, along: rx * ux + ry * uy, lateral: rx * -uy + ry * ux };
  }

  sense(hash) {
    const c = this.city, R = this.p.rayRange, A = rayAngles();
    // City.contains, inlined: the rays call it more than anything else in the
    // simulator. Same arithmetic, so the same answers to the last bit.
    const mask = c.mask, gw = c.gw, cs = c.cellSize, W = c.w, H = c.h, island = c.roundabouts ? c.island : null, x0 = this.x, y0 = this.y, step = BODY.rayStep;
    const inside = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      const k = ((y / cs) | 0) * gw + ((x / cs) | 0);
      return mask[k] === 1 && !(island && island[k] === 1);
    };
    for (let i = 0; i < N_RAYS; i++) {
      const ang = this.a + A[i];
      const cx = Math.cos(ang), cy = Math.sin(ang);
      this.dx[i] = cx; this.dy[i] = cy;
      let d = 0, hit = R;
      while (d < R) {
        d += step;
        if (!inside(x0 + cx * d, y0 + cy * d)) {
          let lo = d - step, hi = d;
          for (let k = 0; k < 3; k++) {
            const m = (lo + hi) / 2;
            if (inside(x0 + cx * m, y0 + cy * m)) lo = m; else hi = m;
          }
          hit = lo;
          break;
        }
      }
      this.wallRay[i] = hit;
      this.carRay[i] = R;
      if (i === 0) { this.seen = null; this.seenDist = R; }
      this.closing[i] = 0;
    }
    if (!hash) return;

    // Other cars are circles. A ray hits one where it enters the circle, and
    // what the car is told is how far that is and how fast the gap is closing,
    // which is the one number that separates "car ahead, also moving" from
    // "car ahead, stopped, brake now".
    
    const svx = this.vx, svy = this.vy;
    hash.near(this.x, this.y, R + 10, (o) => {
      if (o === this || !o.solid) return;
      const rad = o.p.len * 0.5;
      const ox = o.x - this.x, oy = o.y - this.y;
      const d2 = ox * ox + oy * oy;
      if (d2 > (R + rad) * (R + rad)) return;
      for (let i = 0; i < N_RAYS; i++) {
        const cx = this.dx[i], cy = this.dy[i];
        const t = ox * cx + oy * cy;
        if (t < 0) continue;
        const p2 = d2 - t * t;
        if (p2 > rad * rad) continue;
        const hit = Math.max(0, t - Math.sqrt(rad * rad - p2));
        if (hit < this.carRay[i] && hit < this.wallRay[i]) {
          this.carRay[i] = hit;
          if (hit < this.seenDist) { this.seenDist = hit; this.seen = o; }
          this.closing[i] = ((svx - o.vx) * cx + (svy - o.vy) * cy) / BODY.maxSpeed;
        }
      }
    });
  }

  step(dt, hash) {
    if (!this.alive) return;
    this.ticks++;
    if (this.towing > 0) { if (--this.towing === 0) this.grace = BODY.graceTicks; return; }
    if (this.grace > 0) this.grace--;
    this.sense(hash);
    const f = this.frame();
    const R = this.p.rayRange;
    let k = 0;
    // A body with three rays has the even slots only; the missing ones read
    // as empty road, so the brain's layout never changes shape.
    const three = this.p.rays === 3;
    for (let i = 0; i < N_RAYS; i++) {
      const dead = three && i % 2 === 1;
      this.inputs[k++] = dead || !SENSES.walls ? 1 : this.wallRay[i] / R;
      this.inputs[k++] = dead || !SENSES.cars ? 1 : this.carRay[i] / R;
      this.inputs[k++] = dead || !SENSES.cars ? 0 : Math.max(-1, Math.min(1, this.closing[i]));
    }
    const [tx, ty] = this.lookahead(f, BODY.lookahead);
    this.tx = tx; this.ty = ty;
    this.inputs[k++] = this.v / BODY.maxSpeed;
    this.inputs[k++] = wrap(Math.atan2(ty - this.y, tx - this.x) - this.a) / Math.PI;
    this.inputs[k++] = Math.max(-2, Math.min(2, f.lateral / (this.edgeHW(f) || 1)));
    this.inputs[k++] = Math.min(1, Math.hypot(f.B.x - this.x, f.B.y - this.y) / 200);
    // Unsigned: which way the route turns is already in the heading error.
    // How sharply is what decides braking, and abs() is two hidden neurons
    // a fresh network does not have.
    this.inputs[k++] = Math.abs(this.nextTurn()) / Math.PI;
    // The light at the next junction: +1 green, -1 red, 0 if there is none.
    const B = this.route[this.seg + 1], light = this.city.nodes[B].light && this.city.control === "lights";
    this.inputs[k++] = light ? (this.city.green(B, this.route[this.seg]) ? 1 : -1) : 0;
    // Memory: whatever the brain wrote to its extra output last tick comes
    // back as an extra input this tick. One number of state, carried from
    // moment to moment, is the difference between reacting and waiting.
    if (this.signal) this.inputs[k++] = this.seen ? this.seen.indicator || 0 : 0;
    for (let m = 0; m < this.memory.length; m++) this.inputs[k++] = this.memory[m];

    this.genome.activate(this.inputs, this.out);
    if (this.signal) this.indicator = Math.max(-1, Math.min(1, this.out[N_OUTPUTS]));
    for (let m = 0; m < this.memory.length; m++) this.memory[m] = this.out[N_OUTPUTS + this.signal + m];
    // a person at the wheel (eco page, Drive): their steer and throttle win
    if (this.pilot) this.pilot(this.out);
    const steer = this.out[0], throttle = this.out[1];

    const p = this.p;
    const grip = Math.min(1, Math.abs(this.v) / p.minTurnSpeed);
    this.a += steer * p.turnRate * grip * dt * Math.sign(this.v || 1);
    this.v += (throttle >= 0 ? throttle * p.accel : throttle * p.brake) * dt;
    this.v -= this.v * p.drag * dt;
    this.v = Math.max(-p.maxReverse, Math.min(p.maxSpeed, this.v));
    this.dist += Math.abs(this.v) * dt;
    if (Math.abs(this.v) < BODY.stoppedSpeed && this.city.junctionAt(this.x, this.y) >= 0) this.waitTicks++;
    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;

    if (!this.city.contains(this.x, this.y)) return this.crash(this.v, BODY.wallDamage);
    this.checkLight();
    this.advance();
  }

  // Running a red is not a crash, it is a fine. The light is a convention,
  // not a wall: nothing physically stops you, and whether that fine is worth
  // respecting is for the population to find out.
  checkLight() {
    const j = this.city.junctionAt(this.x, this.y);
    if (j >= 0 && j !== this.inJunction && j === this.route[this.seg + 1] && !this.city.green(j, this.route[this.seg])) {
      this.redRuns++;
      this.damage += BODY.redFine;
    }
    this.inJunction = j;
  }

  // The waypoint the car is pointed at is not the next junction but a point a
  // fixed distance further along the route (pure pursuit). Aim at the
  // junction itself and the target flips to the following one while you are
  // still on the approach, so the obvious move, steer at it, cuts the corner
  // straight into the kerb.
  lookahead(f, L) {
    const n = this.city.nodes, r = this.route;
    let left = L + Math.max(0, f.along);
    let s = this.seg, A = f.A, B = f.B, len = f.len;
    while (left > len && s + 2 < r.length) {
      left -= len;
      s++;
      A = B; B = n[r[s + 1]];
      len = Math.hypot(B.x - A.x, B.y - A.y);
    }
    const t = Math.min(1, left / len);
    // The target keeps the car's own sideways offset (within the road), so
    // following it holds whatever line the car is already on. A target on the
    // centreline would mean the coded part of the car drags everyone to the
    // middle, and keeping to one side would have to fight the route itself.
    // This way the code has no opinion about lanes; the brain gets the lateral
    // offset as an input and can hold a side or not.
    const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
    // With BODY.lane on, the code does have an opinion after all: keep right
    // on a two-way road, anywhere on a one-way one. An experiment, off by default.
    const hw = this.edgeHW(f), e = BODY.lane && this.city.edgeBetween(this.route[this.seg], this.route[this.seg + 1]);
    const lat = e && !e.oneway ? hw * 0.5 * BODY.lane : Math.max(-0.7, Math.min(0.7, f.lateral / hw)) * hw * BODY.keepLine;
    let tx = A.x + (B.x - A.x) * t - uy * lat, ty = A.y + (B.y - A.y) * t + ux * lat;
    if (this.city.roundabouts) [tx, ty] = this.aroundIsland(tx, ty);
    return [tx, ty];
  }

  // On a roundabout the route still runs through the middle of the junction,
  // which is now a solid island. A target that falls on or near the island is
  // moved onto the ring, a short step round from where the car is, in
  // whichever direction is shorter to the exit. Which way round traffic goes
  // is not decided here: two cars with different exits can be sent opposite
  // ways, and what they do about meeting each other is up to them.
  aroundIsland(tx, ty) {
    for (const id of [this.route[this.seg], this.route[this.seg + 1]]) {
      const n = this.city.nodes[id];
      if (!n.island) continue;
      const ring = n.island + (n.r - n.island) * 0.5;
      if (Math.hypot(tx - n.x, ty - n.y) > ring) continue;
      const k = this.route.indexOf(id, this.seg);
      const exit = this.city.nodes[this.route[Math.min(k + 1, this.route.length - 1)]];
      const ac = Math.atan2(this.y - n.y, this.x - n.x);
      const ae = Math.atan2(exit.y - n.y, exit.x - n.x);
      const d = wrap(ae - ac);
      const a = ac + Math.sign(d || 1) * Math.min(Math.abs(d), 0.9);
      return [n.x + Math.cos(a) * ring, n.y + Math.sin(a) * ring];
    }
    return [tx, ty];
  }

  edgeHW(f) {
    const e = this.city.edgeBetween(this.route[this.seg], this.route[this.seg + 1]);
    return e ? e.hw : 9;
  }

  nextTurn() {
    const r = this.route, s = this.seg;
    // The last leg reads as the sharpest turn there is: the destination is a
    // stop, and stopping is the hardest "turn" of all.
    if (s + 2 >= r.length) return Math.PI;
    const n = this.city.nodes;
    const a1 = Math.atan2(n[r[s + 1]].y - n[r[s]].y, n[r[s + 1]].x - n[r[s]].x);
    const a2 = Math.atan2(n[r[s + 2]].y - n[r[s + 1]].y, n[r[s + 2]].x - n[r[s + 1]].x);
    return wrap(a2 - a1);
  }

  // Progress is distance along the route, measured by projecting onto the
  // current segment and clamped, so cutting across a junction or reversing
  // past it earns nothing.
  advance() {
    let f = this.frame();
    // A junction counts as passed once you are into its apron along the
    // direction of travel. Which lane you used to get there does not matter.
    for (;;) {
      const last = this.seg === this.route.length - 2;
      if (last) {
        // A fare is only delivered if you actually stop for it.
        if (Math.hypot(f.B.x - this.x, f.B.y - this.y) < f.B.r && Math.abs(this.v) < BODY.dropSpeed) return this.arrive();
        break;
      }
      if (f.along <= f.len - f.B.r * 0.5) break;
      this.done += f.len;
      this.seg++;
      f = this.frame();
    }
    const p = this.done + Math.max(0, Math.min(f.len, f.along));
    // Lost means moving without getting anywhere: going round in circles or
    // down the wrong street. Standing still is waiting, at a red light or in
    // a queue, and only counts as stuck after much longer. An earlier version
    // gave up on any car that made no progress for four seconds, which is
    // shorter than a red light: stopping for one was a death sentence, and
    // evolution duly selected for running them.
    if (p > this.best + 0.5) { this.best = p; this.sinceBest = 0; this.still = 0; }
    else if (Math.abs(this.v) > BODY.stoppedSpeed ? ++this.sinceBest > BODY.lostTicks : ++this.still > BODY.stuckTicks) {
      this.alive = false;
      this.lost = true;
    }
  }

  arrive() {
    this.trips++;
    this.banked += this.routeLen;
    this.tripTicks.push(this.ticks - this.tripStart);
    const here = this.route[this.route.length - 1];
    const next = this.onArrive ? this.onArrive(this, here) : null;
    if (next) this.setRoute(next);
    else this.alive = false;
  }

  // Hitting a wall does not end the run. The car is towed back to the middle
  // of the road it was meant to be on, facing the right way, and loses a
  // second. If a crash were death, every brain in the first generations would
  // die at the first corner whether it braked or not, the fitness landscape
  // would be flat right where it matters, and evolution would never find out
  // that braking helps. A fine per crash keeps the slope.
  // `scale` prices the damage: walls can be made cheaper than other cars
  // (BODY.wallDamage) to test what a driver learns when kerbs stop mattering.
  crash(speed = this.v, scale = 1) {
    if (this.towing > 0) {
      // a wreck being hit is already wrecked; with BODY.wreckBlame it pays
      // for the car that ran into it, the jam its crash caused
      if (BODY.wreckBlame) { const i = Math.min(1.5, Math.abs(speed) / BODY.maxSpeed); this.damage += i * i * scale; }
      return;
    }
    this.crashes++;
    if (BODY.junctionPrice !== 1 && this.city.junctionAt(this.x, this.y) >= 0) scale *= BODY.junctionPrice;
    const impact = Math.min(1.5, Math.abs(speed) / BODY.maxSpeed);
    this.damage += impact * impact * scale;
    if (this.onCrash) this.onCrash(this);
    this.crashed = true;
    const f = this.frame();
    // dropped on the road, never on a roundabout island
    const lo = f.A.island ? f.A.r : 0, hi = f.len - (f.B.island ? f.B.r : 0);
    const t = Math.max(lo, Math.min(hi, f.along));
    this.x = f.A.x + f.ux * t;
    this.y = f.A.y + f.uy * t;
    this.a = Math.atan2(f.uy, f.ux);
    this.v = 0;
    this.towing = BODY.towTicks;
    if (this.crashes >= this.p.maxCrashes) this.alive = false;
  }

  // Route distance covered, plus a flat bonus per finished trip so that
  // arriving is worth more than getting almost there, scaled down by crash
  // damage. Damage goes with impact speed squared, like kinetic energy.
  //
  // Two cheaper versions failed. A flat fine per crash: set it high and every
  // early brain scores zero, so there is no slope to climb; set it low and
  // crashing through corners beats braking for them. A fixed multiplier per
  // crash: better, but braking from 110 to 80 still hits the wall and costs
  // exactly what not braking does, so partial braking is never rewarded and
  // full braking is never reached. Damage that falls with speed makes every
  // bit of braking pay.
  fitness(damageCost = BODY.damageCost) {
    const dist = this.banked + this.best;
    return (dist / 10 + this.trips * 60) * Math.exp(-damageCost * this.damage);
  }
}
