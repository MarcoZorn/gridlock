// A uniform grid of buckets, rebuilt from scratch every tick.
//
// "Which cars are near me" asked naively is every car against every other,
// n squared, and at a few hundred cars that is most of the frame. Dropping
// each car into a cell and only checking the cells around you makes it
// roughly linear. Rebuilding beats updating: a rebuild is two flat array
// writes per car and there is no bookkeeping to get wrong when cars die.
export class SpatialHash {
  constructor(w, h, cell = 48) {
    this.cell = cell;
    this.gw = Math.ceil(w / cell) + 1;
    this.gh = Math.ceil(h / cell) + 1;
    this.head = new Int32Array(this.gw * this.gh);
    this.next = new Int32Array(64);
    this.items = [];
  }

  // Only items whose `solid` is true are indexed.
  rebuild(items) {
    this.items = items;
    if (this.next.length < items.length) this.next = new Int32Array(items.length * 2);
    this.head.fill(-1);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.solid) continue;
      const c = this.cellOf(it.x, it.y);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  cellOf(x, y) {
    const gx = Math.max(0, Math.min(this.gw - 1, (x / this.cell) | 0));
    const gy = Math.max(0, Math.min(this.gh - 1, (y / this.cell) | 0));
    return gy * this.gw + gx;
  }

  // Calls fn(item) for everything in the cells overlapping the square of
  // half-size r around (x, y). Callers still do their own exact distance test.
  near(x, y, r, fn) {
    const c = this.cell;
    const x0 = Math.max(0, ((x - r) / c) | 0), x1 = Math.min(this.gw - 1, ((x + r) / c) | 0);
    const y0 = Math.max(0, ((y - r) / c) | 0), y1 = Math.min(this.gh - 1, ((y + r) / c) | 0);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (let i = this.head[gy * this.gw + gx]; i >= 0; i = this.next[i]) fn(this.items[i]);
      }
    }
  }
}
