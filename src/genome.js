// A genome: the description of one brain.
//
// NEAT's central trick is that the *structure* of the network evolves along
// with its weights, which means two brains in the population may not even
// have the same shape. Historical markings (the innovation number on every
// connection) are what let you still line two of them up and cross them over
// sensibly. Everything in this file exists to serve that.

export const ACT = (x) => Math.tanh(x);

// One global registry per run. Two mutations that invent the same connection
// in the same generation must get the same innovation number, otherwise the
// population fills up with genes that look unrelated but aren't.
export class Innovations {
  constructor(firstNodeId) {
    this.conn = new Map();      // "in>out"  -> innovation number
    this.split = new Map();     // innovation -> the node id that split it
    this.nextInnov = 0;
    this.nextNode = firstNodeId;
  }
  connId(inId, outId) {
    const k = `${inId}>${outId}`;
    let v = this.conn.get(k);
    if (v === undefined) { v = this.nextInnov++; this.conn.set(k, v); }
    return v;
  }
  // Splitting the same connection twice anywhere in the population should
  // produce the same new node id, for the same alignment reason.
  splitNode(innov) {
    let v = this.split.get(innov);
    if (v === undefined) { v = this.nextNode++; this.split.set(innov, v); }
    return v;
  }
}

export class Genome {
  constructor(nIn, nOut) {
    this.nIn = nIn;
    this.nOut = nOut;
    this.nodes = new Map();     // id -> {id, kind, depth}
    this.conns = new Map();     // innovation -> {inId, outId, w, on, innov}
    this.fitness = 0;
    this.adjusted = 0;
    this._order = null;         // cached evaluation order
    this._in = null;            // cached incoming-connection lists
  }

  // Depth is what keeps the network acyclic without any cycle detection:
  // a connection may only ever run from a shallower node to a deeper one, and
  // a node created by splitting a connection sits halfway between its ends.
  // Evaluating nodes in depth order then guarantees every input to a node is
  // already computed.
  static initial(nIn, nOut, innovations, rng) {
    const g = new Genome(nIn, nOut);
    for (let i = 0; i < nIn; i++) g.nodes.set(i, { id: i, kind: "input", depth: 0 });
    g.biasId = nIn;
    g.nodes.set(nIn, { id: nIn, kind: "bias", depth: 0 });
    g.outIds = [];
    for (let o = 0; o < nOut; o++) {
      const id = nIn + 1 + o;
      g.nodes.set(id, { id, kind: "output", depth: 1 });
      g.outIds.push(id);
    }
    // Start fully connected and minimal. NEAT grows complexity from here
    // rather than pruning it away, which is the whole point of the method.
    for (const src of [...Array(nIn).keys(), nIn]) {
      for (const dst of g.outIds) {
        const innov = innovations.connId(src, dst);
        g.conns.set(innov, { inId: src, outId: dst, w: rng.normal() , on: true, innov });
      }
    }
    return g;
  }

  clone() {
    const g = new Genome(this.nIn, this.nOut);
    g.biasId = this.biasId;
    g.outIds = [...this.outIds];
    for (const [id, n] of this.nodes) g.nodes.set(id, { ...n });
    for (const [i, c] of this.conns) g.conns.set(i, { ...c });
    return g;
  }

  dirty() { this._order = null; this._in = null; }

  order() {
    if (!this._order) {
      this._order = [...this.nodes.values()]
        .filter((n) => n.kind !== "input" && n.kind !== "bias")
        .sort((a, b) => a.depth - b.depth || a.id - b.id);
    }
    return this._order;
  }

  incoming() {
    if (!this._in) {
      this._in = new Map();
      for (const c of this.conns.values()) {
        if (!c.on) continue;
        if (!this._in.has(c.outId)) this._in.set(c.outId, []);
        this._in.get(c.outId).push(c);
      }
    }
    return this._in;
  }

  // Feed-forward pass. No cycles are possible, so this is one sweep in depth
  // order with no iteration to convergence.
  activate(inputs, out) {
    const v = this._v || (this._v = new Map());
    v.clear();
    for (let i = 0; i < this.nIn; i++) v.set(i, inputs[i]);
    v.set(this.biasId, 1);
    const inc = this.incoming();
    for (const node of this.order()) {
      let sum = 0;
      const cs = inc.get(node.id);
      if (cs) for (let i = 0; i < cs.length; i++) sum += cs[i].w * (v.get(cs[i].inId) || 0);
      v.set(node.id, ACT(sum));
    }
    for (let o = 0; o < this.outIds.length; o++) out[o] = v.get(this.outIds[o]) || 0;
    return out;
  }

  complexity() {
    let on = 0;
    for (const c of this.conns.values()) if (c.on) on++;
    return { nodes: this.nodes.size, conns: on };
  }
}
