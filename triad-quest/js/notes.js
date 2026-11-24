/* Triad Quest - Notes mode engine: note names on the neck, the Note Path phases, per-note stats (accuracy + speed),
   mastery and the weak-note drill picker. Pure functions, no DOM. Frets 0-12, standard tuning. */
(function (root) {
  "use strict";
  var TQ = root.TQ || (typeof require === "function" ? require("./theory.js") : null);
  var MAXF = 12;
  var NAT = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" };
  var SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  var FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  var OPEN = TQ.OPEN;                       // MIDI of each open string, low E (0) .. high E (5)
  var SNAME = ["low E", "A", "D", "G", "B", "high E"];

  function mod(n, m) { return ((n % m) + m) % m; }
  function isNatural(pc) { return NAT.hasOwnProperty(pc); }
  /* the name to show: naturals "A"; sharps/flats both names "F♯/G♭" */
  function nameOf(pc) { pc = mod(pc, 12); return isNatural(pc) ? NAT[pc] : SHARP[pc] + "/" + FLAT[pc]; }
  function names(pc) { pc = mod(pc, 12); return isNatural(pc) ? [NAT[pc]] : [SHARP[pc], FLAT[pc]]; }
  function midiAt(s, f) { return OPEN[s] + f; }
  function pcAt(s, f) { return mod(OPEN[s] + f, 12); }
  function freqOfMidi(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function octaveName(m) { return SHARP[mod(m, 12)] + (Math.floor(m / 12) - 1); }
  function cellKey(s, f) { return s + "," + f; }
  function cell(s, f) { var pc = pcAt(s, f); return { s: s, f: f, key: cellKey(s, f), pc: pc, midi: midiAt(s, f), natural: isNatural(pc), name: nameOf(pc) }; }
  /* frets on string s (0..12) that sound pitch class pc */
  function fretsFor(s, pc) { var out = []; for (var f = 0; f <= MAXF; f++) if (pcAt(s, f) === pc) out.push(f); return out; }
  function allCells() { var a = []; for (var s = 0; s < 6; s++) for (var f = 0; f <= MAXF; f++) a.push(cell(s, f)); return a; }

  /* ---------- the Note Path ---------- */
  var PHASES = [
    { id: "open", title: "Open strings", strings: [0, 1, 2, 3, 4, 5], frets: [0, 0], kind: "nat", round: 12, targetMs: 3000 },
    { id: "lowE", title: "The low E string", strings: [0], frets: [0, 12], kind: "nat", round: 16, targetMs: 4500 },
    { id: "A", title: "The A string", strings: [1], frets: [0, 12], kind: "nat", round: 16, targetMs: 4500 },
    { id: "EA", title: "E and A together", strings: [0, 1], frets: [0, 12], kind: "nat", round: 20, targetMs: 5000 },
    { id: "DG", title: "The D and G strings", strings: [2, 3], frets: [0, 12], kind: "nat", round: 20, targetMs: 5000 },
    { id: "BE", title: "The B and high E strings", strings: [4, 5], frets: [0, 12], kind: "nat", round: 20, targetMs: 5000 },
    { id: "nat", title: "Every natural note", strings: [0, 1, 2, 3, 4, 5], frets: [0, 12], kind: "nat", round: 24, targetMs: 6000 },
    { id: "acc", title: "Sharps and flats", strings: [0, 1, 2, 3, 4, 5], frets: [1, 12], kind: "acc", round: 24, targetMs: 7000 },
    { id: "all", title: "The whole neck", strings: [0, 1, 2, 3, 4, 5], frets: [0, 12], kind: "all", round: 30, targetMs: 6000 }
  ];
  var PASS_ACC = 0.9;
  function phase(id) { return PHASES.filter(function (p) { return p.id === id; })[0]; }
  function phaseCells(p) {
    var out = [];
    p.strings.forEach(function (s) {
      for (var f = p.frets[0]; f <= p.frets[1]; f++) {
        var c = cell(s, f);
        if (p.kind === "nat" && !c.natural) continue;
        if (p.kind === "acc" && c.natural) continue;
        out.push(c);
      }
    });
    return out;
  }
  /* the answer pad for a phase: 7 naturals, or all 12 notes */
  function padFor(p) { var pcs = p.kind === "nat" ? [9, 11, 0, 2, 4, 5, 7] : [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]; return pcs.map(function (pc) { return { pc: pc, label: nameOf(pc) }; }); }

  function median(a) { if (!a.length) return Infinity; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  /* a round passes on accuracy AND speed: 90% right first time and a median answer time at or under the phase target */
  function roundResult(p, answers) {
    var n = answers.length, ok = answers.filter(function (a) { return a.ok; }).length;
    var med = median(answers.filter(function (a) { return a.ok; }).map(function (a) { return a.ms; }));
    var acc = n ? ok / n : 0;
    return { n: n, ok: ok, acc: acc, medMs: med, passAcc: acc >= PASS_ACC, passSpeed: med <= p.targetMs, passed: n >= p.round && acc >= PASS_ACC && med <= p.targetMs };
  }
  function freshStore() { return { v: 1, cells: {}, phases: {}, seen: {}, seq: 0, mic: { tol: 35 }, tie: true }; }
  function normalize(st) {
    var f = freshStore();
    if (!st || typeof st !== "object") return f;
    f.cells = st.cells && typeof st.cells === "object" ? st.cells : {};
    f.phases = st.phases && typeof st.phases === "object" ? st.phases : {};
    f.seen = st.seen && typeof st.seen === "object" ? st.seen : {};
    f.seq = typeof st.seq === "number" ? st.seq : 0;
    if (st.mic && typeof st.mic === "object") f.mic = { tol: +st.mic.tol || 35 };
    f.tie = st.tie !== false;
    return f;
  }
  function phaseUnlocked(st, i, practice) { return !!practice || i === 0 || !!(st.phases[PHASES[i - 1].id] && st.phases[PHASES[i - 1].id].passed); }
  function currentPhase(st) { for (var i = 0; i < PHASES.length; i++) if (!(st.phases[PHASES[i].id] && st.phases[PHASES[i].id].passed)) return i; return PHASES.length - 1; }
  function recordRound(st, p, res) {
    var o = st.phases[p.id] || { rounds: 0, passed: false, bestAcc: 0, bestMs: null };
    o.rounds++; o.bestAcc = Math.max(o.bestAcc, res.acc);
    if (res.ok && isFinite(res.medMs)) o.bestMs = o.bestMs === null ? res.medMs : Math.min(o.bestMs, res.medMs);
    if (res.passed) o.passed = true;
    st.phases[p.id] = o; return o;
  }

  /* ---------- per-note stats ---------- */
  var EWMA = 0.35, MASTER_MS = 3000, SLOW_MS = 8000;
  function stat(st, key) { return st.cells[key] || null; }
  /* one first answer for a note. ms counts only for right answers (a wrong tap isn't "speed") */
  function record(st, key, ok, ms) {
    var c = st.cells[key] || { n: 0, ok: 0, ms: null, streak: 0, miss: 0, last: 0 };
    c.n++; st.seq = (st.seq || 0) + 1; c.last = st.seq;
    if (ok) {
      c.ok++; c.streak++;
      var t = Math.min(Math.max(ms, 200), SLOW_MS);
      c.ms = c.ms === null ? t : Math.round(c.ms + EWMA * (t - c.ms));
    } else { c.streak = 0; c.miss = st.seq; }
    st.cells[key] = c; return c;
  }
  function accOf(c) { return c ? (c.ok + 1) / (c.n + 2) : 0.5; }       // smoothed: an unseen note counts as 50%
  function mastered(c) { return !!c && c.n >= 3 && c.streak >= 3 && c.ms !== null && c.ms <= MASTER_MS && accOf(c) >= 0.75; }
  /* weakness 0 (mastered) .. ~5 (wrong a lot and slow); unseen notes sit in the middle */
  function weakness(c, seq) {
    if (!c || c.n === 0) return 2.2;
    var w = 3 * (1 - accOf(c));
    w += c.ms === null ? 1.5 : Math.max(0, Math.min(2, (c.ms - 1500) / 2500));
    if (c.streak === 0) w += 0.8;                                    // got it wrong last time
    if (c.miss && seq - c.miss < 15) w += 0.6;                       // missed recently
    if (mastered(c)) w *= 0.25;
    return w;
  }
  /* heat 0..4 for the map: accuracy colour plus speed, or null when never tried */
  function heat(c, what) {
    if (!c || c.n === 0) return null;
    if (what === "speed") { if (c.ms === null) return 0; return c.ms <= 1500 ? 4 : c.ms <= 2500 ? 3 : c.ms <= 4000 ? 2 : c.ms <= 6000 ? 1 : 0; }
    var a = c.ok / c.n; return a >= 0.95 ? 4 : a >= 0.85 ? 3 : a >= 0.7 ? 2 : a >= 0.5 ? 1 : 0;
  }

  /* ---------- picking the next prompt ---------- */
  function rng0() { return Math.random(); }
  /* random but never the same note twice running, and not the same note name three times in a row */
  function pickRandom(cells, hist, rng) {
    rng = rng || rng0; hist = hist || [];
    var last = hist[hist.length - 1], prev = hist[hist.length - 2];
    var pool = cells.filter(function (c) { return !last || c.key !== last.key; });
    if (last && prev && last.pc === prev.pc) { var p2 = pool.filter(function (c) { return c.pc !== last.pc; }); if (p2.length) pool = p2; }
    if (!pool.length) pool = cells;
    return pool[Math.floor(rng() * pool.length)];
  }
  /* Note Path rounds: a shuffled bag, so every note of the phase comes up once (in a fresh random order each time round)
     before any repeats, with the same no-repeat / no-3-names-running rules as pickRandom */
  function pickBag(cells, hist, bag, rng) {
    rng = rng || rng0; hist = hist || [];
    var refill = function () { var fresh = cells.slice(); for (var i = fresh.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = fresh[i]; fresh[i] = fresh[j]; fresh[j] = t; } Array.prototype.push.apply(bag, fresh); };
    if (!bag.length) refill();
    var last = hist[hist.length - 1], prev = hist[hist.length - 2];
    var okAt = function (c) { return (!last || c.key !== last.key) && !(last && prev && last.pc === prev.pc && c.pc === last.pc); };
    var k = 0; while (k < bag.length && !okAt(bag[k])) k++;
    if (k === bag.length) { refill(); while (k < bag.length && !okAt(bag[k])) k++; }   // the last few left would break a rule: start the next lap early
    if (k >= bag.length) k = 0;
    return bag.splice(k, 1)[0];
  }
  /* Weak-note drill. Mostly the weakest/slowest notes (weighted), every 4th-5th prompt a mastered note for review
     (the one not seen for longest), and a missed note comes back 2-3 prompts later until it's answered right. */
  var REVIEW_EVERY = 5, RETRY_AFTER = 3;
  function pickDrill(st, cells, hist, rng, queue) {
    rng = rng || rng0; hist = hist || []; queue = queue || [];
    var n = hist.length, last = hist[n - 1];
    // 1. a missed note due again
    for (var i = 0; i < queue.length; i++) if (queue[i].due <= n && (!last || queue[i].key !== last.key)) {
      var q = queue.splice(i, 1)[0];
      return { cell: cells.filter(function (c) { return c.key === q.key; })[0] || cell(+q.key.split(",")[0], +q.key.split(",")[1]), why: "retry" };
    }
    var pick = pickDrillFresh(st, cells, hist, rng, last, n);
    // a queued miss that comes up early on its own merits counts as its retry
    for (var k = queue.length - 1; k >= 0; k--) if (queue[k].key === pick.cell.key) queue.splice(k, 1);
    return pick;
  }
  function pickDrillFresh(st, cells, hist, rng, last, n) {
    var avail = cells.filter(function (c) { return !last || c.key !== last.key; });
    var mast = avail.filter(function (c) { return mastered(stat(st, c.key)); });
    var weak = avail.filter(function (c) { return !mastered(stat(st, c.key)); });
    // 2. now and then, review a mastered note (longest since last seen)
    if (mast.length && (n % REVIEW_EVERY === REVIEW_EVERY - 1 || !weak.length)) {
      mast.sort(function (a, b) { return stat(st, a.key).last - stat(st, b.key).last; });
      return { cell: mast[Math.floor(rng() * Math.min(3, mast.length))], why: "review" };
    }
    // 3. weighted pick from the weakest notes (top 10 by weakness), weight = weakness^2
    var seq = st.seq || 0;
    var ranked = weak.map(function (c) { return { c: c, w: weakness(stat(st, c.key), seq) }; }).sort(function (a, b) { return b.w - a.w; }).slice(0, 10);
    var tot = ranked.reduce(function (s, r) { return s + r.w * r.w; }, 0), x = rng() * tot;
    for (var j = 0; j < ranked.length; j++) { x -= ranked[j].w * ranked[j].w; if (x <= 0) return { cell: ranked[j].c, why: "weak" }; }
    return { cell: ranked.length ? ranked[ranked.length - 1].c : pickRandom(cells, hist, rng), why: "weak" };
  }
  function drillMiss(queue, key, n) { if (!queue.some(function (q) { return q.key === key; })) queue.push({ key: key, due: n + RETRY_AFTER }); }
  /* the notes the drill uses: everything in phases you've unlocked (so it never drills what you haven't met) */
  function drillCells(st, practice) {
    var seen = {}, out = [];
    PHASES.forEach(function (p, i) { if (phaseUnlocked(st, i, practice)) phaseCells(p).forEach(function (c) { if (!seen[c.key]) { seen[c.key] = 1; out.push(c); } }); });
    return out;
  }
  function weakest(st, cells, n) {
    var seq = st.seq || 0;
    return cells.filter(function (c) { var s = stat(st, c.key); return s && s.n > 0 && !mastered(s); })
      .map(function (c) { return { c: c, w: weakness(stat(st, c.key), seq) }; }).sort(function (a, b) { return b.w - a.w; }).slice(0, n).map(function (r) { return r.c; });
  }

  /* ---------- answers ---------- */
  /* Find the Note: right if the tapped fret is on the asked string, inside the phase frets, and sounds the asked note */
  function checkFind(target, s, f, p) {
    if (f < p.frets[0] || f > p.frets[1] || pcAt(s, f) !== target.pc) return false;
    return p.frets[1] === 0 ? p.strings.indexOf(s) >= 0 : s === target.s;   // open strings: either E string counts for "E"
  }
  function checkName(target, pc) { return mod(pc, 12) === target.pc; }


  /* ---------- intro card for each phase (same shape as the level intro cards) ---------- */
  function exDots(list) {
    return list.map(function (sf) { var pc = pcAt(sf[0], sf[1]); return { string: sf[0], fret: sf[1], n: names(pc)[0], short: "", cls: isNatural(pc) ? "n" : "a", pc: pc }; });
  }
  function natList(s) { var out = []; for (var f = 0; f <= MAXF; f++) if (isNatural(pcAt(s, f))) out.push([s, f]); return out; }
  function fretText(s) { return natList(s).map(function (x) { return x[1] + " (" + nameOf(pcAt(s, x[1])) + ")"; }).join(", "); }
  function phaseIntro(id) {
    var p = phase(id), i = PHASES.indexOf(p), L, T, ex, cap;
    var secs = (p.targetMs / 1000).toFixed(1).replace(".0", "");
    switch (id) {
      case "open":
        L = ["Your six open strings, from the thickest to the thinnest, are E, A, D, G, B and E. Try “Eddie Ate Dynamite, Good Bye Eddie.”",
          "Every other note on the neck is counted up from these, so they're home base.",
          "You'll name each string, and find a string by its name. When you're asked for E, either E string counts."];
        T = [["Open string", "A string played with no finger on it."],
          ["Low E and high E", "The thickest string is low E (the 6th string); the thinnest is high E (the 1st). Same letter, two octaves apart."],
          ["Answer time", "To pass a phase you need 90% right and a typical answer time under its target (" + secs + " seconds here). Speed matters because in a song there's no time to count frets."]];
        ex = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]; cap = "The open strings, low to high: E A D G B E."; break;
      case "lowE":
        L = ["Notes climb the musical alphabet one fret at a time: A B C D E F G, then A again.",
          "Most letters are two frets apart, with a sharp or flat in between. E to F and B to C are only one fret apart.",
          "On the low E string the natural notes are at frets " + fretText(0) + ".",
          "Power chords and many barre chords take their root on this string, so it pays off fast."];
        T = [["Fret", "The metal bars across the neck. “Fret 3” means pressing just behind the 3rd one. Each fret raises the note a half step."],
          ["Musical alphabet", "Only seven letters, A to G, repeating up the neck."],
          ["Natural note", "A plain letter with no sharp or flat: A B C D E F G."],
          ["Half step · whole step", "One fret is a half step; two frets are a whole step."],
          ["Octave", "Twelve frets up you're back to the same note, higher. Fret 12 has the same name as the open string."]];
        ex = natList(0); cap = "Low E string, natural notes: frets " + fretText(0) + "."; break;
      case "A":
        L = ["Same alphabet, starting from A: frets " + fretText(1) + ".",
          "With the low E string, this gives you the root of almost every power chord and barre chord.",
          "Watch the one-fret gaps: B to C (frets 2 and 3) and E to F (frets 7 and 8)."];
        T = [["Root", "The note a chord is named after. A C chord's root is C."],
          ["Barre chord", "A chord where one finger presses across several strings, so the same shape slides anywhere on the neck."]];
        ex = natList(1); cap = "A string, natural notes: frets " + fretText(1) + "."; break;
      case "EA":
        L = ["Now both strings, mixed. The prompt always says which string.",
          "The A string at any fret plays the same note as the low E string five frets higher (open A = low E fret 5).",
          "So when you know one string, you can check yourself on the other."];
        T = [["The 5-fret rule", "Fret 5 on a string plays the next string's open note (low E fret 5 = A). The one exception is the G string, where it's fret 4 (= open B)."]];
        ex = [[0, 5], [1, 0], [0, 10], [1, 5]]; cap = "Low E fret 5 = open A; low E fret 10 = A string fret 5 (both D)."; break;
      case "DG":
        L = ["D string: frets " + fretText(2) + ". G string: frets " + fretText(3) + ".",
          "Shortcut: a note on the low E string comes back an octave higher two strings up and two frets higher. A string to G string works the same way.",
          "Octave shapes like this are how guitarists find notes fast without counting."];
        T = [["Octave shape", "Two strings up and two frets higher = the same note an octave higher (low E → D, A → G). When the shape lands on the B string, add one more fret."]];
        ex = [[0, 3], [2, 5], [1, 3], [3, 5]]; cap = "G on low E fret 3 and D string fret 5; C on A string fret 3 and G string fret 5: the octave shape."; break;
      case "BE":
        L = ["Good news: the high E string has exactly the same notes as the low E string, two octaves up. You already know it.",
          "B string: frets " + fretText(4) + ".",
          "The B string is tuned four frets above G (every other pair is five), so an octave shape that lands on it moves one fret further."];
        T = [["Two octaves", "Low E and high E are two octaves apart: 82 and 330 vibrations a second. Same name, same frets."]];
        ex = natList(4).concat(natList(5)); cap = "B string: " + fretText(4) + ". High E: same frets as low E."; break;
      case "nat":
        L = ["All six strings, natural notes only, frets 0 to 12.",
          "Use landmarks instead of counting from the nut: fret 12 always has the open string's name, and fret 5 has the next string's name (fret 4 on the G string).",
          "Passing this means you can find any natural note quickly, which is what reading chord charts anywhere on the neck needs."];
        T = [["Landmark frets", "The dots at frets 3, 5, 7, 9 and the double dot at 12. Learn the notes at the dots and the rest are one or two frets away."]];
        ex = [[0, 5], [1, 5], [2, 5], [3, 4], [4, 5], [0, 12], [1, 12], [2, 12], [3, 12], [4, 12], [5, 12]]; cap = "Fret 5 (fret 4 on G) = next string's name: A D G B E. Fret 12 = the open names: E A D G B E."; break;
      case "acc":
        L = ["A sharp (♯) is one fret above a natural note; a flat (♭) is one fret below.",
          "So the fret between F and G is both F♯ and G♭: same sound, two names. You'll see both here.",
          "There's no sharp or flat between E and F, or between B and C.",
          "Which name a song uses depends on its key: G major writes F♯, F major writes B♭."];
        T = [["Sharp ♯", "One fret higher. F♯ is one fret above F."], ["Flat ♭", "One fret lower. G♭ is one fret below G."],
          ["Enharmonic", "Two names for the same note, like F♯ and G♭."]];
        ex = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3]]; cap = "Low E: E, F, F♯/G♭, G. A string: A, A♯/B♭, B, C."; break;
      default:
        L = ["Everything: all 12 notes on all six strings, frets 0 to 12.",
          "This is the finish line of the Note Path. After it, the weak-note drill keeps your slowest and most-missed notes in rotation."];
        T = [["Mastered", "A note counts as mastered after 3 right answers in a row with a typical time of 3 seconds or less. The heatmap draws a white ring around it."]];
        ex = [0, 1, 2, 3, 4, 5].reduce(function (a, s) { return a.concat(fretsFor(s, 0).map(function (f) { return [s, f]; })); }, []); cap = "Every C between frets 0 and 12.";
    }
    var dots = exDots(ex), fr = dots.map(function (d) { return d.fret; }), strs = [];
    dots.forEach(function (d) { if (strs.indexOf(d.string) < 0) strs.push(d.string); });
    strs.sort(function (a, b) { return a - b; });
    return { id: "notes-" + id, kicker: "Note Path · Phase " + (i + 1) + " of " + PHASES.length + " · target " + Math.round(PASS_ACC * 100) + "% right, " + secs + " s",
      title: p.title, learn: L, terms: T,
      example: { kind: "notes", strings: id === "open" || id === "nat" || id === "all" ? [0, 1, 2, 3, 4, 5] : strs, range: [Math.min.apply(null, fr), Math.max.apply(null, fr)], dots: dots, frets: fr, caption: cap } };
  }

  var api = { phaseIntro: phaseIntro, MAXF: MAXF, PHASES: PHASES, PASS_ACC: PASS_ACC, SNAME: SNAME, SHARP: SHARP, FLAT: FLAT, MASTER_MS: MASTER_MS, REVIEW_EVERY: REVIEW_EVERY, RETRY_AFTER: RETRY_AFTER,
    nameOf: nameOf, names: names, isNatural: isNatural, midiAt: midiAt, pcAt: pcAt, freqOfMidi: freqOfMidi, octaveName: octaveName, cell: cell, cellKey: cellKey,
    fretsFor: fretsFor, allCells: allCells, phase: phase, phaseCells: phaseCells, padFor: padFor, median: median, roundResult: roundResult,
    freshStore: freshStore, normalize: normalize, phaseUnlocked: phaseUnlocked, currentPhase: currentPhase, recordRound: recordRound,
    stat: stat, record: record, accOf: accOf, mastered: mastered, weakness: weakness, heat: heat,
    pickRandom: pickRandom, pickBag: pickBag, pickDrill: pickDrill, drillMiss: drillMiss, drillCells: drillCells, weakest: weakest, checkFind: checkFind, checkName: checkName };
  root.TQNotes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
