// A time-lapse of the city: one frame every `every` ticks of simulated time,
// however fast the simulation runs, encoded in the browser to a WebM video.
// The scheduling (which ticks get a frame) is plain logic and tested in
// test.mjs; the recording needs a browser (canvas.captureStream, MediaRecorder).

export const TICKS_PER_CITY_MINUTE = 60;

export class FrameClock {
  // every: ticks between frames (default ten city minutes)
  constructor(every = 10 * TICKS_PER_CITY_MINUTE) { this.every = every; this.next = null; this.frames = 0; }
  start(tick) { this.next = tick; this.frames = 0; }
  // true when the simulation has reached the next frame's time; a burst of
  // fast-forwarded ticks still yields one frame, then waits for the next slot
  due(tick) {
    if (this.next === null || tick < this.next) return false;
    this.next = (Math.floor(tick / this.every) + 1) * this.every;
    this.frames++;
    return true;
  }
}

export class Timelapse {
  constructor(canvas, { every } = {}) {
    this.canvas = canvas; this.clock = new FrameClock(every);
    this.rec = null; this.chunks = []; this.track = null;
  }
  static supported() { return typeof MediaRecorder !== "undefined" && !!HTMLCanvasElement.prototype.captureStream; }
  get recording() { return !!this.rec; }

  start(tick) {
    const stream = this.canvas.captureStream(0);   // 0: a frame only when asked for
    this.track = stream.getVideoTracks()[0];
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.clock.start(tick);
  }

  // call after each draw; asks the stream for a frame when its time has come.
  // The video keeps the real time between frames, so it plays at the pace it
  // was recorded: record at 16x or 64x for a day in under a minute.
  frame(tick) {
    if (!this.rec || !this.clock.due(tick)) return;
    this.track.requestFrame();
  }

  // resolves to the finished video
  stop() {
    return new Promise((done) => {
      if (!this.rec) return done(null);
      this.rec.onstop = () => { done(new Blob(this.chunks, { type: "video/webm" })); this.rec = null; this.track = null; };
      this.rec.stop();
    });
  }
}
