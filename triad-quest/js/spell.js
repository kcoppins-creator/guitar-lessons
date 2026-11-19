/* Triad Quest - "Spell it" helper: correct note spelling of a triad (root/3rd/5th), its bass-to-top order on a
   string set, and the per-chord fade-out state machine. Pure functions, no DOM. */
(function (root) {
  "use strict";
  var TQ = root.TQ || (typeof require === "function" ? require("./theory.js") : null);
  var SHORT = { root: "R", "3rd": "3", "5th": "5", "4th": "4" };
  var CLS = { root: "r", "3rd": "t", "5th": "f", "4th": "s" };
  var DIM_AT = 3, HIDE_AT = 6, IDLE_MS = 4000;
  var MODES = [["auto", "Auto-fade"], ["always", "Always"], ["miss", "After a miss"], ["off", "Off"]];

  /* chord -> { name, notes:[{n, role, short, cls}], text: "A = A C♯ E" } ; placement+set -> order low to high */
  function spell(chord, placement, setIdx) {
    var notes = chord.tones.map(function (t, i) { var r = chord.roles[i]; return { n: TQ.nm(t), role: r, short: SHORT[r], cls: CLS[r] }; });
    var out = { name: chord.name, notes: notes, text: chord.name + " = " + notes.map(function (x) { return x.n; }).join(" ") };
    if (placement && setIdx !== null && setIdx !== undefined) {
      out.set = TQ.SET_SHORT[setIdx];
      out.inv = placement.inv;
      out.order = placement.roles.map(function (r) { return notes[r]; });
      out.orderText = "on " + out.set + ": " + out.order.map(function (x) { return x.n; }).join(" ");
    }
    return out;
  }
  /* order for a requested inversion without a concrete shape (bass = role inv, then up) */
  function invPlacement(inv) { return inv === null || inv === undefined ? null : { inv: inv, roles: [inv, (inv + 1) % 3, (inv + 2) % 3] }; }
  function key(chord) { return TQ.nm(chord.root) + "|" + chord.q; }

  /* ---------- fade state machine (per chord root + quality) ---------- */
  function get(store, chord) { var k = key(chord); return store[k] || { streak: 0, missed: false, seen: 0 }; }
  /* record one first-try answer. peeked answers neither advance nor reset the fade */
  function record(store, chord, ok, peeked) {
    var k = key(chord), s = get(store, chord);
    s = { streak: s.streak, missed: s.missed, seen: (s.seen || 0) + 1 };
    if (!ok) { s.streak = 0; s.missed = true; }
    else if (!peeked) { s.streak += 1; s.missed = false; }
    store[k] = s;
    return s;
  }
  function level(s) { return s.streak >= HIDE_AT ? "hidden" : s.streak >= DIM_AT ? "dim" : "full"; }
  /* what to show right now: "full" | "tap" (collapsed, tap/hold to reveal) | "none" (peek button only)
     opts: { missedNow, idleMs, peek, answered } */
  function display(mode, s, opts) {
    opts = opts || {};
    if (opts.peek || opts.answered) return mode === "off" && !opts.peek ? "none" : "full";
    if (mode === "off") return "none";
    if (mode === "always") return "full";
    if (mode === "miss") return opts.missedNow || s.missed ? "full" : "none";
    var lv = level(s);
    if (opts.missedNow || lv === "full") return "full";
    if (lv === "dim") return (opts.idleMs || 0) >= IDLE_MS ? "full" : "tap";
    return "none";
  }

  var api = { spell: spell, invPlacement: invPlacement, key: key, get: get, record: record, level: level, display: display, MODES: MODES, DIM_AT: DIM_AT, HIDE_AT: HIDE_AT, IDLE_MS: IDLE_MS, PEEK_COST: 10, PEEK_MS: 3000 };
  root.TQSpell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
