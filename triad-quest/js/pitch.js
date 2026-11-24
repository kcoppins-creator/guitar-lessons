/* Triad Quest - pitch detection for Mic mode. YIN (de Cheveigné & Kawahara 2002) with parabolic interpolation,
   tuned for guitar: 70-1400 Hz, so low E (82.4 Hz) and the high strings up to fret 12 (659 Hz) and beyond.
   detect() is pure (works in Node tests on synthetic tones); Listener wraps getUserMedia + an AnalyserNode. */
(function (root) {
  "use strict";
  var MIN_HZ = 70, MAX_HZ = 1400;
  function rms(buf) { var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
  /* returns { hz, clarity (0..1, 1 = perfectly periodic), rms } or { hz: null } */
  function detect(buf, sr, opts) {
    opts = opts || {};
    var thr = opts.threshold || 0.12, gate = opts.gate === undefined ? 0.008 : opts.gate;
    var level = rms(buf);
    if (level < gate) return { hz: null, clarity: 0, rms: level };
    var tauMin = Math.floor(sr / (opts.maxHz || MAX_HZ)), tauMax = Math.min(Math.floor(sr / (opts.minHz || MIN_HZ)), Math.floor(buf.length / 2) - 2);
    var W = buf.length - tauMax - 1;
    if (W < tauMax) return { hz: null, clarity: 0, rms: level };
    var d = new Float32Array(tauMax + 2), cm = new Float32Array(tauMax + 2), tau, i, sum = 0;
    for (tau = 1; tau <= tauMax + 1; tau++) {
      var acc = 0;
      for (i = 0; i < W; i++) { var x = buf[i] - buf[i + tau]; acc += x * x; }
      d[tau] = acc;
    }
    cm[0] = 1;
    for (tau = 1; tau <= tauMax + 1; tau++) { sum += d[tau]; cm[tau] = sum > 0 ? d[tau] * tau / sum : 1; }
    // first dip under the threshold (then walk down to its bottom); this picks the fundamental, not a harmonic
    var best = -1;
    for (tau = Math.max(2, tauMin); tau <= tauMax; tau++) {
      if (cm[tau] < thr) { while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++; best = tau; break; }
    }
    if (best < 0) {   // nothing under threshold: take the global minimum if it's still fairly clear
      var mv = 1; for (tau = Math.max(2, tauMin); tau <= tauMax; tau++) if (cm[tau] < mv) { mv = cm[tau]; best = tau; }
      if (mv > (opts.loose || 0.3)) return { hz: null, clarity: 1 - mv, rms: level };
    }
    var a = cm[best - 1], b = cm[best], c = cm[best + 1], den = a - 2 * b + c;
    var t = den !== 0 ? best + 0.5 * (a - c) / den : best;
    return { hz: sr / t, clarity: Math.max(0, 1 - b), rms: level };
  }
  function midiOf(hz) { return 69 + 12 * Math.log(hz / 440) / Math.LN2; }
  /* nearest note + cents off it */
  function noteOf(hz) { var m = midiOf(hz), n = Math.round(m); return { midi: n, cents: Math.round((m - n) * 100), pc: ((n % 12) + 12) % 12 }; }
  /* compare a detected pitch with a target note (MIDI). octaveOk: same note name but another octave */
  function judge(hz, targetMidi, tolCents) {
    var m = midiOf(hz), off = (m - targetMidi) * 100, pcOff = ((off % 1200) + 1800) % 1200 - 600;
    var ok = Math.abs(off) <= tolCents, sameName = Math.abs(pcOff) <= tolCents;
    return { ok: ok, cents: Math.round(off), sameName: sameName, octaves: Math.round(off / 1200), wrongOctave: sameName && !ok };
  }
  /* steady-note gate: a pitch counts once N frames in a row agree within `spread` cents */
  function Stabilizer(n, spread) { this.n = n || 3; this.spread = spread || 40; this.hist = []; }
  Stabilizer.prototype.push = function (hz) {
    if (!hz) { this.hist = []; return null; }
    this.hist.push(midiOf(hz)); if (this.hist.length > this.n) this.hist.shift();
    if (this.hist.length < this.n) return null;
    var mn = Math.min.apply(null, this.hist), mx = Math.max.apply(null, this.hist);
    if ((mx - mn) * 100 > this.spread) return null;
    var s = this.hist.slice().sort(function (x, y) { return x - y; });
    return 440 * Math.pow(2, (s[s.length >> 1] - 69) / 12);
  };
  Stabilizer.prototype.reset = function () { this.hist = []; };

  /* ---------- live mic (browser only) ---------- */
  function Listener(opts) { this.opts = opts || {}; this.running = false; }
  Listener.supported = function () { return !!(root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext)); };
  /* explain an error in plain English */
  Listener.explain = function (e) {
    var n = e && e.name;
    if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return { code: "denied", msg: "Microphone access was blocked. On iPad: Settings › Apps › Safari › Microphone › Allow (or tap “aA” in the address bar › Website Settings › Microphone). Then try again. You can keep practising by tapping." };
    if (n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") return { code: "nomic", msg: "No microphone was found on this device." };
    if (n === "NotReadableError") return { code: "busy", msg: "The microphone is busy in another app (a call, a recorder or a tuner). Close it and try again." };
    if (n === "unsupported") return { code: "unsupported", msg: "This browser can't use the microphone here. Mic mode needs Safari or Chrome over https (the published site works; a file:// copy doesn't)." };
    return { code: "error", msg: "The microphone didn't start (" + (n || "unknown error") + "). You can keep practising by tapping." };
  };
  Listener.prototype.start = function (ctx, onFrame) {
    var self = this;
    if (!Listener.supported()) return Promise.reject({ name: "unsupported" });
    return root.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      self.stream = stream; self.ctx = ctx;
      if (ctx.state === "suspended" && ctx.resume) ctx.resume();
      self.src = ctx.createMediaStreamSource(stream);
      self.hp = ctx.createBiquadFilter(); self.hp.type = "highpass"; self.hp.frequency.value = 60;     // rumble / handling noise
      self.an = ctx.createAnalyser(); self.an.fftSize = 4096; self.an.smoothingTimeConstant = 0;
      self.src.connect(self.hp); self.hp.connect(self.an);
      self.buf = new Float32Array(self.an.fftSize);
      self.running = true;
      self.timer = setInterval(function () {
        if (!self.running) return;
        if (self.an.getFloatTimeDomainData) self.an.getFloatTimeDomainData(self.buf);
        else { var b8 = new Uint8Array(self.an.fftSize); self.an.getByteTimeDomainData(b8); for (var i = 0; i < b8.length; i++) self.buf[i] = (b8[i] - 128) / 128; }
        onFrame(detect(self.buf, ctx.sampleRate, self.opts));
      }, 60);
      return true;
    });
  };
  Listener.prototype.stop = function () {
    this.running = false; clearInterval(this.timer);
    try { if (this.src) this.src.disconnect(); if (this.hp) this.hp.disconnect(); } catch (e) { /* already gone */ }
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
  };
  var api = { detect: detect, midiOf: midiOf, noteOf: noteOf, judge: judge, rms: rms, Stabilizer: Stabilizer, Listener: Listener, MIN_HZ: MIN_HZ, MAX_HZ: MAX_HZ };
  root.TQPitch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
