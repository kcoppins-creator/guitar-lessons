/* Triad Quest - music theory engine. Pure functions, no DOM.
   Every shape is computed from string tuning + fret number; nothing is hand-typed. */
(function (root) {
  "use strict";
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  var OPEN = [40, 45, 50, 55, 59, 64]; // MIDI: low E2 .. high E4 (standard tuning)
  var MAXF = 15;
  var SETS = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5]];
  var SET_SHORT = ["E-A-D", "A-D-G", "D-G-B", "G-B-E"];
  var STR_NAME = ["low E (6th)", "A (5th)", "D (4th)", "G (3rd)", "B (2nd)", "high E (1st)"];
  var STR_LETTER = ["E", "A", "D", "G", "B", "e"];
  var MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  var DEG_Q = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  var ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  var Q_INT = {
    maj: [[0, 0], [2, 4], [4, 7]], min: [[0, 0], [2, 3], [4, 7]],
    dim: [[0, 0], [2, 3], [4, 6]], sus4: [[0, 0], [3, 5], [4, 7]]
  };
  var Q_SUFFIX = { maj: "", min: "m", dim: "dim", sus4: "sus4" };
  var INV_NAME = ["root position", "1st inversion", "2nd inversion"];
  var INV_HOW = ["root on the lowest string", "3rd on the lowest string", "5th on the lowest string"];
  var SHIFT = { maj: [0, 0, 0], min: [0, -1, 0], dim: [0, -1, -1], sus4: [0, 1, 0] };
  var SHIFT_HINT = {
    maj: "",
    min: "Minor: lower the 3rd by one fret. Root and 5th stay put.",
    dim: "Diminished: lower the 3rd and the 5th by one fret each. Root stays put.",
    sus4: "Sus4: raise the 3rd one fret so it becomes the 4th. Root and 5th stay put."
  };
  var SHARP_N = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  var FLAT_N = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  var KEYS = [
    { id: "G", label: "G major", root: { l: 4, a: 0 }, flat: false },
    { id: "C", label: "C major", root: { l: 0, a: 0 }, flat: false },
    { id: "D", label: "D major", root: { l: 1, a: 0 }, flat: false },
    { id: "A", label: "A major", root: { l: 5, a: 0 }, flat: false },
    { id: "E", label: "E major", root: { l: 2, a: 0 }, flat: false },
    { id: "B", label: "B major", root: { l: 6, a: 0 }, flat: false },
    { id: "F#", label: "F♯ major", root: { l: 3, a: 1 }, flat: false },
    { id: "Db", label: "D♭ major", root: { l: 1, a: -1 }, flat: true },
    { id: "Ab", label: "A♭ major", root: { l: 5, a: -1 }, flat: true },
    { id: "Eb", label: "E♭ major", root: { l: 2, a: -1 }, flat: true },
    { id: "Bb", label: "B♭ major", root: { l: 6, a: -1 }, flat: true },
    { id: "F", label: "F major", root: { l: 3, a: 0 }, flat: true }
  ];
  var PARTS = [
    { part: 1, title: "The 12 Shapes", blurb: "Find the I chord in root position, 1st and 2nd inversion on each string set.", count: 6, par: 12 },
    { part: 2, title: "Smooth Moves", blurb: "Play I–IV–I–V–I, always jumping to the closest shape.", count: 8, par: 10 },
    { part: 3, title: "Chord Scale", blurb: "Walk all seven chords of the key in one inversion.", count: 7, par: 12 },
    { part: 4, title: "Shape Shifting", blurb: "Turn major into minor, diminished or sus4 by moving one or two notes.", count: 6, par: 10 }
  ];
  var LEVELS = [];
  PARTS.forEach(function (p) { for (var s = 0; s < 4; s++) LEVELS.push({ id: "p" + p.part + "s" + s, part: p.part, set: s }); });
  var SPEED_MS = 60000;

  function mod(n, m) { return ((n % m) + m) % m; }
  function pcOf(n) { return mod(LETTER_PC[n.l] + n.a, 12); }
  function nm(n) { return LETTERS[n.l] + (n.a > 0 ? "♯".repeat(n.a) : "♭".repeat(-n.a)); }
  function up(n, steps, semis) {
    var l = mod(n.l + steps, 7);
    var a = mod(pcOf(n) + semis - LETTER_PC[l], 12);
    if (a > 6) a -= 12;
    return { l: l, a: a };
  }
  function makeChord(root, q) {
    var tones = Q_INT[q].map(function (x) { return up(root, x[0], x[1]); });
    return { root: root, q: q, tones: tones, roles: q === "sus4" ? ["root", "4th", "5th"] : ["root", "3rd", "5th"], name: nm(root) + Q_SUFFIX[q] };
  }
  function diatonic(key) { return MAJOR_STEPS.map(function (st, i) { return makeChord(up(key, i, st), DEG_Q[i]); }); }
  function midiAt(s, f) { return OPEN[s] + f; }
  function freqOf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  /* All close-voiced placements of chord c on a 3-string set; inv null = any inversion. */
  function placements(c, set, inv) {
    var out = [];
    var invs = inv === null || inv === undefined ? [0, 1, 2] : [inv];
    invs.forEach(function (iv) {
      var roles = [iv, (iv + 1) % 3, (iv + 2) % 3];
      var base = roles.map(function (r, i) { return mod(pcOf(c.tones[r]) - OPEN[set[i]], 12); });
      for (var m = 0; m < 8; m++) {
        var fr = base.map(function (b, i) { return b + ((m >> i) & 1 ? 12 : 0); });
        if (fr.some(function (f) { return f > MAXF; })) continue;
        var p = fr.map(function (f, i) { return OPEN[set[i]] + f; });
        if (!(p[0] < p[1] && p[1] < p[2] && p[2] - p[0] < 12)) continue;
        out.push({ frets: fr, roles: roles, inv: iv });
      }
    });
    return out.sort(function (a, b) { return Math.max.apply(null, a.frets) - Math.max.apply(null, b.frets); });
  }
  function same(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function moveCost(a, b) { return a.reduce(function (s, f, k) { return s + Math.abs(f - b[k]); }, 0); }
  var rand = Math.random;
  function rnd(n) { return Math.floor(rand() * n); }
  function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function makePlan() {
    var qs = shuffle(["min", "dim", "sus4", "min", "dim", "sus4"]);
    var invs6 = shuffle([0, 1, 2, 0, 1, 2]);
    var p4 = qs.map(function (q, i) { return { deg: [0, 3, 4][rnd(3)], q: q, inv: invs6[i] }; });
    return { invs: shuffle([0, 1, 2, 0, 1, 2]), p4: p4, startInvs: shuffle([0, 1, 2]).slice(0, 2), p3inv: rnd(3) };
  }
  function shapeItem(c, setIdx, inv, sub) {
    return { title: "Place " + c.name + " in " + INV_NAME[inv], sub: sub, hint: "", set: setIdx, chord: c,
      valid: placements(c, SETS[setIdx], inv), given: null, givenChord: null, mode: "shape", inv: inv };
  }
  function makeItem(part, setIdx, idx, keyIdx, plan, prev, wide) {
    var key = KEYS[keyIdx].root, d = diatonic(key), set = SETS[setIdx], sl = SET_SHORT[setIdx];
    if (part === 0) {
      var c0 = wide ? d[rnd(7)] : d[0], s2 = rnd(4), inv0 = rnd(3);
      return shapeItem(c0, s2, inv0, "Strings " + SET_SHORT[s2] + " · " + INV_HOW[inv0]);
    }
    if (part === 1) {
      var inv1 = plan.invs[idx % plan.invs.length];
      return shapeItem(d[0], setIdx, inv1, "Strings " + sl + " · " + INV_HOW[inv1]);
    }
    if (part === 2) {
      var PROG = [0, 3, 0, 4, 0], step = (idx % 4) + 1, from = d[PROG[step - 1]], to = d[PROG[step]];
      var g = (step === 1 || !prev) ? placements(from, set, plan.startInvs[Math.floor(idx / 4) % plan.startInvs.length])[0] : prev;
      var cands = placements(to, set, null);
      var best = Math.min.apply(null, cands.map(function (p) { return moveCost(p.frets, g.frets); }));
      return {
        title: "Move " + from.name + " → " + to.name,
        sub: "Strings " + sl + " · " + d[0].name + "–" + d[3].name + "–" + d[0].name + "–" + d[4].name + "–" + d[0].name + " (I–IV–I–V–I), move " + step + " of 4",
        hint: "Silver rings = where you are now. Pick the closest shape: fewest total frets moved; shared notes stay put.",
        set: setIdx, chord: to, valid: cands.filter(function (p) { return moveCost(p.frets, g.frets) === best; }),
        given: g, givenChord: from, mode: "near", inv: null
      };
    }
    if (part === 3) {
      var c3 = d[idx % 7], inv3 = plan.p3inv;
      return {
        title: "Place " + c3.name + " in " + INV_NAME[inv3],
        sub: "Chord " + ((idx % 7) + 1) + " of 7 in " + KEYS[keyIdx].label + " (" + ROMAN[idx % 7] + ") · strings " + sl + " · " + INV_HOW[inv3],
        hint: "Same inversion every time. Minor and diminished chords bend the shape by a fret here and there.",
        set: setIdx, chord: c3, valid: placements(c3, set, inv3), given: null, givenChord: null, mode: "scale", inv: inv3
      };
    }
    var pl = plan.p4[idx % plan.p4.length];
    var ivs = [pl.inv, (pl.inv + 1) % 3, (pl.inv + 2) % 3], dgs = [pl.deg, 0, 3, 4];
    for (var a = 0; a < 3; a++) for (var b = 0; b < 4; b++) {
      var iv = ivs[a], base = d[dgs[b]], tgt = makeChord(base.root, pl.q), tv = placements(tgt, set, iv);
      var cs = placements(base, set, iv).map(function (p) {
        return { p: p, fr: p.frets.map(function (f, k) { return f + SHIFT[pl.q][p.roles[k]]; }) };
      }).filter(function (o) {
        return o.fr.every(function (f) { return f >= 0 && f <= MAXF; }) && tv.some(function (v) { return same(v.frets, o.fr); });
      });
      if (cs.length) {
        var o = cs[rnd(cs.length)];
        return {
          title: "Turn " + base.name + " into " + tgt.name,
          sub: "Strings " + sl + " · silver rings are " + base.name + " in " + INV_NAME[iv] + " · stay in the same spot",
          hint: SHIFT_HINT[pl.q], set: setIdx, chord: tgt,
          valid: [{ frets: o.fr, roles: o.p.roles, inv: iv }], given: o.p, givenChord: base, mode: "shift", inv: iv
        };
      }
    }
    return shapeItem(d[0], setIdx, 0, "Strings " + sl);
  }

  function evaluate(marks, item) {
    var set = SETS[item.set];
    var onSet = set.map(function (s) { return marks[s]; });
    var extra = marks.some(function (m, s) { return m !== null && set.indexOf(s) < 0; });
    var best = item.valid[0], bestScore = -1;
    item.valid.forEach(function (p) {
      var sc = p.frets.filter(function (f, i) { return onSet[i] === f; }).length;
      if (sc > bestScore) { best = p; bestScore = sc; }
    });
    var per = marks.map(function (m, s) { if (m === null) return null; var i = set.indexOf(s); return i >= 0 && best.frets[i] === m ? "ok" : "bad"; });
    var full = onSet.every(function (m) { return m !== null; });
    var fr = onSet.map(function (m) { return m === null ? -1 : m; });
    var ok = !extra && full && item.valid.some(function (p) { return same(p.frets, fr); });
    var c = item.chord;
    function lowHigh(p) { return p.roles.map(function (r) { return nm(c.tones[r]) + " (" + c.roles[r] + ")"; }).join(" · "); }
    var msg;
    if (ok) msg = c.name + ", " + INV_NAME[best.inv] + ". Low to high: " + lowHigh(best) + ".";
    else if (extra) msg = "Only the three lit strings count. Dashed rings show the answer.";
    else if (!full) msg = "You need one note on each lit string. Dashed rings show the answer.";
    else {
      var any = placements(c, set, null).filter(function (p) { return same(p.frets, fr); })[0];
      if (any && item.mode === "near" && item.given) msg = "That's " + c.name + ", but not the closest: it moves " + moveCost(any.frets, item.given.frets) + " frets, the closest moves " + moveCost(best.frets, item.given.frets) + ".";
      else if (any && item.mode === "shift") msg = "That's " + c.name + ", but in a different spot. Stay on the silver shape and move only what changes.";
      else if (any) msg = "That's " + c.name + " in " + INV_NAME[any.inv] + " (" + INV_HOW[any.inv] + "). Wanted " + INV_NAME[best.inv] + ": " + lowHigh(best) + ".";
      else msg = "Not " + c.name + " yet. Red notes don't belong. Answer: " + lowHigh(best) + ", low to high.";
    }
    return { ok: ok, best: best, per: per, msg: msg };
  }

  function spelled(c) { return c.tones.map(nm).join(" – "); }
  function makeQuiz(item, p, part, keyIdx) {
    var c = item.chord;
    var kinds = part === 1 ? ["spell", "top", "topname", "rootstring"] : part === 2 ? ["spell", "bass"] : ["spell", "top"];
    var k = kinds[rnd(kinds.length)];
    if (k === "top") return { q: "Your top note (highest string) is the chord's…", options: c.roles.slice(), answer: p.roles[2], picked: null };
    if (k === "topname") return { q: "Name the top note of your shape.", options: c.tones.map(nm), answer: p.roles[2], picked: null };
    if (k === "rootstring") return { q: "Which string holds the root (" + nm(c.root) + ")?", options: SETS[item.set].map(function (s) { return STR_NAME[s]; }), answer: p.roles.indexOf(0), picked: null };
    if (k === "bass") return { q: "What's on the lowest string, so which inversion is it?", options: [0, 1, 2].map(function (r) { return c.roles[r] + " → " + INV_NAME[r]; }), answer: p.inv, picked: null };
    var right = spelled(c), opts = [right];
    function add(s) { if (opts.length < 4 && opts.indexOf(s) < 0) opts.push(s); }
    add(spelled(makeChord(c.root, c.q === "maj" || c.q === "sus4" ? "min" : "maj")));
    var semis = mod(pcOf(c.tones[1]) - pcOf(c.root), 12), steps = c.q === "sus4" ? 3 : 2;
    shuffle([steps - 1, steps + 1]).forEach(function (alt) {
      var t = up(c.root, alt, semis);
      if (Math.abs(t.a) <= 1) add([nm(c.tones[0]), nm(t), nm(c.tones[2])].join(" – "));
    });
    shuffle(diatonic(KEYS[keyIdx].root)).forEach(function (ch) { add(spelled(ch)); });
    var options = shuffle(opts);
    return { q: "Which notes spell " + c.name + "? (Each chord uses every other letter.)", options: options, answer: options.indexOf(right), picked: null };
  }
  function noteName(s, f, chord, flat) {
    var pc = mod(OPEN[s] + f, 12);
    if (chord) { for (var i = 0; i < 3; i++) if (pcOf(chord.tones[i]) === pc) return nm(chord.tones[i]); }
    return flat ? FLAT_N[pc] : SHARP_N[pc];
  }
  function roleAt(s, f, chord) {
    var pc = mod(OPEN[s] + f, 12);
    for (var i = 0; i < 3; i++) if (pcOf(chord.tones[i]) === pc) return chord.roles[i];
    return null;
  }

  var api = {
    LETTERS: LETTERS, OPEN: OPEN, MAXF: MAXF, SETS: SETS, SET_SHORT: SET_SHORT, STR_NAME: STR_NAME, STR_LETTER: STR_LETTER,
    ROMAN: ROMAN, INV_NAME: INV_NAME, INV_HOW: INV_HOW, SHIFT: SHIFT, KEYS: KEYS, PARTS: PARTS, LEVELS: LEVELS, SPEED_MS: SPEED_MS,
    mod: mod, pcOf: pcOf, nm: nm, up: up, makeChord: makeChord, diatonic: diatonic, placements: placements, same: same,
    moveCost: moveCost, shuffle: shuffle, rnd: rnd, makePlan: makePlan, makeItem: makeItem, evaluate: evaluate,
    makeQuiz: makeQuiz, spelled: spelled, noteName: noteName, roleAt: roleAt, midiAt: midiAt, freqOf: freqOf
  };
  root.TQ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
