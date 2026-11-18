/* Triad Quest - Jam data: backing-track progressions, voicings, pentatonic boxes and the bar-by-bar
   event patterns for each style. Pure functions (no DOM, no audio) so they can be unit-tested. */
(function (root) {
  "use strict";
  var TQ = root.TQ || (typeof require === "function" ? require("./theory.js") : null);
  var mod = TQ.mod, pcOf = TQ.pcOf;
  var HOME = 5; // comfortable starting area on the neck (frets 3-8)

  function P(d, beats, q) { return { d: d, beats: beats || 4, q: q || null }; }
  var TRACKS = [
    { id: "kevin", part: 0, title: "Kevin's E jam", prog: [P(0), P(3), P(5), P(4)], key: "E", shape: "lead", pent: true, style: "rock", bpm: 92,
      tip: "Solo with C♯m pentatonic (the same notes as E major pentatonic). Aim for the lit chord tones as each chord lands." },
    { id: "p1", part: 1, title: "I – IV – V", prog: [P(0), P(3), P(4), P(0)], shape: 0, style: "rock", bpm: 84,
      tip: "Same inversion for every chord: find each one before it arrives. Switch the inversion to drill all three." },
    { id: "p2", part: 2, title: "I – IV – I – V", prog: [P(0), P(3), P(0), P(4)], shape: "lead", style: "country", bpm: 96,
      tip: "Closest shape every time: shared notes stay put, the rest move a fret or two." },
    { id: "p3a", part: 3, title: "I – vi – IV – V", prog: [P(0), P(5), P(3), P(4)], shape: "lead", style: "ballad", bpm: 72,
      tip: "The '50s / doo-wop loop. Let each triad ring and listen for the moving top note." },
    { id: "p3b", part: 3, title: "ii – V – I", prog: [P(1), P(4), P(0, 8)], shape: "lead", style: "shuffle", bpm: 88,
      tip: "The most common cadence in music. The 3rd of each chord slides down a fret into the next." },
    { id: "p3c", part: 3, title: "I – V – vi – IV", prog: [P(0), P(4), P(5), P(3)], shape: "lead", style: "rock", bpm: 100,
      tip: "The 'four-chord song'. Try it in one inversion, then voice-led." },
    { id: "p4a", part: 4, title: "Em – C – G – D", prog: [P(5), P(3), P(0), P(4)], shape: "lead", pent: true, style: "ballad", bpm: 74,
      tip: "Minor colour: vi–IV–I–V. Em pentatonic fits the whole loop." },
    { id: "p4b", part: 4, title: "Sus4 resolutions", prog: [P(0, 2, "sus4"), P(0, 2), P(3, 2, "sus4"), P(3, 2), P(4, 2, "sus4"), P(4, 2), P(0, 4)], shape: "lead", style: "country", bpm: 88,
      tip: "Raise the 3rd a fret for sus4, then let it fall back. Same spot, one finger moves." }
  ];
  var STYLES = [
    { id: "rock", label: "Rock 8ths", steps: 16, swing: 0, rev: 0.16 },
    { id: "shuffle", label: "Blues shuffle", steps: 12, swing: 0, rev: 0.2 },
    { id: "country", label: "Country", steps: 16, swing: 0.18, rev: 0.14 },
    { id: "ballad", label: "Ballad", steps: 16, swing: 0, rev: 0.34 }
  ];
  var SHAPE_MODES = [["lead", "Voice-led"], [0, "Root pos"], [1, "1st inv"], [2, "2nd inv"]];

  function track(id) { return TRACKS.filter(function (t) { return t.id === id; })[0] || TRACKS[0]; }
  function style(id) { return STYLES.filter(function (s) { return s.id === id; })[0] || STYLES[0]; }
  function keyIndex(id) { var i = TQ.KEYS.findIndex(function (k) { return k.id === id; }); return i < 0 ? 0 : i; }
  function center(p) { return (Math.max.apply(null, p.frets) + Math.min.apply(null, p.frets)) / 2; }

  /* Pick one placement per chord. Voice-led: try every start, walk to the closest shape each time and
     include the jump from the last chord back to the first, so the loop flows. Fixed: same inversion. */
  function voice(chords, setIdx, mode) {
    var set = TQ.SETS[setIdx];
    var cands = chords.map(function (c) { return TQ.placements(c, set, mode === "lead" ? null : mode); });
    var best = null;
    cands[0].forEach(function (start) {
      var path = [start], cost = 0;
      for (var i = 1; i < chords.length; i++) {
        var prev = path[i - 1];
        var nx = cands[i].slice().sort(function (a, b) {
          return (TQ.moveCost(a.frets, prev.frets) - TQ.moveCost(b.frets, prev.frets)) || (Math.abs(center(a) - HOME) - Math.abs(center(b) - HOME));
        })[0];
        cost += TQ.moveCost(nx.frets, prev.frets); path.push(nx);
      }
      if (chords.length > 1) cost += TQ.moveCost(path[0].frets, path[path.length - 1].frets);
      var avg = path.reduce(function (s, p) { return s + center(p); }, 0) / path.length;
      var score = cost + 1.5 * Math.abs(avg - HOME) + (Math.max.apply(null, path.map(function (p) { return Math.max.apply(null, p.frets); })) > 12 ? 6 : 0);
      if (!best || score < best.score) best = { score: score, path: path };
    });
    return best.path;
  }

  function roman(d, q) {
    var r = TQ.ROMAN[d];
    if (q === "sus4") return r.toUpperCase().replace("°", "") + "sus4";
    return r;
  }

  /* Full schedule for a track in a key on a string set. */
  function build(trackId, keyIdx, setIdx, mode) {
    var t = track(trackId), key = TQ.KEYS[keyIdx], dia = TQ.diatonic(key.root);
    if (mode === undefined || mode === null) mode = t.shape;
    var chords = t.prog.map(function (p) { return p.q ? TQ.makeChord(dia[p.d].root, p.q) : dia[p.d]; });
    var pl = voice(chords, setIdx, mode), beat = 0;
    var items = t.prog.map(function (p, i) {
      var it = { chord: chords[i], beats: p.beats, startBeat: beat, placement: pl[i], roman: roman(p.d, p.q), deg: p.d };
      beat += p.beats; return it;
    });
    var prevPos = null;
    items.forEach(function (it) { it.full = fullVoicing(it.chord, prevPos); prevPos = it.full.pos; });
    return { track: t, keyIdx: keyIdx, key: key, setIdx: setIdx, set: TQ.SETS[setIdx], mode: mode, items: items, totalBeats: beat, bars: Math.ceil(beat / 4) };
  }
  function itemAt(sched, beat) {
    var b = mod(beat, sched.totalBeats);
    for (var i = sched.items.length - 1; i >= 0; i--) if (b >= sched.items[i].startBeat) return i;
    return 0;
  }
  /* ---------- rhythm-guitar voicings: real open / barre chords (4-6 strings) ---------- */
  var X = -1;
  var OPEN_CHORDS = { // pitch class of root + quality -> frets low E..high e (X = not played)
    "4maj": [0, 2, 2, 1, 0, 0], "4min": [0, 2, 2, 0, 0, 0], "4sus4": [0, 2, 2, 2, 0, 0],
    "9maj": [X, 0, 2, 2, 2, 0], "9min": [X, 0, 2, 2, 1, 0], "9sus4": [X, 0, 2, 2, 3, 0],
    "2maj": [X, X, 0, 2, 3, 2], "2min": [X, X, 0, 2, 3, 1], "2sus4": [X, X, 0, 2, 3, 3],
    "7maj": [3, 2, 0, 0, 0, 3], "7sus4": [3, 3, 0, 0, 1, 3],
    "0maj": [X, 3, 2, 0, 1, 0], "0sus4": [X, 3, 3, 0, 1, 1]
  };
  var E_SHAPE = { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], dim: [0, 1, 2, 0, X, X] };
  var A_SHAPE = { maj: [X, 0, 2, 2, 2, 0], min: [X, 0, 2, 2, 1, 0], sus4: [X, 0, 2, 2, 3, 0], dim: [X, 0, 1, 2, 1, X] };
  function shift(sh, r) { return sh.map(function (f) { return f === X ? X : f + r; }); }
  function fullOptions(c) {
    var pc = pcOf(c.root), out = [], o = OPEN_CHORDS[pc + c.q];
    if (o) out.push({ frets: o.slice(), pos: 0, kind: "open" });
    var rE = mod(pc - 4, 12), rA = mod(pc - 9, 12);
    if (E_SHAPE[c.q] && (rE > 0 || !o)) out.push({ frets: shift(E_SHAPE[c.q], rE), pos: rE, kind: "E-barre" });
    if (A_SHAPE[c.q] && (rA > 0 || !o)) out.push({ frets: shift(A_SHAPE[c.q], rA), pos: rA, kind: "A-barre" });
    return out;
  }
  /* Open chord if there is one, otherwise the barre shape lowest on the neck / closest to the previous chord. */
  function fullVoicing(c, prevPos) {
    var opts = fullOptions(c);
    opts.sort(function (a, b) {
      function sc(o) { return o.kind === "open" ? -1 : o.pos + (prevPos != null ? 0.6 * Math.abs(o.pos - prevPos) : 0) + (o.pos > 9 ? 8 : 0); }
      return sc(a) - sc(b);
    });
    return opts[0];
  }
  /* Sounding strings of a voicing, low to high, optionally a subset: "all", "low3", "top4", "top3", "upper" (drop lowest 2), "bass" */
  function rhythm(sched, i, part) {
    var v = sched.items[i].full, list = [];
    v.frets.forEach(function (f, s) { if (f !== X) list.push({ s: s, m: TQ.OPEN[s] + f }); });
    if (part === "low3") list = list.slice(0, 3);
    else if (part === "top4") list = list.slice(-4);
    else if (part === "top3") list = list.slice(-3);
    else if (part === "upper") list = list.slice(2);
    else if (part === "bass") list = list.slice(0, 1);
    else if (part === "alt") list = list.slice(1, 2);
    return { notes: list.map(function (x) { return x.m; }), strs: list.map(function (x) { return x.s; }) };
  }
  function gEv(sched, i, part, extra) { var r = rhythm(sched, i, part), e = { k: "g", notes: r.notes, strs: r.strs }; for (var k in extra) e[k] = extra[k]; return e; }

  function midis(sched, i) { var it = sched.items[i]; return it.placement.frets.map(function (f, k) { return TQ.midiAt(sched.set[k], f); }); }
  /* Chord-change times (seconds from Play) for the first `passes` loops. */
  function chordTimes(sched, bpm, countInBeats, passes) {
    var spb = 60 / bpm, out = [], off = (countInBeats || 0) * spb;
    for (var p = 0; p < (passes || 1); p++) sched.items.forEach(function (it, i) { out.push({ i: i, name: it.chord.name, t: off + (p * sched.totalBeats + it.startBeat) * spb }); });
    return out;
  }

  /* Major pentatonic of the key (= minor pentatonic of its vi). Boxes = 12 consecutive scale notes from a
     low-E note, two per string. Returns the box closest to where the triads sit. */
  function pentPcs(keyIdx) { var r = pcOf(TQ.KEYS[keyIdx].root); return [0, 2, 4, 7, 9].map(function (x) { return mod(r + x, 12); }); }
  function pentBoxes(keyIdx) {
    var pcs = pentPcs(keyIdx), boxes = [];
    for (var f0 = 0; f0 <= 15; f0++) {
      if (pcs.indexOf(mod(TQ.OPEN[0] + f0, 12)) < 0) continue;
      var notes = [], p = TQ.OPEN[0] + f0, ok = true;
      for (var n = 0; n < 12; n++) {
        var s = Math.floor(n / 2), f = p - TQ.OPEN[s];
        if (f < 0 || f > TQ.MAXF) ok = false;
        notes.push({ s: s, f: f, midi: p });
        do { p++; } while (pcs.indexOf(mod(p, 12)) < 0);
      }
      if (ok) boxes.push({ start: f0, notes: notes, lo: Math.min.apply(null, notes.map(function (x) { return x.f; })), hi: Math.max.apply(null, notes.map(function (x) { return x.f; })) });
    }
    return boxes;
  }
  function pentBox(sched, shift) {
    var boxes = pentBoxes(sched.keyIdx);
    var c = sched.items.reduce(function (s, it) { return s + center(it.placement); }, 0) / sched.items.length;
    var order = boxes.map(function (b, i) { return { i: i, d: Math.abs((b.lo + b.hi) / 2 - c) }; }).sort(function (a, b) { return a.d - b.d; });
    var idx = order[0].i + (shift || 0);
    return boxes[mod(idx, boxes.length)];
  }
  function relMinorName(keyIdx) { return TQ.nm(TQ.diatonic(TQ.KEYS[keyIdx].root)[5].root) + "m"; }

  /* ---------- per-bar event patterns ---------- */
  var V = { "X": 1, "x": 0.78, "o": 0.55, "g": 0.28, "-": 0, ".": 0 };
  function line(str, name, steps, out, scale) {
    for (var i = 0; i < str.length; i++) { var v = V[str[i]]; if (v) out.push({ k: "d", name: name, b: i * 4 / steps, v: v * (scale || 1) }); }
  }
  var DRUMS = {
    rock: { kick: "X.......X.x.....", snare: "....X.......X...", hhc: "x.o.x.o.x.o.x.o.", fill: { snare: "............Xxox", kick: "X.......X.......", hhc: "x.o.x.o.x.o....." } },
    shuffle: { kick: "X.....X.....", snare: "...X.....X..", ride: "X.oX.oX.oX.o", hhp: "...o.....o..", fill: { snare: "...X.....XgX", kick: "X.....X.....", ride: "X.oX.oX.o..." } },
    country: { kick: "X.......X.......", xstick: "....X.......X...", hhc: "o.g.o.g.o.g.o.g.", fill: { kick: "X.......X.......", xstick: "....X.......", snare: "............x.X.", hhc: "o.g.o.g.o.g....." } },
    ballad: { kick: "X.........o.....", snare: "........X.......", hhc: "o.g.o.g.o.g.o.g.", fill: { kick: "X.........o.....", snare: "........X...o.xX", hhc: "o.g.o.g.o.g....." } }
  };
  function bassRoot(pc) { return 28 + mod(pc - 4, 12); }
  function fifthOf(r) { return r + 7 <= 47 ? r + 7 : r - 5; }

  /* All note/drum events for bar `bar` (0-based within the loop). Beat positions are 0..4 within the bar. */
  function barEvents(sched, styleId, bar, opts) {
    opts = opts || {};
    var st = style(styleId), steps = st.steps, ev = [], pat = DRUMS[st.id];
    var last = bar === sched.bars - 1, useFill = last && opts.fill !== false;
    var p = useFill ? pat.fill : pat;
    Object.keys(pat).forEach(function (name) { if (name !== "fill" && (p[name] || pat[name])) line(p[name] !== undefined ? p[name] : pat[name], name, steps, ev); });
    if (opts.crash) ev.push({ k: "d", name: "crash", b: 0, v: 0.75 });
    function at(beatInBar) { var i = itemAt(sched, bar * 4 + beatInBar); var it = sched.items[i]; return { i: i, it: it, inChord: bar * 4 + beatInBar - it.startBeat, nx: sched.items[(i + 1) % sched.items.length] }; }
    // chord-change markers for the UI
    sched.items.forEach(function (it, i) { var rel = it.startBeat - bar * 4; if (rel >= 0 && rel < 4) ev.push({ k: "ui", i: i, b: rel }); });
    for (var bt = 0; bt < 4; bt++) ev.push({ k: "beat", n: bt, b: bt });
    var s, c, r, notes;
    if (st.id === "rock") {
      for (s = 0; s < 16; s += 2) {
        c = at(s / 4); r = bassRoot(pcOf(c.it.chord.root));
        var endOfChord = c.inChord + 0.5 >= c.it.beats && c.nx !== c.it;
        var nr = bassRoot(pcOf(c.nx.chord.root));
        var m = endOfChord ? (nr > r ? nr - 1 : nr + 1) : (s % 8 === 6 && c.inChord % 4 >= 3 ? r + 12 : r);
        if (m > 52) m -= 12;
        ev.push({ k: "b", midi: m, b: s / 4, dur: 0.42, v: s % 4 === 0 ? 0.9 : 0.72 });
      }
      // rhythm guitar: full chord on 1 and 3, palm-muted chugs on the low strings in between, a light upstroke on 3-and-a-half
      var dyn = bar % 2 ? 0.93 : 1;
      [[0, "all", "D", 0.95, 0.95], [1, "low3", "PM", 0.62], [2, "low3", "PM", 0.72], [3, "low3", "PM", 0.6],
       [4, "all", "D", 0.86, 0.9], [5, "low3", "PM", 0.6], [6, "top4", "U", 0.52, 0.45], [7, "low3", "PM", 0.68]].forEach(function (x) {
        c = at(x[0] / 2);
        ev.push(gEv(sched, c.i, x[1], { dir: x[2] === "PM" ? "D" : x[2], art: x[2] === "PM" ? "pm" : "ord", b: x[0] / 2, v: x[3] * dyn, dur: x[2] === "PM" ? 0.42 : x[4] }));
      });
    } else if (st.id === "shuffle") {
      for (s = 0; s < 12; s++) {
        if (s % 3 === 1) continue;
        c = at(Math.floor(s / 3) + (s % 3 === 2 ? 2 / 3 : 0));
        var minor = c.it.chord.q === "min" || c.it.chord.q === "dim";
        var seq = minor ? [0, 3, 7, 10, 12, 10, 7, 3] : c.it.chord.q === "sus4" ? [0, 5, 7, 9, 10, 9, 7, 5] : [0, 4, 7, 9, 10, 9, 7, 4];
        var k = Math.round((c.inChord % 4) * 2) % 8;
        r = bassRoot(pcOf(c.it.chord.root));
        ev.push({ k: "b", midi: r + seq[k], b: Math.floor(s / 3) + (s % 3 === 2 ? 2 / 3 : 0), dur: s % 3 === 0 ? 0.6 : 0.3, v: s % 3 === 0 ? 0.88 : 0.66 });
      }
      [[0, "all", 0.72, 0.9, "D"], [1, "top4", 0.92, 0.24, "D"], [3, "top4", 0.92, 0.24, "D"], [3 + 2 / 3, "top3", 0.5, 0.2, "U"]].forEach(function (x) {
        c = at(x[0]); ev.push(gEv(sched, c.i, x[1], { dir: x[4], art: "ord", b: x[0], v: x[2], dur: x[3] }));
      });
    } else if (st.id === "country") {
      for (bt = 0; bt < 4; bt++) {
        c = at(bt); r = bassRoot(pcOf(c.it.chord.root));
        var nxr = bassRoot(pcOf(c.nx.chord.root));
        var changing = c.inChord + 1 >= c.it.beats && c.nx !== c.it;
        if (c.inChord % 2 === 0) ev.push({ k: "b", midi: c.inChord % 4 === 0 ? r : fifthOf(r), b: bt, dur: 0.85, v: 0.9 });
        else if (changing) { var dn = nxr - 2 < 28; ev.push({ k: "b", midi: dn ? nxr + 2 : nxr - 2, b: bt, dur: 0.45, v: 0.72 }); ev.push({ k: "b", midi: dn ? nxr + 1 : nxr - 1, b: bt + 0.5, dur: 0.45, v: 0.75 }); }
        // boom-chick: bass string on 1, alternate bass string on 3, short strums of the upper strings on 2 and 4
        if (bt % 2 === 0) ev.push(gEv(sched, c.i, c.inChord % 4 === 0 ? "bass" : "alt", { dir: "A", art: "ord", b: bt, v: 0.85, dur: 0.95 }));
        else { ev.push(gEv(sched, c.i, "upper", { dir: "D", art: "ord", b: bt, v: 0.8, dur: 0.32 })); ev.push(gEv(sched, c.i, "top3", { dir: "U", art: "ord", b: bt + 0.5, v: 0.45, dur: 0.24 })); }
      }
    } else { // ballad: half-time, arpeggiated triads that ring
      for (bt = 0; bt < 4; bt += 2) {
        c = at(bt); r = bassRoot(pcOf(c.it.chord.root));
        var chg = c.inChord + 2 >= c.it.beats && c.nx !== c.it, nxr2 = bassRoot(pcOf(c.nx.chord.root));
        if (c.inChord % 4 === 0 || c.inChord === 0) ev.push({ k: "b", midi: r, b: bt, dur: chg ? 1.45 : 1.9, v: 0.88 });
        else ev.push({ k: "b", midi: fifthOf(r) > r ? r + 12 <= 47 ? r + 12 : fifthOf(r) : fifthOf(r), b: bt, dur: chg ? 1.45 : 1.9, v: 0.74 });
        if (chg) ev.push({ k: "b", midi: nxr2 > r ? nxr2 - 1 : nxr2 + 1, b: bt + 1.5, dur: 0.45, v: 0.66 });
      }
      // fingerpicked full chord: bass, then the upper strings, everything rings
      for (s = 0; s < 8; s++) {
        c = at(s / 2); var all = rhythm(sched, c.i, "all"), n = all.notes.length;
        var ix = [0, n - 3, n - 2, n - 1, n - 2, n - 3, 1, n - 2][s];
        ev.push({ k: "g", notes: [all.notes[ix]], strs: [all.strs[ix]], dir: "A", art: "ord", b: s / 2, v: s % 2 === 0 ? 0.8 : 0.62, dur: null });
      }
    }
    // a bar past the end of a short progression (e.g. 2-beat chords) never happens: bars = ceil(total/4)
    ev = ev.filter(function (e) { return bar * 4 + e.b < sched.totalBeats + 1e-9; });
    return ev.sort(function (a, b) { return a.b - b.b; });
  }
  function countIn(beats) { var ev = []; for (var i = 0; i < beats; i++) ev.push({ k: "d", name: "xstick", b: i, v: i === 0 ? 1 : 0.7 }, { k: "count", n: beats - i, b: i }); return ev; }
  function swingDelay(b, st, spb) {
    if (!st.swing) return 0;
    var frac = b - Math.floor(b);
    return Math.abs(frac - 0.5) < 1e-6 ? st.swing * spb / 6 : 0;
  }

  var api = { TRACKS: TRACKS, STYLES: STYLES, SHAPE_MODES: SHAPE_MODES, track: track, style: style, keyIndex: keyIndex, voice: voice, build: build, itemAt: itemAt,
    midis: midis, rhythm: rhythm, fullVoicing: fullVoicing, fullOptions: fullOptions, chordTimes: chordTimes, pentPcs: pentPcs, pentBoxes: pentBoxes, pentBox: pentBox, relMinorName: relMinorName, barEvents: barEvents, countIn: countIn,
    swingDelay: swingDelay, bassRoot: bassRoot };
  root.TQJamData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
