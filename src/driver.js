// A car in the city. Same arcade physics as the track car, new senses.
//
// The route is coded: A* hands the car a list of junctions. Driving it is
// evolved. The brain is told which way the next waypoint is, how far off the
// road's centreline it sits, how far the junction is and which way the route
// turns there, and it gets a fan of rays that see walls and other cars. It is
// never told about lanes, right of way, or that other cars exist as a concept.
// If it learns any of that, it learned it.
export const N_RAYS = 5;
const PER_RAY = 3;             // wall distance, car distance, closing speed
export const N_INPUTS = N_RAYS * PER_RAY + 5;
export const N_OUTPUTS = 2;    // steering, throttle

export const BODY = {
  accel: 170, brake: 320, drag: 0.6,
  maxSpeed: 110, maxReverse: 30,
  turnRate: 3.0, minTurnSpeed: 8,
  len: 10, wid: 5,
  rayRange: 120, rayStep: 6,
  fov: Math.PI * 1.1,
  lostTicks: 240,   // no route progress for this long and the car is lost
  lookahead: 35,    // how far down the route the steering target sits
  dropSpeed: 40,    // must be this slow at the destination to deliver
  towTicks: 120, maxCrashes: 12, damageCost: 1,
};

const ANGLES = Array.from({ length: N_RAYS }, (_, i) => -BODY.fov / 2 + (BODY.fov * i) / (N_RAYS - 1));
export const rayAngles = () => ANGLES;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Driver {
  constructor(genome, city, route) {
    this.genome = genome;
    this.city = city;
    this.alive = true;
    this.crashed = false;
    this.crashes = 0;
    this.damage = 0;       // sum of (impact speed / top speed) squared
    this.towing = 0;       // ticks left sitting at the kerb after a crash
    this.v = 0;
    this.ticks = 0;
    this.trips = 0;
    this.banked = 0;       // route distance from finished trips
    this.tripTicks = [];
    this.wallRay = new Float64Array(N_RAYS);
    this.carRay = new Float64Array(N_RAYS);
    this.closing = new Float64Array(N_RAYS);
    this.inputs = new Float64Array(N_INPUTS);
    this.out = new Float64Array(N_OUTPUTS);
    const n0 = city.nodes[route[0]], n1 = city.nodes[route[1]];
    this.x = n0.x; this.y = n0.y;
    this.a = Math.atan2(n1.y - n0.y, n1.x - n0.x);
    this.setRoute(route);
  }

  setRoute(route) {
    this.route = route;
    this.seg = 0;          // driving from route[seg] to route[seg + 1]
    this.done = 0;         // length of the segments already finished
    this.best = 0;         // furthest progress along this route
    this.sinceBest = 0;
    this.tripStart = this.ticks;
    this.routeLen = this.city.pathLength(route);
  }

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
    const c = this.city, R = BODY.rayRange;
    for (let i = 0; i < N_RAYS; i++) {
      const ang = this.a + ANGLES[i];
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let d = 0, hit = R;
      while (d < R) {
        d += BODY.rayStep;
        if (!c.contains(this.x + cx * d, this.y + cy * d)) {
          let lo = d - BODY.rayStep, hi = d;
          for (let k = 0; k < 3; k++) {
            const m = (lo + hi) / 2;
            if (c.contains(this.x + cx * m, this.y + cy * m)) lo = m; else hi = m;
          }
          hit = lo;
          break;
        }
      }
      this.wallRay[i] = hit;
      this.carRay[i] = R;
      this.closing[i] = 0;
    }
    if (!hash) return;

    // Other cars are circles. A ray hits one where it enters the circle, and
    // what the car is told is how far that is and how fast the gap is closing,
    // which is the one number that separates "car ahead, also moving" from
    // "car ahead, stopped, brake now".
    const rad = BODY.len * 0.5;
    const svx = this.vx, svy = this.vy;
    hash.near(this.x, this.y, R + rad, (o) => {
      if (o === this || !o.alive) return;
      const ox = o.x - this.x, oy = o.y - this.y;
      const d2 = ox * ox + oy * oy;
      if (d2 > (R + rad) * (R + rad)) return;
      for (let i = 0; i < N_RAYS; i++) {
        const ang = this.a + ANGLES[i];
        const cx = Math.cos(ang), cy = Math.sin(ang);
        const t = ox * cx + oy * cy;
        if (t < 0) continue;
        const p2 = d2 - t * t;
        if (p2 > rad * rad) continue;
        const hit = Math.max(0, t - Math.sqrt(rad * rad - p2));
        if (hit < this.carRay[i] && hit < this.wallRay[i]) {
          this.carRay[i] = hit;
          this.closing[i] = ((svx - o.vx) * cx + (svy - o.vy) * cy) / BODY.maxSpeed;
        }
      }
    });
  }

  step(dt, hash) {
    if (!this.alive) return;
    this.ticks++;
    if (this.towing > 0) { this.towing--; return; }
    this.sense(hash);
    const f = this.frame();
    const R = BODY.rayRange;
    let k = 0;
    for (let i = 0; i < N_RAYS; i++) {
      this.inputs[k++] = this.wallRay[i] / R;
      this.inputs[k++] = this.carRay[i] / R;
      this.inputs[k++] = Math.max(-1, Math.min(1, this.closing[i]));
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

    this.genome.activate(this.inputs, this.out);
    const steer = this.out[0], throttle = this.out[1];

    const grip = Math.min(1, Math.abs(this.v) / BODY.minTurnSpeed);
    this.a += steer * BODY.turnRate * grip * dt * Math.sign(this.v || 1);
    this.v += (throttle >= 0 ? throttle * BODY.accel : throttle * BODY.brake) * dt;
    this.v -= this.v * BODY.drag * dt;
    this.v = Math.max(-BODY.maxReverse, Math.min(BODY.maxSpeed, this.v));
    this.x += Math.cos(this.a) * this.v * dt;
    this.y += Math.sin(this.a) * this.v * dt;

    if (!this.city.contains(this.x, this.y)) return this.crash();
    this.advance();
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
    return [A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t];
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
    if (p > this.best + 0.5) { this.best = p; this.sinceBest = 0; }
    else if (++this.sinceBest > BODY.lostTicks) this.alive = false;
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
  crash() {
    this.crashes++;
    const impact = this.v / BODY.maxSpeed;
    this.damage += impact * impact;
    this.crashed = true;
    const f = this.frame();
    const t = Math.max(0, Math.min(f.len, f.along));
    this.x = f.A.x + f.ux * t;
    this.y = f.A.y + f.uy * t;
    this.a = Math.atan2(f.uy, f.ux);
    this.v = 0;
    this.towing = BODY.towTicks;
    if (this.crashes >= BODY.maxCrashes) this.alive = false;
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
  fitness() {
    const dist = this.banked + this.best;
    return (dist / 10 + this.trips * 60) * Math.exp(-BODY.damageCost * this.damage);
  }
}
