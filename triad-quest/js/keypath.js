/* Triad Quest - guided key path: the order of the 12 keys, which keys and levels are unlocked, and where to go next.
   Works only on the saved stars object ("<keyId>|p<part>s<set>" -> 0..3), so existing progress keeps counting. Pure. */
(function (root) {
  "use strict";
  var TQ = root.TQ || (typeof require === "function" ? require("./theory.js") : null);
  // circle of fifths, guitar-friendly keys first
  var PATH = ["G", "C", "D", "A", "E", "F", "Bb", "B", "Eb", "Ab", "F#", "Db"];
  function def(id) { return TQ.KEYS.filter(function (k) { return k.id === id; })[0]; }
  function idx(id) { return PATH.indexOf(id); }
  function stars(st, k, part, set) { return (st && st[k + "|p" + part + "s" + set]) || 0; }
  function partCleared(st, k, part) { for (var s = 0; s < 4; s++) if (!stars(st, k, part, s)) return false; return true; }
  function keyCleared(st, k) { for (var p = 1; p <= 4; p++) if (!partCleared(st, k, p)) return false; return true; }
  function levelsCleared(st, k) { var n = 0; for (var p = 1; p <= 4; p++) for (var s = 0; s < 4; s++) if (stars(st, k, p, s)) n++; return n; }
  function anyStars(st, k) { return levelsCleared(st, k) > 0; }
  /* a key opens when the key before it on the path is cleared; G is always open; a key you already have stars in stays open */
  function keyUnlocked(st, k, practice) {
    var i = idx(k); if (i < 0) return false;
    return !!practice || i === 0 || keyCleared(st, PATH[i - 1]) || anyStars(st, k);
  }
  function unlockedKeys(st, practice) { return PATH.filter(function (k) { return keyUnlocked(st, k, practice); }); }
  /* inside a key: same rules as G always had (next string set, then next part); levels you have stars in stay open */
  function levelUnlocked(st, k, part, set, practice) {
    if (practice || stars(st, k, part, set) > 0) return true;
    if (set > 0) return stars(st, k, part, set - 1) > 0;
    return part === 1 || partCleared(st, k, part - 1);
  }
  /* where the path is up to: the first unlocked key that isn't cleared (or the last key once all are cleared) */
  function current(st, practice) {
    for (var i = 0; i < PATH.length; i++) if (keyUnlocked(st, PATH[i], practice) && !keyCleared(st, PATH[i])) return PATH[i];
    return PATH[PATH.length - 1];
  }
  /* after clearing key k: the next key along the path that isn't cleared yet (null when all 12 are done) */
  function nextKey(st, k) {
    var i = idx(k);
    for (var j = 1; j < PATH.length; j++) { var c = PATH[(i + j) % PATH.length]; if (!keyCleared(st, c)) return c; }
    return null;
  }
  function state(st, k, cur, practice) { return keyCleared(st, k) ? "cleared" : k === cur ? "current" : keyUnlocked(st, k, practice) ? "open" : "locked"; }
  /* sharps/flats of a key, from its spelled scale */
  function accidentals(k) {
    var d = TQ.diatonic(def(k).root);
    var acc = d.map(function (c) { return c.root; }).filter(function (n) { return n.a !== 0; });
    var ord = acc.length && acc[0].a > 0 ? "FCGDAEB" : "BEADGCF";   // the order sharps / flats are always written in
    return acc.sort(function (x, y) { return ord.indexOf(TQ.LETTERS[x.l]) - ord.indexOf(TQ.LETTERS[y.l]); }).map(TQ.nm);
  }
  var api = { PATH: PATH, def: def, idx: idx, keyCleared: keyCleared, partCleared: partCleared, levelsCleared: levelsCleared, keyUnlocked: keyUnlocked,
    unlockedKeys: unlockedKeys, levelUnlocked: levelUnlocked, current: current, nextKey: nextKey, state: state, accidentals: accidentals };
  root.TQKeys = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
