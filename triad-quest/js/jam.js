/* Triad Quest - Jam engine: sampled drums, bass and guitar (CC0, see README), look-ahead scheduler,
   swing + humanised timing/velocity, bus compression, convolution reverb and a master limiter.
   Works on the live AudioContext (shared with TQAudio for iOS) or an OfflineAudioContext (preview render). */
(function (root) {
  "use strict";
  var D = root.TQJamData, S = root.TQ_SAMPLES, BASE = "audio/";
  var LOOKAHEAD = 0.16, TICK_MS = 25, BAR_AHEAD = 0.5;

  function decode(ctx, ab) {
    return new Promise(function (res, rej) {
      try { var p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
    });
  }
  /* AAC files start with encoder priming silence; find the real attack so every hit lands on time. */
  function onsetOf(buf) {
    var n = buf.length, peak = 0, chs = [], c, i;
    for (c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    for (i = 0; i < n; i++) for (c = 0; c < chs.length; c++) { var a = Math.abs(chs[c][i]); if (a > peak) peak = a; }
    var th = peak * 0.016;
    for (i = 0; i < n; i++) for (c = 0; c < chs.length; c++) if (Math.abs(chs[c][i]) > th) return Math.max(0, i - Math.round(0.0015 * buf.sampleRate)) / buf.sampleRate;
    return 0;
  }
  function allFiles() {
    var list = [];
    Object.keys(S.drums).forEach(function (k) { S.drums[k].forEach(function (f) { list.push(f); }); });
    S.bass.forEach(function (e) { list.push(e.file); }); S.gtr.forEach(function (e) { list.push(e.file); }); (S.gst || []).forEach(function (e) { list.push(e.file); });
    return list;
  }
  var rawCache = {}; // ArrayBuffers fetched once, decoded per context
  function fetchRaw(f) {
    if (rawCache[f]) return Promise.resolve(rawCache[f]);
    return fetch(BASE + f).then(function (r) { if (!r.ok) throw new Error(f + " " + r.status); return r.arrayBuffer(); }).then(function (ab) { rawCache[f] = ab; return ab; });
  }
  function loadInto(ctx, onProgress) {
    var files = allFiles(), done = 0, out = {}, failed = [];
    return Promise.all(files.map(function (f) {
      return fetchRaw(f).then(function (ab) { return decode(ctx, ab.slice(0)); }).then(function (b) {
        out[f] = { buf: b, off: onsetOf(b) };
      }).catch(function (e) { failed.push(f); }).then(function () { done++; if (onProgress) onProgress(done, files.length); });
    })).then(function () { return { map: out, failed: failed }; });
  }

  function makeIR(ctx, secs) {
    var sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr), pre = Math.floor(0.014 * sr);
    var taps = [[0.011, 0.5], [0.019, 0.38], [0.027, 0.33], [0.041, 0.25], [0.053, 0.2], [0.067, 0.16]];
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), lp = 0, seed = ch ? 7 : 3;
      for (var i = 0; i < n; i++) {
        var t = i / sr;
        seed = (seed * 16807) % 2147483647; var w = seed / 1073741823.5 - 1;
        var bright = 0.08 + 0.72 * Math.exp(-t / 0.45); // highs die first, like a real room
        lp += bright * (w - lp);
        var env = Math.exp(-6.9 * t / 1.9) * (i < pre ? 0 : Math.min(1, (i - pre) / (0.02 * sr)));
        d[i] = lp * env;
      }
      taps.forEach(function (tp) { var k = Math.floor((tp[0] + (ch ? 0.0037 : 0)) * sr); if (k < n) d[k] += tp[1] * (ch ? -1 : 1) * 0.6; });
      var peak = 0; for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (i = 0; i < n; i++) d[i] *= 0.5 / peak;
    }
    return b;
  }

  /* ---------- engine: audio graph + voices on one context ---------- */
  function Engine(ctx, samples) {
    this.ctx = ctx; this.s = samples; this.active = []; this.voices = {};
    var c = ctx, self = this;
    function comp(th, ratio, att, rel, knee) { var x = c.createDynamicsCompressor(); x.threshold.value = th; x.ratio.value = ratio; x.attack.value = att; x.release.value = rel; x.knee.value = knee == null ? 6 : knee; return x; }
    function gain(v) { var g = c.createGain(); g.gain.value = v; return g; }
    function filt(type, f, q) { var x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; if (q != null) x.Q.value = q; return x; }
    this.out = gain(0.9);
    this.limiter = comp(-2.5, 20, 0.0015, 0.12, 0);
    this.glue = comp(-16, 2.2, 0.012, 0.25, 8);
    this.sum = gain(0.6); // headroom: the limiter only catches stray peaks
    this.sum.connect(this.glue); this.glue.connect(this.limiter); this.limiter.connect(this.out); this.out.connect(c.destination);
    this.reverb = c.createConvolver(); this.reverb.buffer = makeIR(c, 2.2);
    this.revHP = filt("highpass", 220); this.revLP = filt("lowpass", 7000);
    this.revRet = gain(0.9);
    this.reverb.connect(this.revHP); this.revHP.connect(this.revLP); this.revLP.connect(this.revRet); this.revRet.connect(this.sum);
    // drums: punchy bus compression
    this.bus = { drums: gain(1), bass: gain(1), gtr: gain(1) };
    this.mix = { drums: gain(0.9), bass: gain(0.72), gtr: gain(0.72) };
    var dComp = comp(-18, 3.5, 0.006, 0.12, 4);
    this.bus.drums.connect(dComp); dComp.connect(this.mix.drums);
    // kick: more body (peak ~62 Hz), less beater click (dip 3-5 kHz) + a tuned sine sub layer (see Engine.drum)
    var kLow = filt("peaking", 62, 1.1); kLow.gain.value = 5;
    var kBox = filt("peaking", 380, 1.4); kBox.gain.value = -2;
    var kClick = filt("peaking", 4000, 0.9); kClick.gain.value = -7;
    var kTop = filt("highshelf", 7000); kTop.gain.value = -4;
    this.kickIn = gain(1);
    this.kickIn.connect(kLow); kLow.connect(kBox); kBox.connect(kClick); kClick.connect(kTop); kTop.connect(this.bus.drums);
    // bass: tame the top, even out the fingers
    // bass: round and full - low-shelf at 100 Hz, gentle tanh saturation for weight, soft low-pass at 2.2 kHz
    // (removes the finger/fret click and the saturation's upper harmonics), then slow-attack compression
    var bLow = filt("lowshelf", 90); bLow.gain.value = 3;
    var bRound = filt("peaking", 110, 0.9); bRound.gain.value = 3.5; // the 80-120 Hz "round" band that iPad speakers can still reproduce
    var bMud = filt("peaking", 280, 1.2); bMud.gain.value = -1.5;
    var bDrive = gain(1.8), bSat = c.createWaveShaper(), bTrim = gain(0.62);
    var curve = new Float32Array(2048); for (var ci = 0; ci < 2048; ci++) { var xx = ci / 1023.5 - 1; curve[ci] = Math.tanh(1.6 * xx) / Math.tanh(1.6); }
    bSat.curve = curve; bSat.oversample = "4x";
    var bLP = filt("lowpass", 2200, 0.5), bLP2 = filt("lowpass", 3200, 0.5);
    var bComp = comp(-24, 4, 0.02, 0.25, 8);
    this.bus.bass.connect(bLow); bLow.connect(bRound); bRound.connect(bMud); bMud.connect(bDrive); bDrive.connect(bSat); bSat.connect(bTrim);
    bTrim.connect(bLP); bLP.connect(bLP2); bLP2.connect(bComp); bComp.connect(this.mix.bass);
    // guitar: clear out lows so it doesn't fight the bass, a little presence, slight right pan
    // guitar: keep the pick and string detail, tame only the fizz - body at 250 Hz, a slight 2.7 kHz dip,
    // gentle high-shelf from 6 kHz and a soft low-pass at 9 kHz
    var gHP = filt("highpass", 110, 0.7), gDip = filt("peaking", 2700, 1.3); gDip.gain.value = -1;
    var gShelf = filt("highshelf", 6000); gShelf.gain.value = -3;
    var gLP = filt("lowpass", 9000, 0.5), gBody = filt("peaking", 250, 0.9); gBody.gain.value = 1.5;
    var gComp = comp(-20, 2.2, 0.012, 0.2, 6); // slower attack lets the pick transient through
    this.bus.gtr.connect(gHP); gHP.connect(gBody); gBody.connect(gDip); gDip.connect(gShelf); gShelf.connect(gLP); gLP.connect(gComp);
    // pick/string attack layer: a copy of each note's first ~20 ms, band-passed around 3 kHz (see Engine.note)
    var aBP = filt("bandpass", 3000, 0.8), aBP2 = filt("highpass", 1800, 0.7);
    this.attackIn = gain(1); this.attackIn.connect(aBP); aBP.connect(aBP2); aBP2.connect(this.bus.gtr);
    // palm-muted chugs (staccato samples): darker, a bit of thump
    var pmLP = filt("lowpass", 1800, 0.6), pmLow = filt("lowshelf", 160); pmLow.gain.value = 2;
    this.pmIn = gain(1); this.pmIn.connect(pmLP); pmLP.connect(pmLow); pmLow.connect(this.bus.gtr);
    var gPan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (gPan) { gPan.pan.value = 0.18; gComp.connect(gPan); gPan.connect(this.mix.gtr); } else gComp.connect(this.mix.gtr);
    this.send = { drums: gain(0.12), gtr: gain(0.22), bass: gain(0) };
    ["drums", "bass", "gtr"].forEach(function (k) { self.mix[k].connect(self.sum); self.mix[k].connect(self.send[k]); self.send[k].connect(self.reverb); });
    this.level = { drums: 0.9, bass: 0.72, gtr: 0.72 }; this.muted = { drums: false, bass: false, gtr: false };
  }
  Engine.prototype.setReverb = function (amt) { this.send.gtr.gain.value = amt * 1.25; this.send.drums.gain.value = amt * 0.6; }; // guitar a bit wetter
  Engine.prototype.setLevel = function (k, v) { this.level[k] = v; this.applyMix(k); };
  Engine.prototype.setMute = function (k, m) { this.muted[k] = m; this.applyMix(k); };
  Engine.prototype.applyMix = function (k) { var g = this.mix[k].gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(this.muted[k] ? 0 : this.level[k], t, 0.02); };
  Engine.prototype.setOut = function (v) { var g = this.out.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(v, t, 0.03); };

  Engine.prototype.voice = function (entry, t, opt) {
    var c = this.ctx, src = c.createBufferSource(), g = c.createGain(), self = this;
    src.buffer = entry.buf; src.playbackRate.value = opt.rate || 1;
    g.gain.setValueAtTime(opt.gain, t);
    src.connect(g); g.connect(opt.dest);
    var start = Math.max(t, c.currentTime);
    src.start(start, entry.off + Math.max(0, start - t));
    var rec = { src: src, g: g, t: start, end: start + (entry.buf.duration - entry.off) / (opt.rate || 1) };
    if (opt.dur != null) {
      var rel = opt.rel || 0.06, te = t + opt.dur;
      g.gain.setValueAtTime(opt.gain, te); g.gain.setTargetAtTime(0, te, rel / 3);
      rec.end = Math.min(rec.end, te + rel * 2);
      src.stop(rec.end + 0.02);
    }
    if (opt.group) { var prev = this.voices[opt.group]; if (prev && prev.t < start + 1e-4) this.choke(prev, start, opt.chokeTau); this.voices[opt.group] = rec; }
    this.active.push(rec);
    src.onended = function () { var i = self.active.indexOf(rec); if (i >= 0) self.active.splice(i, 1); };
    return rec;
  };
  Engine.prototype.choke = function (rec, t, tau) {
    try { rec.g.gain.cancelScheduledValues(t); rec.g.gain.setTargetAtTime(0, t, tau || 0.012); rec.src.stop(t + (tau || 0.012) * 8); } catch (e) { /* already stopped */ }
  };
  Engine.prototype.stopAll = function () {
    var t = this.ctx.currentTime, self = this;
    this.active.slice().forEach(function (r) { self.choke(r, t, 0.02); });
    this.active = []; this.voices = {};
  };
  function rnd(a) { return (Math.random() * 2 - 1) * a; }
  Engine.prototype.pitched = function (list, midi, vel, soft, loud, thr) {
    var layer = vel >= thr ? loud : soft, best = null, ties = [];
    list.forEach(function (e) { if (e.vel !== layer) return; if (!best || Math.abs(e.midi - midi) < Math.abs(best.midi - midi)) best = e; });
    if (!best) return null;
    list.forEach(function (e) { if (e.vel === layer && e.midi === best.midi) ties.push(e); });
    return ties[Math.floor(Math.random() * ties.length)]; // round-robin: pick one of the recordings at random
  };
  Engine.prototype.drum = function (name, t, v) {
    var files = S.drums[name]; if (!files) return;
    var n = files.length, idx = Math.max(0, Math.min(n - 1, Math.floor(v * n * 0.999 + rnd(0.6))));
    var e = this.s[files[idx]]; if (!e) return;
    var hat = name === "hhc" || name === "hho" || name === "hhp";
    if (hat && this.voices.hat && name !== "hho") this.choke(this.voices.hat, t, 0.01);
    var g = (0.55 + 0.45 * v) * (name === "crash" ? 0.6 : name === "ride" ? 0.55 : hat ? 0.5 : name === "xstick" ? 0.7 : 1);
    var rec = this.voice(e, t, { gain: g, dest: name === "kick" ? this.kickIn : this.bus.drums, rate: 1 + rnd(0.006) });
    if (hat) this.voices.hat = rec;
    if (name === "kick") this.sub(t, v);
  };
  /* Sine sub under the kick, tuned to 3/4 of the kick's measured 83.5 Hz fundamental (62.6 Hz), with a short pitch drop */
  Engine.prototype.sub = function (t, v) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain(), self = this, start = Math.max(t, c.currentTime);
    o.type = "sine"; o.frequency.setValueAtTime(125, start); o.frequency.exponentialRampToValueAtTime(62.6, start + 0.03);
    var pk = 0.32 * (0.5 + 0.5 * v);
    g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(pk, start + 0.004); g.gain.setTargetAtTime(0, start + 0.03, 0.09);
    o.connect(g); g.connect(this.bus.drums); o.start(start); o.stop(start + 0.6);
    var rec = { src: o, g: g, t: start, end: start + 0.6 }; this.active.push(rec);
    o.onended = function () { var i = self.active.indexOf(rec); if (i >= 0) self.active.splice(i, 1); };
  };
  Engine.prototype.bass = function (midi, t, v, dur) {
    var e = this.pitched(S.bass, midi, v, "mp", "mf", 0.85); if (!e || !this.s[e.file]) return;
    this.voice(this.s[e.file], t, { gain: 0.5 + 0.5 * v, dest: this.bus.bass, rate: Math.pow(2, (midi - e.midi - (e.tune || 0) / 100) / 12), dur: dur, rel: 0.07, group: "bass" });
  };
  Engine.prototype.note = function (midi, t, v, dur, group, art) {
    var pm = art === "pm" && S.gst && S.gst.length;
    var e = pm ? this.pitched(S.gst, midi, v, "st", "st", 2) : this.pitched(S.gtr, midi, v, "mf", "f", 0.8);
    if (!e || !this.s[e.file]) return;
    var rate = Math.pow(2, (midi - e.midi - (e.tune || 0) / 100) / 12);
    if (pm) { this.voice(this.s[e.file], t, { gain: 0.45 + 0.6 * v, dest: this.pmIn, rate: rate, dur: dur, rel: 0.05, group: group, chokeTau: 0.02 }); return; }
    // ring like a string: let go with a ~120 ms damp, not a key-off
    this.voice(this.s[e.file], t, { gain: 0.35 + 0.6 * v, dest: this.bus.gtr, rate: rate, dur: dur, rel: 0.12, group: group, chokeTau: 0.035 });
    // onset-only pick/string attack layer
    var c = this.ctx, src = c.createBufferSource(), g = c.createGain(), start = Math.max(t, c.currentTime), pk = 0.9 * v * v;
    src.buffer = this.s[e.file].buf; src.playbackRate.value = rate;
    g.gain.setValueAtTime(pk, start); g.gain.setTargetAtTime(0, start + 0.006, 0.01);
    src.connect(g); g.connect(this.attackIn); src.start(start, this.s[e.file].off); src.stop(start + 0.08);
  };
  /* Strum: down = low to high, up = high to low (top two strings, lighter), A = single notes (arpeggio / boom-chick) */
  /* Strum: downstrokes low -> high, upstrokes high -> low. 8-25 ms between strings (softer = slower sweep),
     each string with its own small timing and velocity variation. Palm-muted chugs are tighter (6-10 ms). */
  Engine.prototype.strum = function (notes, strs, dir, t, v, dur, art) {
    var self = this, list = notes.map(function (m, i) { return { m: m, s: strs ? strs[i] : i }; });
    if (dir === "U") list = list.reverse();
    var gap = art === "pm" ? 0.006 + 0.004 * Math.random() : dir === "U" ? 0.008 + 0.006 * Math.random() : Math.min(0.025, 0.009 + 0.014 * (1 - v) + 0.003 * Math.random());
    var tt = t;
    list.forEach(function (x, i) {
      var shape = dir === "U" ? 1 - i * 0.07 : (i === 0 ? 1.04 : 1 - i * 0.035);
      var vv = Math.max(0.15, Math.min(1, v * shape * (1 + rnd(0.08))));
      self.note(x.m, tt + rnd(0.0015), vv, dur == null ? null : Math.max(0.05, dur - (tt - t)), "s" + x.s, art);
      tt += gap * (0.85 + 0.3 * Math.random());
    });
  };

  /* ---------- transport (shared by live play and the offline preview) ---------- */
  function Transport(engine, opts) {
    this.e = engine; this.ctx = engine.ctx; this.o = opts; this.queue = []; this.ui = [];
  }
  Transport.prototype.begin = function (t0) {
    var o = this.o;
    this.bar = 0; this.pass = 0; this.nextBar = t0; this.finished = false;
    if (o.countIn) { this.push(D.countIn(4), t0, 60 / o.bpm, true); this.nextBar = t0 + 4 * 60 / o.bpm; }
    this.firstBar = this.nextBar;
  };
  Transport.prototype.push = function (events, barStart, spb, isCount) {
    var st = D.style(this.o.style), self = this;
    events.forEach(function (ev) {
      if (self.o.only && (ev.k === "d" || ev.k === "b" || ev.k === "g") && self.o.only.indexOf(ev.k === "d" ? ev.name : ev.k) < 0) return; // test hook: isolate one sound
      var t = barStart + ev.b * spb + (isCount ? 0 : D.swingDelay(ev.b, st, spb));
      if (ev.k === "d" || ev.k === "b" || ev.k === "g") {
        t += rnd(ev.k === "d" ? 0.003 : ev.k === "b" ? 0.003 : 0.005);
        if (ev.name === "kick" && Math.abs(ev.b - Math.round(ev.b)) < 1e-6) t -= 0.002; // kick a hair ahead: pocket
      }
      self.queue.push({ t: t, ev: ev, spb: spb });
    });
    this.queue.sort(function (a, b) { return a.t - b.t; });
  };
  Transport.prototype.genBars = function (until) {
    var o = this.o;
    while (!this.finished && this.nextBar < until) {
      var sched = o.sched, spb = 60 / o.bpm;
      if (this.bar >= sched.bars) {
        if (!o.loop) { this.finishHit(this.nextBar, spb); this.finished = true; break; }
        this.bar = 0; this.pass++;
      }
      var ev = D.barEvents(sched, o.style, this.bar, { crash: this.bar === 0 && (this.pass === 0 || this.pass % 2 === 0), fill: true });
      this.push(ev, this.nextBar, spb, false);
      var barBeats = Math.min(4, sched.totalBeats - this.bar * 4);
      this.nextBar += barBeats * spb; this.bar++;
    }
  };
  Transport.prototype.finishHit = function (t, spb) {
    var sched = this.o.sched;
    this.push([{ k: "d", name: "crash", b: 0, v: 0.9 }, { k: "d", name: "kick", b: 0, v: 1 }, { k: "b", midi: D.bassRoot(window_pc(sched.items[0].chord.root)), b: 0, dur: 3.5, v: 0.95 },
      Object.assign({ dir: "D", art: "ord", b: 0, v: 0.95, dur: null, k: "g" }, D.rhythm(sched, 0, "all")), { k: "ui", i: 0, b: 0 }, { k: "end", b: 4 }], t, spb, true);
  };
  function window_pc(n) { return root.TQ.pcOf(n); }
  Transport.prototype.dispatch = function (until) {
    var e = this.e;
    while (this.queue.length && this.queue[0].t < until) {
      var q = this.queue.shift(), ev = q.ev, t = q.t;
      var hv = function (v) { return Math.max(0.05, Math.min(1, v * (1 + rnd(0.08)))); };
      if (ev.k === "d") e.drum(ev.name, t, hv(ev.v));
      else if (ev.k === "b") e.bass(ev.midi, t, hv(ev.v), ev.dur * q.spb);
      else if (ev.k === "g") { if (ev.dir === "A") e.note(ev.notes[0], t, hv(ev.v), ev.dur == null ? null : ev.dur * q.spb, "s" + (ev.strs ? ev.strs[0] : 0), ev.art); else e.strum(ev.notes, ev.strs, ev.dir, t, hv(ev.v), ev.dur == null ? null : ev.dur * q.spb, ev.art); }
      else this.ui.push({ t: t, ev: ev });
    }
  };

  /* ---------- live player ---------- */
  var live = { engine: null, samples: null, loading: null, timer: null, tr: null, raf: 0, listeners: {}, playing: false, settings: { drums: 0.9, bass: 0.72, gtr: 0.72, mDrums: false, mBass: false, mGtr: false, out: 0.9 } };
  function emit(name, data) { (live.listeners[name] || []).forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }
  function on(name, f) { (live.listeners[name] = live.listeners[name] || []).push(f); }
  function off(name) { delete live.listeners[name]; }
  function ctx() { return root.TQAudio && root.TQAudio.context ? root.TQAudio.context() : null; }
  function load(onProgress) {
    if (live.engine) return Promise.resolve(live.engine);
    if (live.loading) return live.loading;
    var c = ctx(); if (!c) return Promise.reject(new Error("Web Audio is not available"));
    live.loading = loadInto(c, onProgress).then(function (r) {
      live.samples = r.map; live.failed = r.failed;
      live.engine = new Engine(c, r.map); applySettings(); return live.engine;
    });
    return live.loading;
  }
  function applySettings() {
    var e = live.engine, s = live.settings; if (!e) return;
    e.level = { drums: s.drums, bass: s.bass, gtr: s.gtr }; e.muted = { drums: s.mDrums, bass: s.mBass, gtr: s.mGtr };
    ["drums", "bass", "gtr"].forEach(function (k) { e.applyMix(k); }); e.setOut(s.out);
  }
  function play(opts) {
    var e = live.engine; if (!e) return false;
    stop(true);
    var c = e.ctx; if (c.state === "suspended" && c.resume) c.resume();
    e.setReverb(D.style(opts.style).rev);
    live.tr = new Transport(e, opts); live.tr.begin(c.currentTime + 0.12); live.playing = true;
    var tick = function () {
      var tr = live.tr; if (!tr) return;
      tr.genBars(c.currentTime + BAR_AHEAD); tr.dispatch(c.currentTime + LOOKAHEAD);
    };
    tick(); live.timer = setInterval(tick, TICK_MS);
    var frame = function () {
      var tr = live.tr; if (!tr) return;
      var now = c.currentTime - (c.outputLatency || c.baseLatency || 0) * 0.5;
      while (tr.ui.length && tr.ui[0].t <= now) {
        var u = tr.ui.shift();
        if (u.ev.k === "end") { stop(); emit("end"); return; }
        emit(u.ev.k, u.ev);
      }
      live.raf = root.requestAnimationFrame(frame);
    };
    live.raf = root.requestAnimationFrame(frame);
    emit("state", true);
    return true;
  }
  function update(opts) { if (live.tr) { Object.assign(live.tr.o, opts); if (opts.style) live.engine.setReverb(D.style(opts.style).rev); } }
  function stop(silent) {
    if (live.timer) clearInterval(live.timer); live.timer = null;
    if (live.raf) root.cancelAnimationFrame(live.raf); live.raf = 0;
    live.tr = null;
    if (live.engine) live.engine.stopAll();
    var was = live.playing; live.playing = false;
    if (!silent && was) emit("state", false);
  }
  function tapNote(midi) {
    var e = live.engine;
    if (!e) { if (root.TQAudio) root.TQAudio.pluck(midi); return; }
    var c = e.ctx; if (c.state === "suspended" && c.resume) c.resume();
    e.note(midi, c.currentTime + 0.005, 0.75, 1.6, "tap" + midi);
  }
  function set(k, v) {
    live.settings[k] = v; applySettings();
  }

  /* ---------- offline render (preview file + tests) ---------- */
  function render(opts) {
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, sr = 44100;
    var oc = new OAC(2, Math.ceil(sr * opts.seconds), sr);
    return loadInto(oc).then(function (r) {
      var e = new Engine(oc, r.map);
      if (opts.mix) Object.keys(opts.mix).forEach(function (k) { e.setLevel(k, opts.mix[k]); });
      e.mix.drums.gain.value = e.muted.drums ? 0 : e.level.drums; e.mix.bass.gain.value = e.level.bass; e.mix.gtr.gain.value = e.level.gtr; e.out.gain.value = 0.9;
      e.setReverb(D.style(opts.style).rev); e.send.gtr.gain.value = D.style(opts.style).rev * 1.25; e.send.drums.gain.value = D.style(opts.style).rev * 0.6;
      var tr = new Transport(e, opts); tr.begin(0.05);
      tr.genBars(opts.seconds - (opts.tail || 0)); tr.dispatch(opts.seconds);
      // fade the end so the preview doesn't cut off mid-note
      var fadeAt = opts.seconds - 1.2; e.out.gain.setValueAtTime(0.9, fadeAt); e.out.gain.linearRampToValueAtTime(0, opts.seconds - 0.05);
      return oc.startRendering().then(function (buf) { return { buffer: buf, failed: r.failed }; });
    });
  }

  root.TQJam = { load: load, play: play, stop: stop, update: update, tapNote: tapNote, set: set, on: on, off: off, render: render,
    get playing() { return live.playing; }, get ready() { return !!live.engine; }, get failed() { return live.failed || []; }, files: allFiles, _live: live };
})(typeof self !== "undefined" ? self : globalThis);
