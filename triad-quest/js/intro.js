/* Triad Quest - "Here's what we'll learn" intro cards: one per level (and one for Jam).
   Text is written per level; every chord name, note, fret and interval in it is computed from js/theory.js
   for the key being played, so it is right in all 12 keys. Pure functions, no DOM. */
(function (root) {
  "use strict";
  var TQ = root.TQ || (typeof require === "function" ? require("./theory.js") : null);
  var SHORT = { root: "R", "3rd": "3", "5th": "5", "4th": "4" };
  var CLS = { root: "r", "3rd": "t", "5th": "f", "4th": "s" };
  var SHIFT = { min: [0, -1, 0], dim: [0, -1, -1], sus4: [0, 1, 0] };   // fret change per role (root, 3rd, 5th)
  var NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

  function notes(ch) { return ch.tones.map(TQ.nm).join(" "); }
  function ctx(keyIdx) {
    var K = TQ.KEYS[keyIdx], d = TQ.diatonic(K.root), I = d[0];
    var share = function (a, b) { return a.tones.filter(function (t) { return b.tones.some(function (u) { return TQ.pcOf(u) === TQ.pcOf(t); }); }).map(TQ.nm).join(" and "); };
    return {
      K: K, d: d, key: K.label, I: I.name, ii: d[1].name, iii: d[2].name, IV: d[3].name, V: d[4].name, vi: d[5].name, vii: d[6].name,
      Inotes: notes(I), iinotes: notes(d[1]), IVnotes: notes(d[3]), Vnotes: notes(d[4]), viinotes: notes(d[6]),
      r: TQ.nm(I.tones[0]), t: TQ.nm(I.tones[1]), f: TQ.nm(I.tones[2]), viRoot: TQ.nm(d[5].root),
      scale: d.map(function (c) { return TQ.nm(c.root); }).join(" "),
      list: d.map(function (c, i) { return c.name + " (" + TQ.ROMAN[i] + ")"; }).join(", "),
      prog: [0, 3, 0, 4, 0].map(function (i) { return d[i].name; }).join("–"),
      cIV: share(I, d[3]), cV: share(I, d[4])
    };
  }

  /* ---------- examples (mini fretboard), all computed ---------- */
  function dotsOf(chord, setIdx, p) {
    return p.frets.map(function (f, k) {
      var s = TQ.SETS[setIdx][k], role = chord.roles[p.roles[k]];
      return { string: s, fret: f, n: TQ.noteName(s, f, chord), role: role, short: SHORT[role], cls: CLS[role], midi: TQ.midiAt(s, f) };
    });
  }
  function semis(dots) { return [dots[1].midi - dots[0].midi, dots[2].midi - dots[1].midi]; }
  function fretWord(n) { return NUM[n] + (n === 1 ? " fret" : " frets"); }
  function shapeEx(chord, setIdx, inv, withIntervals) {
    var p = TQ.placements(chord, TQ.SETS[setIdx], inv)[0], dots = dotsOf(chord, setIdx, p), iv = semis(dots);
    var cap = chord.name + " in " + TQ.INV_NAME[inv] + " on " + TQ.SET_SHORT[setIdx] + ", low to high: " +
      dots.map(function (x) { return x.n + " (" + x.short + ", " + TQ.STR_LETTER[x.string] + " string fret " + x.fret + ")"; }).join(", ") + ".";
    if (withIntervals) cap += " " + dots[0].n + " up to " + dots[1].n + " is " + iv[0] + " half steps; " + dots[1].n + " up to " + dots[2].n + " is " + iv[1] + ".";
    return { kind: "shape", chord: chord, set: setIdx, inv: inv, frets: p.frets.slice(), dots: dots, intervals: iv, caption: cap };
  }
  function moveEx(from, to, setIdx, inv) {
    var g = TQ.placements(from, TQ.SETS[setIdx], inv)[0], cands = TQ.placements(to, TQ.SETS[setIdx], null);
    var best = cands.slice().sort(function (a, b) { return TQ.moveCost(a.frets, g.frets) - TQ.moveCost(b.frets, g.frets); })[0];
    var fd = dotsOf(from, setIdx, g), td = dotsOf(to, setIdx, best);
    var parts = td.map(function (x, k) {
      var df = x.fret - fd[k].fret;
      return df === 0 ? fd[k].n + " stays put" : fd[k].n + " → " + x.n + " (" + fretWord(Math.abs(df)) + (df > 0 ? " up)" : " down)");
    });
    return { kind: "move", chord: to, fromChord: from, set: setIdx, inv: best.inv, frets: best.frets.slice(), fromFrets: g.frets.slice(), dots: td, fromDots: fd,
      cost: TQ.moveCost(best.frets, g.frets),
      caption: from.name + " → " + to.name + " on " + TQ.SET_SHORT[setIdx] + " (low to high): " + parts.join(", ") + ". Silver rings = where you start." };
  }
  function shiftEx(base, q, setIdx, inv) {
    var tgt = TQ.makeChord(base.root, q), invs = [inv, (inv + 1) % 3, (inv + 2) % 3];
    for (var a = 0; a < 3; a++) {
      var ps = TQ.placements(base, TQ.SETS[setIdx], invs[a]), tv = TQ.placements(tgt, TQ.SETS[setIdx], invs[a]);
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i], fr = p.frets.map(function (f, k) { return f + SHIFT[q][p.roles[k]]; });
        if (!fr.every(function (f) { return f >= 0 && f <= TQ.MAXF; })) continue;
        var v = tv.filter(function (x) { return TQ.same(x.frets, fr); })[0];
        if (!v) continue;
        var fd = dotsOf(base, setIdx, p), td = dotsOf(tgt, setIdx, v);
        var moved = td.map(function (x, k) { return x.fret === fd[k].fret ? null : fd[k].n + " (" + fd[k].short + ") → " + x.n + " (" + x.short + "), one fret " + (x.fret > fd[k].fret ? "up" : "down"); }).filter(Boolean);
        return { kind: "shift", chord: tgt, fromChord: base, set: setIdx, inv: invs[a], frets: fr, fromFrets: p.frets.slice(), dots: td, fromDots: fd,
          caption: base.name + " → " + tgt.name + " (" + TQ.INV_NAME[invs[a]] + " on " + TQ.SET_SHORT[setIdx] + "): " + moved.join("; ") + ". The root " + fd[p.roles.indexOf(0)].n + " stays put, so it's now " + tgt.name + " = " + notes(tgt) + "." };
      }
    }
    return null;
  }

  /* ---------- the words: defined the first time they appear ---------- */
  function W(c) {
    return {
      triad: ["Triad", "A chord of three notes stacked in 3rds: the root (1), the 3rd and the 5th. Take the 1st, 3rd and 5th notes of the " + c.key + " scale (" + c.scale + ") and you get " + c.Inotes + "."],
      rtf: ["Root, 3rd, 5th", "The root names the chord (" + c.r + "). The 3rd is two letters up (" + c.r + " → " + c.t + ") and decides major or minor. The 5th is four letters up (" + c.r + " → " + c.f + ") and makes it sound solid."],
      interval: ["Interval", "The distance between two notes. One fret is a half step (also called a semitone); two frets are a whole step."],
      thirds: ["Major 3rd · minor 3rd", "A major 3rd is 4 half steps (" + c.r + " → " + c.t + "); a minor 3rd is 3 half steps (" + c.t + " → " + c.f + "). Together that's 7 half steps from root to 5th, called a perfect 5th."],
      majmin: ["Major vs minor", "A major triad has the major 3rd on the bottom and the minor 3rd on top: it sounds bright. A minor triad swaps them (minor 3rd, then major 3rd): it sounds darker. Minor chords arrive in Part 3."],
      rootpos: ["Root position", "The root is the lowest note. On E-A-D, " + c.I + " in root position is " + c.Inotes + " from the low E string up."],
      inversion: ["Inversion", "The same three notes with a different one on the bottom. 1st inversion puts the 3rd lowest (" + c.t + " " + c.f + " " + c.r + "); 2nd inversion puts the 5th lowest (" + c.f + " " + c.r + " " + c.t + "). Same chord, different colour."],
      stringset: ["String set", "Three neighbouring strings that hold one shape: E-A-D, A-D-G, D-G-B or G-B-E. This level uses E-A-D, the three lowest strings."],
      clock: ["The clock", "Time only changes your points: a quick right answer earns a speed bonus, and averaging the target time or less per shape earns the third star (" + TQ.PARTS[0].par + " seconds in Part 1). Take your time while you learn."],
      fourths: ["Tuning in 4ths", "Each string is 5 frets above the one below it (an interval called a perfect 4th), except G to B, which is only 4 frets (a major 3rd)."],
      bgap: ["The B-string gap", "G to B is 4 frets apart while every other pair of neighbouring strings is 5. So whenever a shape reaches the B string, that note sits one fret higher than the lower-string pattern."],
      key: ["Key", "A home note plus the seven-note major scale built on it. " + c.key + ": " + c.scale + ". A song \"in " + c.r + "\" mostly uses chords made from these notes."],
      roman: ["Roman numerals", "Chords numbered by the scale note they start on, so the same numbers work in any key. In " + c.key + ": I = " + c.I + ", IV = " + c.IV + ", V = " + c.V + ". Capitals mean major, lower case means minor (ii, iii, vi) and ° means diminished (vii°)."],
      voicelead: ["Voice leading", "Moving each note of a chord to the nearest note of the next one. Notes the two chords share (common tones) don't move at all. Fewer frets moved = smoother sound."],
      common: ["Common tone", "A note two chords share. " + c.I + " (" + c.Inotes + ") and " + c.IV + " (" + c.IVnotes + ") share " + c.cIV + "; " + c.I + " and " + c.V + " (" + c.Vnotes + ") share " + c.cV + "."],
      steps: ["Half step · whole step", "One fret = a half step, two frets = a whole step. In a smooth chord change, notes move by half or whole steps, or stay put."],
      topnote: ["Top note", "The highest note of a shape. With smooth voice leading, the top notes make a little tune of their own."],
      chordscale: ["Chord scale", "The seven chords of a key, one on each scale note, using only notes from the key: I ii iii IV V vi vii°."],
      minor: ["Minor triad", "A minor 3rd on the bottom, then a major 3rd: darker sounding. " + c.ii + " = " + c.iinotes + "."],
      dim: ["Diminished", "Two minor 3rds stacked: " + c.vii + " = " + c.viinotes + ". Root to 5th is 6 half steps instead of 7, so it sounds tense and wants to move on."],
      vii: ["vii° (\"seven diminished\")", "The chord on the 7th note of the key; in " + c.key + " it's " + c.vii + ". Rare in rock, common in jazz and as a passing chord between two others."],
      twofive: ["ii–V–I", "The chord on the 2nd note, then the 5th, then home: " + c.ii + "–" + c.V + "–" + c.I + " in " + c.key + ". It's the backbone of jazz and turns up in pop and soul too."],
      relminor: ["Relative minor", "The vi chord (" + c.vi + ") uses exactly the notes of the " + c.key + " scale, so a song in " + c.viRoot + " minor mostly uses these same seven chords."],
      sus4: ["Sus4", "\"Suspended 4th\": the 3rd is replaced by the 4th note of the scale, 5 half steps above the root (a perfect 4th). It's neither major nor minor; it sounds unfinished and usually resolves back to major."],
      quality: ["Chord quality", "Whether a triad is major, minor, diminished or sus4. It's set by the intervals inside it, not by where you play it."],
      minoriv: ["Minor iv", "Borrowing the minor version of IV (" + c.IV + "m instead of " + c.IV + "). It isn't in the key, which is exactly why it sounds bittersweet."],
      resolve: ["Resolve", "When a tense sound moves to a stable one, such as sus4 → major. Your ear hears it as \"finished\"."],
      keys: ["Key path", "The 12 keys in circle-of-fifths order, easiest guitar keys first: G, C, D, A, E, F, B♭, B, E♭, A♭, F♯, D♭. Same shapes in each, with new frets and new note names."]
    };
  }

  /* ---------- the 16 levels ---------- */
  function content(part, set, c) {
    var d = c.d, w = W(c), I = d[0], ex, t, L;
    var id = "p" + part + "s" + set;
    switch (id) {
      case "p1s0":
        t = "Triads and intervals on the bottom three strings";
        L = ["A triad is a three-note chord: the root, the 3rd and the 5th. Built on " + c.r + ", that's " + c.Inotes + ".",
          "The distance between two notes is an interval, and on guitar you can count it in frets. A major triad stacks a major 3rd (4 frets) and a minor 3rd (3 frets): " + c.r + " up to " + c.t + " is 4, " + c.t + " up to " + c.f + " is 3.",
          "Here you'll find " + c.I + " on the E, A and D strings three ways: root position (root lowest), 1st inversion and 2nd inversion.",
          "Nearly every chord in pop, rock and country is a triad, so these small shapes let you play any chord anywhere on the neck."];
        return { title: t, learn: L, terms: [w.triad, w.rtf, w.interval, w.thirds, w.majmin, w.rootpos, w.inversion, w.stringset, w.clock], example: shapeEx(I, 0, 0, true) };
      case "p1s1":
        return { title: "The same triad on A-D-G",
          learn: ["Same " + c.I + " triad, same three orders, one string higher: A, D and G.",
            "E-A-D and A-D-G are both tuned 5 frets apart, so every shape from Level 1 works here as is. Slide it 7 frets up (or 5 down, when there's room) to keep it " + c.I + ".",
            "Knowing one chord on several string sets means you can play it wherever your hand already is."],
          terms: [w.fourths], example: shapeEx(I, 1, 1, false) };
      case "p1s2":
        return { title: "Triads on D-G-B: the B-string gap",
          learn: [c.I + " again, now on D, G and B: the middle strings, where a lot of rhythm guitar lives.",
            "The B string is tuned 4 frets above G instead of 5, so the note on the B string sits one fret higher than the lower-string shapes would put it.",
            "Learn that one-fret shift once and every triad on the higher strings makes sense."],
          terms: [w.bgap], example: shapeEx(I, 2, 2, false) };
      case "p1s3":
        return { title: "Triads on the top three strings",
          learn: ["Last string set for Part 1: G, B and high E, the bright top strings.",
            "The G-to-B gap is on the bottom pair here, so the B-string and high-E notes both sit one fret higher than the low-string pattern.",
            "These small shapes are the classic sound of funk, reggae and pop rhythm parts, and they cut through a full band."],
          terms: [w.steps], example: shapeEx(I, 3, 1, false) };
      case "p2s0":
        return { title: "Changing chords smoothly: I – IV – V",
          learn: ["Songs are built from chords that belong to a key. In " + c.key + " the three main ones are " + c.I + ", " + c.IV + " and " + c.V + ", written I, IV and V.",
            "You'll play I–IV–I–V–I (" + c.prog + ") on E-A-D, each time picking the closest shape of the next chord: fewest frets moved, shared notes held still.",
            "That's voice leading, and it's why good rhythm players sound smooth instead of jumpy."],
          terms: [w.key, w.roman, w.voicelead], example: moveEx(I, d[3], 0, 0) };
      case "p2s1":
        return { title: "I – IV – V on A-D-G",
          learn: ["Same moves (" + c.prog + "), now on A-D-G.",
            "Look for the common tone first: " + c.I + " and " + c.IV + " share " + c.cIV + ", " + c.I + " and " + c.V + " share " + c.cV + ". Keep that finger down and move the other two.",
            "This is how you'll change chords in real songs without your hand leaping around the neck."],
          terms: [w.common], example: moveEx(I, d[4], 1, 0) };
      case "p2s2":
        return { title: "I – IV – V on D-G-B",
          learn: ["I–IV–I–V–I (" + c.prog + ") on D-G-B.",
            "Most closest moves are tiny: one note stays put and the other two shift by one or two frets. Only right by the nut or the top of the neck do you sometimes have to jump.",
            "The B-string gap from Part 1 still applies, so trust the common tone and your ears."],
          terms: [w.steps], example: moveEx(I, d[3], 2, 1) };
      case "p2s3":
        return { title: "I – IV – V on the top strings",
          learn: ["Last set for Part 2: I–IV–I–V–I (" + c.prog + ") on G-B-E.",
            "Small shapes and smooth moves on the top strings are the sound of a lot of pop and country guitar parts.",
            "Listen to the top note: when you voice-lead well it moves like a little melody."],
          terms: [w.topnote], example: moveEx(I, d[4], 3, 0) };
      case "p3s0":
        return { title: "The seven chords of " + c.key,
          learn: ["Every major key has seven chords, one built on each note of its scale using only that key's notes. In " + c.key + ": " + c.list + ".",
            "They always follow the same pattern: major, minor, minor, major, major, minor, diminished (I ii iii IV V vi vii°).",
            "You'll walk all seven in one inversion on E-A-D. Know these and you can find almost every chord in a song in this key."],
          terms: [w.chordscale, w.minor, w.dim], example: shapeEx(d[1], 0, 0, true) };
      case "p3s1":
        return { title: "The chord scale on A-D-G",
          learn: ["The seven chords of " + c.key + " again, now on A-D-G: " + c.list + ".",
            "A minor shape is the major shape on the same root with its 3rd one fret lower; diminished lowers the 5th too.",
            "Walking up the key like this trains your eye to see a whole key in one area of the neck."],
          terms: [w.vii], example: shapeEx(d[5], 1, 1, false) };
      case "p3s2":
        return { title: "The chord scale on D-G-B",
          learn: ["The seven chords of " + c.key + " on D-G-B: " + c.list + ".",
            "Famous progressions come straight from these seven: I–vi–IV–V (" + c.I + "–" + c.vi + "–" + c.IV + "–" + c.V + ") and ii–V–I (" + c.ii + "–" + c.V + "–" + c.I + ").",
            "Remember the B-string gap: the B-string note sits one fret higher than on the lower sets."],
          terms: [w.twofive], example: shapeEx(d[4], 2, 0, false) };
      case "p3s3":
        return { title: "The chord scale on the top strings",
          learn: ["The seven chords of " + c.key + " on G-B-E: " + c.list + ".",
            "These small, bright shapes are perfect for a second guitar part above someone else's strumming.",
            "Clear this level and you've seen every chord in the key on every string set."],
          terms: [w.relminor], example: shapeEx(d[5], 3, 0, false) };
      case "p4s0":
        return { title: "Major, minor, diminished and sus4",
          learn: ["Major, minor, diminished and sus4 triads are close cousins: move one or two notes by a single fret and the mood changes.",
            "Minor lowers the 3rd one fret. Diminished lowers the 3rd and the 5th. Sus4 raises the 3rd one fret, to the 4th.",
            "You'll start from " + c.I + ", " + c.IV + " or " + c.V + " (silver rings) and reshape it in place. That's handy when a song switches between major and minor, or uses a sus4 before landing on major."],
          terms: [w.quality, w.sus4], example: shiftEx(I, "min", 0, 0) };
      case "p4s1":
        return { title: "Shape shifting on A-D-G",
          learn: ["Reshaping on A-D-G.",
            "Only the 3rd and the 5th ever move; the root stays, which is why the chord keeps its letter name.",
            "Major to minor is one of the most useful switches in songwriting: play " + c.IV + " then " + c.IV + "m and hear the classic bittersweet turn."],
          terms: [w.minoriv], example: shiftEx(d[3], "min", 1, 1) };
      case "p4s2":
        return { title: "Shape shifting on D-G-B",
          learn: ["Reshaping on D-G-B.",
            "Sus4 chords love to resolve: play " + c.V + "sus4 then " + c.V + " and listen to the 4th fall back to the 3rd.",
            "Diminished shapes are tense; you'll mostly hear them as passing chords between two others."],
          terms: [w.resolve], example: shiftEx(d[4], "sus4", 2, 0) };
      case "p4s3":
        return { title: "Shape shifting on the top strings",
          learn: ["The last level: reshaping on G-B-E.",
            "Up here these one-fret changes are easy to hear, which is why sus4 and minor moves show up in so many intros and fills.",
            "Clear all 16 levels in " + c.key + " and the next key on the path opens, and you move on to it."],
          terms: [w.keys], example: shiftEx(I, "dim", 3, 0) };
    }
    return null;
  }

  function forLevel(part, set, keyIdx) {
    var c = ctx(keyIdx || 0), x = content(part, set, c);
    if (!x) return null;
    var n = TQ.LEVELS.findIndex(function (l) { return l.part === part && l.set === set; }) + 1;
    x.id = "p" + part + "s" + set; x.part = part; x.set = set; x.level = n;
    x.kicker = "Level " + n + " · Part " + part + ": " + TQ.PARTS[part - 1].title + " · " + TQ.SET_SHORT[set] + (keyIdx ? " · " + c.key : "");
    return x;
  }

  /* ---------- Jam: timing words in plain English ---------- */
  function forJam(bpm) {
    bpm = bpm || 92;
    var beat = 60 / bpm;
    return {
      id: "jam", kicker: "Jam · play along", title: "Playing with a band",
      learn: ["Jam puts the shapes you've learned to work with a drummer, a bass player and a second guitar.",
        "The big lit dots are the triad of the chord playing now, coloured root, 3rd and 5th; the lane at the top shows which chords are coming.",
        "Strum or pick the lit shape when its chord arrives. Landing on time matters more than playing lots of notes."],
      terms: [["BPM", "Beats per minute: how fast the song goes. At " + bpm + " bpm a beat lasts about " + beat.toFixed(2) + " seconds."],
        ["Beat", "The steady pulse you'd tap your foot to. The four dots beside the chord lane light up one per beat."],
        ["Bar", "A group of four beats. Most chords here last one bar (four beats); a few last half a bar or two bars. When the last dot lights, the next chord is about to land."],
        ["Count-in", "Four clicks before the band starts, so you know exactly when beat 1 is."],
        ["Loop", "Plays the progression round and round. Turn it off to play it once."],
        ["Pentatonic", "A five-note scale that sounds good over every chord in the song. With the Pentatonic button on, rings show its notes for soloing; the ringed chord tones are the safest notes to land on."]],
      example: { kind: "timing", bpm: bpm, beat: beat,
        caption: "At " + bpm + " bpm: one beat ≈ " + beat.toFixed(2) + " s, one bar of 4 beats ≈ " + (4 * beat).toFixed(1) + " s. Count \"1 2 3 4\" and change chord on the next \"1\"." }
    };
  }

  /* ---------- next key on the guided path: what's new ---------- */
  function forKey(keyId, prevId) {
    var KP = root.TQKeys || (typeof require === "function" ? require("./keypath.js") : null);
    var ki = TQ.KEYS.findIndex(function (k) { return k.id === keyId; }), c = ctx(ki), acc = KP.accidentals(keyId);
    var sign = acc.length && acc[0].indexOf("♭") > 0 ? "flat" : "sharp";
    var L = [acc.length ? c.key + " has " + NUM[acc.length] + " " + sign + (acc.length > 1 ? "s" : "") + " (" + acc.join(", ") + "): " + c.scale + "."
      : c.key + " has no sharps or flats: " + c.scale + "."];
    if (prevId) {
      var pk = TQ.KEYS.filter(function (k) { return k.id === prevId; })[0], ps = TQ.diatonic(pk.root).map(function (x) { return x.root; });
      var cs = c.d.map(function (x) { return x.root; }), ch = [];
      cs.forEach(function (n) { var o = ps.filter(function (m) { return m.l === n.l; })[0]; if (o.a !== n.a) ch.push(TQ.nm(o) + " becomes " + TQ.nm(n)); });
      L.push(ch.length === 0 ? "Same notes as " + pk.label + "." : ch.length <= 2 ? "What's new after " + pk.label + ": " + ch.join(" and ") + "."
        : "A bigger change from " + pk.label + ": " + (ch.length === 7 ? "all seven notes are" : NUM[ch.length] + " of the seven notes are") + " spelled differently, so read the note names as you go.");
    }
    L.push("Its I, IV and V chords are " + c.I + ", " + c.IV + " and " + c.V + ": the three-chord backbone of countless songs in this key. Same 16 levels and shapes, new frets.");
    var n = KP.idx(keyId) + 1;
    return { id: "key-" + keyId, kicker: "Key " + n + " of 12 · guided path", title: "Next key: " + c.key, learn: L,
      terms: [["Sharps and flats", "A sharp (♯) raises a note one fret; a flat (♭) lowers it one fret. Each key uses just the sharps or flats its major scale needs."],
        ["Key path", "Keys in circle-of-fifths order, easiest guitar keys first: G, C, D, A, E, F, B♭, B, E♭, A♭, F♯, D♭. Clear all 16 levels in a key to open the next."]],
      example: shapeEx(c.d[0], 0, 0, false), accidentals: acc };
  }

  var TERMS_TRACKED = [
    ["triad", /\btriads?\b/i], ["interval", /\bintervals?\b/i], ["half step", /half steps?/i], ["major 3rd", /major 3rd/i], ["minor 3rd", /minor 3rd/i],
    ["perfect 5th", /perfect 5th/i], ["root position", /root position/i], ["inversion", /inversion/i], ["string set", /string sets?/i],
    ["key", /\bkeys?\b/i], ["roman numerals", /\bI–IV|Roman numeral/i], ["voice leading", /voice[- ]lead/i], ["common tone", /common tones?/i],
    ["minor chord", /\bminor (chord|triad|shape)s?\b/i], ["diminished", /diminished/i], ["sus4", /sus4/i], ["chord scale", /chord scale/i],
    ["perfect 4th", /perfect 4th/i], ["whole step", /whole steps?/i]
  ];
  var api = { forLevel: forLevel, forJam: forJam, forKey: forKey, ctx: ctx, shapeEx: shapeEx, moveEx: moveEx, shiftEx: shiftEx, TERMS_TRACKED: TERMS_TRACKED, SHIFT: SHIFT };
  root.TQIntro = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
