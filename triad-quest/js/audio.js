/* Triad Quest - Web Audio engine. Karplus-Strong plucked strings, chimes, metronome.
   Audio starts only after a user gesture (iOS requirement). */
(function (root) {
  "use strict";
  var ctx = null, master = null, comp = null, wet = null;
  var cache = {};
  var muted = false, volume = 0.8;
  var unlocked = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      if (root.navigator && root.navigator.audioSession) root.navigator.audioSession.type = "playback"; // play even with the iOS ring/silent switch on (Safari 17+)
    } catch (e) { /* not supported */ }
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    // small "room": two short feedback delays for a touch of body
    var dry = ctx.createGain(); dry.gain.value = 1;
    wet = ctx.createGain(); wet.gain.value = 0.16;
    var d1 = ctx.createDelay(); d1.delayTime.value = 0.029;
    var d2 = ctx.createDelay(); d2.delayTime.value = 0.047;
    var fb = ctx.createGain(); fb.gain.value = 0.32;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    wet.connect(d1); d1.connect(d2); d2.connect(lp); lp.connect(fb); fb.connect(d1); lp.connect(master);
    dry.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
    ctx._dry = dry;
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (!c) return;
    if (c.state === "suspended" && c.resume) c.resume();
    if (!unlocked) {
      // play a one-sample silent buffer inside the gesture to unlock iOS audio
      try { var b = c.createBuffer(1, 1, 22050); var s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) { /* ignore */ }
      unlocked = true;
    }
  }

  /* Karplus-Strong: noise burst in a delay line with a two-point averaging low-pass.
     y[n] = 0.5*(y[n-P] + y[n-P+1]) has an effective loop delay of P - 0.5 samples, so the native
     pitch is sr / (P - 0.5); playbackRate then corrects it to the exact equal-tempered pitch. */
  function pluckBuffer(midi) {
    if (cache[midi]) return cache[midi];
    var c = ctx, sr = c.sampleRate, f = 440 * Math.pow(2, (midi - 69) / 12);
    var P = Math.max(3, Math.ceil(sr / f + 0.5));
    var dur = midi < 52 ? 3.2 : midi < 60 ? 2.6 : 2.1;
    var n = Math.floor(sr * dur);
    var buf = c.createBuffer(1, n, sr), out = buf.getChannelData(0);
    var line = new Float32Array(P);
    // pluck excitation: noise shaped with a soft low-pass (finger/pick tone) and pluck position comb
    var prev = 0;
    for (var i = 0; i < P; i++) { var w = Math.random() * 2 - 1; prev = prev + 0.55 * (w - prev); line[i] = prev; }
    var pos = Math.floor(P * 0.18);
    var tmp = new Float32Array(P);
    for (i = 0; i < P; i++) tmp[i] = line[i] - 0.6 * line[(i + pos) % P];
    line = tmp;
    var decay = midi < 52 ? 0.9965 : midi < 60 ? 0.9958 : 0.995;
    var idx = 0, last = 0;
    for (i = 0; i < n; i++) {
      var cur = line[idx];
      var nxt = line[(idx + 1) % P];
      var v = decay * 0.5 * (cur + nxt);
      line[idx] = v;
      out[i] = cur;
      idx = (idx + 1) % P;
    }
    // normalize + gentle fade at the end
    var peak = 0; for (i = 0; i < n; i++) { var a = Math.abs(out[i]); if (a > peak) peak = a; }
    var g = peak > 0 ? 0.6 / peak : 1;
    var fade = Math.floor(sr * 0.25);
    for (i = 0; i < n; i++) { out[i] *= g; if (i > n - fade) out[i] *= (n - i) / fade; }
    var entry = { buf: buf, rate: f * (P - 0.5) / sr };
    cache[midi] = entry;
    return entry;
  }

  function pluck(midi, when, gainVal) {
    var c = ensure(); if (!c || muted) return;
    unlock();
    var e = pluckBuffer(midi);
    var t = (when || c.currentTime) + 0.005;
    var src = c.createBufferSource(); src.buffer = e.buf; src.playbackRate.value = e.rate;
    var body = c.createBiquadFilter(); body.type = "peaking"; body.frequency.value = 180; body.Q.value = 1.1; body.gain.value = 4;
    var tone = c.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 5200;
    var gn = c.createGain(); gn.gain.value = gainVal == null ? 0.9 : gainVal;
    src.connect(body); body.connect(tone); tone.connect(gn); gn.connect(c._dry); gn.connect(wet);
    src.start(t);
    src.stop(t + e.buf.duration / e.rate + 0.05);
  }

  function strum(midis, gap) {
    var c = ensure(); if (!c || muted) return;
    var t = c.currentTime + 0.02;
    midis.forEach(function (m, i) { pluck(m, t + i * (gap == null ? 0.07 : gap), 0.75); });
  }

  function tone(freq, start, dur, type, peak) {
    var c = ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak || 0.25, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(c._dry); g.connect(wet);
    o.start(start); o.stop(start + dur + 0.05);
    return o;
  }
  function chime(kind) {
    var c = ensure(); if (!c || muted) return;
    unlock();
    var t = c.currentTime + 0.02;
    if (kind === "ok") { tone(1318.5, t, 0.35, "sine", 0.16); tone(1975.5, t + 0.09, 0.5, "sine", 0.14); }
    else if (kind === "miss") { var o = tone(196, t, 0.32, "triangle", 0.2); o.frequency.exponentialRampToValueAtTime(147, t + 0.3); }
    else if (kind === "fanfare") { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, t + i * 0.09, 0.6, "triangle", 0.13); }); }
    else if (kind === "star") { tone(1568, t, 0.25, "sine", 0.12); tone(2093, t + 0.06, 0.35, "sine", 0.1); }
    else if (kind === "tick") { tone(1800, t, 0.05, "square", 0.06); }
  }

  // metronome (look-ahead scheduler)
  var metroTimer = null, nextBeat = 0, beat = 0, bpm = 0;
  function metroStart(b) {
    var c = ensure(); if (!c) return;
    metroStop(); bpm = b; beat = 0; nextBeat = c.currentTime + 0.1;
    metroTimer = setInterval(function () {
      if (!ctx) return;
      while (nextBeat < ctx.currentTime + 0.12) {
        if (!muted) { var acc = beat % 4 === 0; tone(acc ? 1600 : 1100, nextBeat, 0.05, "square", acc ? 0.07 : 0.045); }
        nextBeat += 60 / bpm; beat++;
      }
    }, 25);
  }
  function metroStop() { if (metroTimer) clearInterval(metroTimer); metroTimer = null; }

  function setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : volume; }
  function setVolume(v) { volume = v; if (master && !muted) master.gain.value = v; }

  root.TQAudio = { context: function () { return ensure(); }, unlock: unlock, pluck: pluck, strum: strum, chime: chime, metroStart: metroStart, metroStop: metroStop, setMuted: setMuted, setVolume: setVolume, _debugPluck: function (midi) { if (!ensure()) return null; var e = pluckBuffer(midi); return { data: Array.prototype.slice.call(e.buf.getChannelData(0), 2048, 2048 + 16384), rate: e.rate, sr: ctx.sampleRate }; }, isSupported: function () { return !!(root.AudioContext || root.webkitAudioContext); } };
})(typeof self !== "undefined" ? self : globalThis);
