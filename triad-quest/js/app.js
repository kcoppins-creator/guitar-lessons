/* Triad Quest - app shell: screens, game flow, scoring, progress. */
(function () {
  "use strict";
  var TQ = window.TQ, A = window.TQAudio, Board = window.TQBoard, SP = window.TQSpell, IN = window.TQIntro, KP = window.TQKeys;
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------- progress (localStorage is optional; every access is guarded) ---------- */
  var STORE = "triad-quest-app-v1";
  var DEFAULT_SETTINGS = { sound: true, volume: 0.8, names: false, metronome: 0, orientation: "auto", notes: "auto", intros: true, notesUnlockAll: false };
  function defaultJam() { return { track: "kevin", set: 2, mode: null, style: null, bpm: null, key: null, countIn: true, loop: true, ovTriad: true, ovNext: true, ovPent: null, names: true, boxShift: 0, mix: { drums: 0.9, bass: 0.72, gtr: 0.72, mDrums: false, mBass: false, mGtr: false } }; }
  function fresh() { return { stars: {}, points: 0, bestStreak: 0, speed: {}, practice: false, keyId: "G", last: null, settings: Object.assign({}, DEFAULT_SETTINGS), jam: defaultJam(), spell: {}, seenJamIntro: false, notes: window.TQNotes.freshStore() }; }
  function getStore() {
    try { var ls = window.localStorage; if (!ls) return null; ls.setItem(STORE + "-probe", "1"); ls.removeItem(STORE + "-probe"); return ls; }
    catch (e) { return null; }
  }
  var storageOK = !!getStore();
  function load() {
    var p = fresh(), ls = getStore();
    if (!ls) return p;
    try {
      var o = JSON.parse(ls.getItem(STORE) || "null");
      if (!o || typeof o !== "object") return p;
      if (o.stars && typeof o.stars === "object") p.stars = o.stars;
      if (typeof o.points === "number") p.points = o.points;
      if (typeof o.bestStreak === "number") p.bestStreak = o.bestStreak;
      if (o.speed && typeof o.speed === "object") p.speed = o.speed;
      p.practice = o.practice === true;
      if (typeof o.keyId === "string" && TQ.KEYS.some(function (k) { return k.id === o.keyId; })) p.keyId = o.keyId;
      if (o.last && typeof o.last.part === "number") p.last = o.last;
      if (o.settings && typeof o.settings === "object") p.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings);
      if (o.spell && typeof o.spell === "object") p.spell = o.spell;
      if (o.seenJamIntro) p.seenJamIntro = true;
      p.notes = window.TQNotes.normalize(o.notes);
      // a key that isn't open on the guided path (and has no stars) falls back to where the path is up to
      if (window.TQKeys && !window.TQKeys.keyUnlocked(p.stars, p.keyId, p.practice)) p.keyId = window.TQKeys.current(p.stars, p.practice);
      if (o.jam && typeof o.jam === "object") { var dj = defaultJam(); p.jam = Object.assign(dj, o.jam); p.jam.mix = Object.assign(defaultJam().mix, o.jam.mix || {}); }
    } catch (e) { /* corrupt data: start fresh */ }
    return p;
  }
  var P = load();
  function save() { try { var ls = getStore(); if (ls) ls.setItem(STORE, JSON.stringify(P)); } catch (e) { /* blocked */ } }

  A.setMuted(!P.settings.sound); A.setVolume(P.settings.volume);

  /* ---------- derived state ---------- */
  function keyIdx() { var i = TQ.KEYS.findIndex(function (k) { return k.id === P.keyId; }); return i < 0 ? 0 : i; }
  function keyDef() { return TQ.KEYS[keyIdx()]; }
  function starsOf(k, id) { return P.stars[k + "|" + id] || 0; }
  function partCleared(k, part) { return [0, 1, 2, 3].every(function (s) { return starsOf(k, "p" + part + "s" + s) > 0; }); }
  /* guided key path (js/keypath.js): G → C → D → A → E → F → B♭ → B → E♭ → A♭ → F♯ → D♭ */
  function keyOpen(id) { return KP.keyUnlocked(P.stars, id, P.practice); }
  function unlocked(part, set) { return KP.levelUnlocked(P.stars, P.keyId, part, set, P.practice); }
  function keyPickerOpen() { return KP.unlockedKeys(P.stars, P.practice).length > 1; }
  function anyKey(fn) { return TQ.KEYS.some(function (k) { return fn(k.id); }); }
  function speedOpen() { return P.practice || anyKey(function (k) { return partCleared(k, 1); }); }
  function speedWide() { return P.practice || partCleared(P.keyId, 3); }
  function totalStars() { return TQ.LEVELS.reduce(function (s, l) { return s + starsOf(P.keyId, l.id); }, 0); }
  function nextUp() {
    var L = TQ.LEVELS.filter(function (l) { return unlocked(l.part, l.set) && starsOf(P.keyId, l.id) === 0; })[0];
    if (L) return L;
    L = TQ.LEVELS.filter(function (l) { return unlocked(l.part, l.set) && starsOf(P.keyId, l.id) < 3; })[0];
    return L || null;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function starStr(n) { return '<span class="stars"><b>' + "★".repeat(n) + "</b><i>" + "★".repeat(Math.max(0, 3 - n)) + "</i></span>"; }

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1600);
  }

  /* ---------- screens ---------- */
  var screen = "home", board = null, run = null, marks = null, history = [], streak = 0, summary = null, tick = null;
  function emptyMarks() { return [null, null, null, null, null, null]; }
  function teardown() {
    if (board) { board.destroy(); board = null; }
    if (tick) { clearInterval(tick); tick = null; }
    A.metroStop();
    if (window.TQJam && screen === "jam") { window.TQJam.stop(); jam.playing = false; }
    if (window.TQNotesUI) window.TQNotesUI.teardown();
  }
  function go(name) {
    teardown();
    screen = name;
    app.className = "screen-" + name;
    if (name === "home") renderHome();
    else if (name === "levels") renderLevels();
    else if (name === "settings") renderSettings();
    else if (name === "learn") renderLearn();
    else if (name === "result") renderResult();
    else if (name === "play") renderPlay();
    else if (name === "jam") renderJam();
    else if (name.indexOf("notes") === 0 && window.TQNotesUI) window.TQNotesUI.render(name);
    app.scrollTop = 0;
  }

  function renderHome() {
    var nu = nextUp(), kd = keyDef();
    var contLabel = nu ? "Part " + nu.part + " · " + TQ.PARTS[nu.part - 1].title + " · " + TQ.SET_SHORT[nu.set] : "Everything has 3 stars. Try the speed round.";
    app.innerHTML =
      '<div class="home">' +
      '<div class="hero"><img class="logo" src="icons/icon-512.png" alt="" width="112" height="112">' +
      '<div><h1>Triad Quest</h1><p class="tag">Learn every triad, in every inversion, all over the neck.</p></div></div>' +
      '<div class="stats">' +
      stat("Points", P.points.toLocaleString()) + stat("Best streak", P.bestStreak) + stat("Stars · " + kd.id, totalStars() + "/48") + stat("Speed best", P.speed[kd.id] || 0) +
      "</div>" +
      '<div class="menu">' +
      '<button class="big primary" data-act="continue"' + (nu ? "" : " disabled") + '><span class="bt">' + (P.points > 0 ? "Continue" : "Start") + '</span><span class="bs">' + esc(contLabel) + "</span></button>" +
      '<button class="big" data-act="levels"><span class="bt">Levels</span><span class="bs">4 parts · 16 levels · ' + esc(kd.label) + "</span></button>" +
      '<button class="big" data-act="speed"' + (speedOpen() ? "" : " disabled") + '><span class="bt">Speed Round</span><span class="bs">' + (speedOpen() ? "60 seconds · as many shapes as you can" : "Unlocks after Part 1") + "</span></button>" +
      '<button class="big notesbtn" data-act="notes"><span class="bt">🎯 Notes</span><span class="bs">Learn every note on the neck · ' + esc(window.TQNotesUI ? window.TQNotesUI.homeLine() : "Note Path, drills and a heatmap") + "</span></button>" +
      '<button class="big jambtn" data-act="jam"><span class="bt">🎸 Jam</span><span class="bs">Play along with a band · Kevin\'s E jam + ' + (jamOpenCount() - 1) + " curriculum tracks open</span></button>" +
      '<div class="row2"><button class="big small" data-act="learn"><span class="bt">How it works</span></button>' +
      '<button class="big small" data-act="settings"><span class="bt">Settings</span></button></div>' +
      "</div>" +
      (storageOK ? "" : '<p class="infonote">This browser is blocking storage, so progress lasts until you close the app.</p>') +
      "</div>";
  }
  function stat(label, val) { return '<div class="stat"><div class="sv">' + esc(val) + '</div><div class="sl">' + esc(label) + "</div></div>"; }

  function renderLevels() {
    var html = '<div class="page"><header class="pagebar"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><h2>Levels</h2>';
    if (keyPickerOpen()) {
      html += '<label class="keypick">Key <select id="keySel">' + KP.PATH.map(function (id) { var k = KP.def(id), op = keyOpen(id); return '<option value="' + id + '"' + (id === P.keyId ? " selected" : "") + (op ? "" : " disabled") + ">" + k.label + (op ? "" : " (locked)") + "</option>"; }).join("") + "</select></label>";
    } else html += '<span class="muted small">Key of ' + esc(keyDef().label) + "</span>";
    html += "</header>" + keyMapHtml() + "<div class='parts'>";
    TQ.PARTS.forEach(function (p) {
      html += '<section class="part"><div class="ph"><span class="pn">Part ' + p.part + '</span><h3>' + p.title + '</h3></div><p class="muted">' + p.blurb + '</p><div class="lv">';
      for (var s = 0; s < 4; s++) {
        var open = unlocked(p.part, s), st = starsOf(P.keyId, "p" + p.part + "s" + s);
        html += '<button class="lvl' + (open ? "" : " locked") + '" data-act="start" data-part="' + p.part + '" data-set="' + s + '"' + (open ? "" : " disabled") + '><span class="lt">' + TQ.SET_SHORT[s] + '</span>' + (open ? starStr(st) : '<span class="lock">Locked</span>') + "</button>";
      }
      html += "</div></section>";
    });
    html += "</div>" + (P.practice ? '<p class="infonote">Practice mode is on: everything is unlocked. Turn it off in Settings.</p>' : "") + "</div>";
    app.innerHTML = html;
    var sel = document.getElementById("keySel");
    if (sel) sel.addEventListener("change", function () { if (keyOpen(sel.value)) P.keyId = sel.value; save(); renderLevels(); });
  }

  function keyMapHtml() {
    var cur = KP.current(P.stars, P.practice), done = KP.PATH.filter(function (k) { return KP.keyCleared(P.stars, k); }).length;
    var n = KP.levelsCleared(P.stars, P.keyId);
    var nx = KP.PATH[KP.idx(P.keyId) + 1];
    return '<section class="keymap" aria-label="Key path"><div class="kmh"><b>Key path</b><span class="muted">' + done + " of 12 keys cleared · " + esc(keyDef().label) + ": " + n + "/16 levels" +
      (nx && !keyOpen(nx) ? " · clear all 16 to open " + esc(KP.def(nx).label) : "") + "</span></div><div class=\"pips\">" +
      KP.PATH.map(function (id, i) {
        var st = KP.state(P.stars, id, cur, P.practice), on = id === P.keyId, lab = KP.def(id).label.replace(" major", "");
        return (i ? '<i class="kline' + (st === "locked" ? "" : " lit") + '"></i>' : "") + '<button class="pip ' + st + (on ? " on" : "") + '" data-act="pickKey" data-v="' + id + '"' + (st === "locked" ? " disabled" : "") +
          ' aria-label="' + esc(KP.def(id).label) + " (" + st + ')" title="' + esc(KP.def(id).label) + '"><b>' + esc(lab) + "</b><small>" + (st === "cleared" ? "✓" : st === "locked" ? "🔒" : KP.levelsCleared(P.stars, id) + "/16") + "</small></button>";
      }).join("") + "</div></section>";
  }

  function renderSettings() {
    var s = P.settings;
    function sw(id, on, label, sub) { return '<button class="setrow" data-act="toggle" data-id="' + id + '"><span><b>' + label + "</b>" + (sub ? '<small>' + sub + "</small>" : "") + '</span><span class="switch' + (on ? " on" : "") + '"><i></i></span></button>'; }
    function seg(id, val, opts) { return '<div class="seg" data-id="' + id + '">' + opts.map(function (o) { return '<button data-act="seg" data-id="' + id + '" data-v="' + o[0] + '" class="' + (String(val) === String(o[0]) ? "on" : "") + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
    app.innerHTML =
      '<div class="page"><header class="pagebar"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><h2>Settings</h2></header>' +
      '<div class="settings">' +
      sw("sound", s.sound, "Sound", "Plucked-string notes and chimes") +
      '<div class="setrow"><span><b>Volume</b></span><input id="vol" type="range" min="0" max="1" step="0.05" value="' + s.volume + '"></div>' +
      sw("names", s.names, "Show note names while placing", "Names always appear after you check") +
      sw("intros", s.intros !== false, "Show level intros", "A short \u201chere\u2019s what we\u2019ll learn\u201d card before each level until you clear it. Turn off = don\u2019t show intros again. Reopen one any time with \u24d8.") +
      '<div class="setrow col"><span><b>Board</b><small>Auto: across on iPad, upright on narrow phones</small></span>' + seg("orientation", s.orientation, [["auto", "Auto"], ["across", "Across"], ["upright", "Upright"]]) + "</div>" +
      '<div class="setrow col"><span><b>Notes of the triad</b><small>Auto-fade: shown until you get a chord right 3 times in a row, then tap to see; hidden after 6. A miss brings it back. Peek (−' + SP.PEEK_COST + ' points) any time.</small></span>' + seg("notes", s.notes, SP.MODES) + "</div>" +
      '<div class="setrow col"><span><b>Metronome in the speed round</b><small>A click to keep you moving (beats per minute)</small></span>' + seg("metronome", s.metronome, [[0, "Off"], [60, "60"], [80, "80"], [100, "100"]]) + "</div>" +
      sw("practice", P.practice, "Practice mode", "Unlock every level and the key picker") +
      sw("notesUnlockAll", !!s.notesUnlockAll, "Unlock all Note Path phases", "Open every Notes phase without passing or testing out. Your stats and passed phases stay as they are.") +
      '<button class="setrow danger" data-act="reset"><span><b>Reset progress</b><small>Clears stars, points, streaks and note stats (the Notes heatmap) on this device</small></span></button>' +
      "</div>" + (storageOK ? "" : '<p class="infonote">Storage is blocked in this browser, so settings and progress last until you close the app.</p>') + "</div>";
    var vol = document.getElementById("vol");
    vol.addEventListener("input", function () { P.settings.volume = +vol.value; A.setVolume(+vol.value); save(); });
    vol.addEventListener("change", function () { A.pluck(TQ.midiAt(3, 0)); });
  }

  function renderLearn() {
    var words = [
      ["Triad", "A three-note chord: root, 3rd and 5th. G major is G – B – D."],
      ["Root, 3rd, 5th", "The root names the chord. The 3rd is two letters up (G → B) and makes it major or minor. The 5th is four letters up (G → D)."],
      ["Root position", "The root is the lowest note: G – B – D, low to high."],
      ["1st inversion", "The 3rd is the lowest note: B – D – G. Same chord, different order."],
      ["2nd inversion", "The 5th is the lowest note: D – G – B."],
      ["String set", "Three neighbouring strings: E-A-D, A-D-G, D-G-B or G-B-E. Each shape lives on one set."],
      ["Voice leading", "Moving to the next chord with as little finger travel as possible, keeping shared notes where they are."],
      ["Chord scale", "The seven chords built on each note of a major scale: major, minor, minor, major, major, minor, diminished (I ii iii IV V vi vii°)."],
      ["Minor · diminished · sus4", "Minor lowers the 3rd one fret. Diminished lowers the 3rd and 5th one fret each. Sus4 raises the 3rd one fret to the 4th."],
      ["Spelling", "Each triad uses every other letter, so in E major the 3rd of B is D♯, not E♭."]
    ];
    var scoring = [
      ["Right first time", "100 points + up to 50 for speed + up to 100 for your streak."],
      ["Bonus question", "+25 for naming notes, the top note or the inversion."],
      ["Miss", "Streak resets; you hear and see the right shape. Retry for practice (no points)."],
      ["Stars", "★ finish · ★ 80%+ right first time · ★ beat the target time."],
      ["Unlocks", "Each level opens the next string set; a cleared part opens the next part; all 16 levels in a key opens the next key on the path (G, C, D, A, E, F, B♭, B, E♭, A♭, F♯, D♭)."]
    ];
    app.innerHTML =
      '<div class="page"><header class="pagebar"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><h2>How it works</h2></header>' +
      '<div class="learn"><section><h3>The four parts</h3><ol class="parts-list">' +
      TQ.PARTS.map(function (p) { return "<li><b>" + p.title + "</b> " + p.blurb + "</li>"; }).join("") +
      "</ol></section><section><h3>Words used here</h3><dl>" +
      words.map(function (w) { return "<dt>" + w[0] + "</dt><dd>" + w[1] + "</dd>"; }).join("") +
      "</dl></section><section><h3>Points and stars</h3><dl>" +
      scoring.map(function (w) { return "<dt>" + w[0] + "</dt><dd>" + w[1] + "</dd>"; }).join("") +
      "</dl></section><section><h3>Controls</h3><p class='muted'>Tap a fret on a lit string to place a note (you'll hear it). Tap it again to remove it, or tap another fret on that string to move it. One note per string. Hear it plays the target chord. Check strums your shape.</p></section></div></div>";
  }

  /* ---------- game flow ---------- */
  function newRun(part, set) {
    var plan = TQ.makePlan(), speed = part === 0, meta = speed ? { count: 9999, par: 0 } : TQ.PARTS[part - 1], now = Date.now();
    return { part: part, set: set, count: meta.count, par: meta.par, speed: speed, plan: plan, idx: 0,
      item: TQ.makeItem(part, set, 0, keyIdx(), plan, null, speedWide()), prev: null, results: [], earned: 0, correct: 0,
      itemStart: now, runStart: now, missed: false, peeked: false, phase: "place", verdict: null, quiz: null, lastGain: "", checkSecs: 0 };
  }
  function start(part, set) {
    run = newRun(part, set); marks = emptyMarks(); history = []; intro = null;
    if (part > 0) { P.last = { part: part, set: set }; save(); }
    go("play");
  }

  function renderPlay() {
    app.innerHTML =
      '<div class="play">' +
      '<header class="topbar"><button class="icon-btn" data-act="quit" aria-label="Back to home">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker" id="kicker"></div><div class="progress" id="progress"></div></div>' +
      (run.speed ? "" : '<button class="icon-btn info" data-act="intro" aria-label="What this level teaches">ⓘ</button>') +
      '<div class="chips"><span class="chip" id="chipTime"></span><span class="chip streak" id="chipStreak"></span><span class="chip pts" id="chipPts"></span></div></header>' +
      '<section class="prompt" id="prompt"></section>' +
      '<section class="spellbar" id="spell" aria-live="polite"></section>' +
      '<section class="board-area" id="boardArea"></section>' +
      '<section class="panel" id="panel"></section></div>';
    board = new Board(document.getElementById("boardArea"), { onTap: tap, getOrientation: function () { return P.settings.orientation; } });
    if (run.speed && P.settings.metronome) A.metroStart(P.settings.metronome);
    refreshAll();
    tick = setInterval(onTick, 250);
    if (!run.speed && P.settings.intros !== false && !everCleared(run.part, run.set)) openIntro();
  }

  /* ---------- "here's what we'll learn" intro cards ---------- */
  var intro = null;
  function everCleared(part, set) { var id = "|p" + part + "s" + set; return Object.keys(P.stars).some(function (k) { return k.slice(-id.length) === id && P.stars[k] > 0; }); }
  function miniBoard(ex) {
    if (ex.kind === "timing") return '<div class="mbeats"><span>1</span><span>2</span><span>3</span><span>4</span></div>';
    var strs = (ex.strings || TQ.SETS[ex.set]).slice().reverse(), all = ex.frets.concat(ex.fromFrets || []);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), st = lo <= 2 ? 0 : lo - 1, en = Math.max(hi + 1, st + 4);
    if (ex.range) { st = Math.max(0, ex.range[0] <= 2 ? 0 : ex.range[0] - 1); en = Math.max(ex.range[1], st + 3); }
    function at(list, s, f) { return (list || []).filter(function (d) { return d.string === s && d.fret === f; })[0]; }
    var h = '<div class="mini" style="--cols:' + (en - st + 1) + '">';
    strs.forEach(function (s) {
      h += '<div class="mbr"><span class="mlab">' + TQ.STR_LETTER[s] + "</span>";
      for (var f = st; f <= en; f++) {
        var d = at(ex.dots, s, f), r = at(ex.fromDots, s, f);
        h += '<span class="mc' + (f === 0 ? " open" : "") + '">' + (d ? '<span class="md ' + d.cls + (r ? " kept" : "") + '">' + esc(d.n) + "<i>" + d.short + "</i></span>" : r ? '<span class="mring">' + esc(r.n) + "</span>" : "") + "</span>";
      }
      h += "</div>";
    });
    h += '<div class="mbr mnum"><span class="mlab"></span>';
    for (var g = st; g <= en; g++) h += '<span class="mc">' + (g === 0 ? "open" : g) + "</span>";
    return h + "</div></div>";
  }
  function introHtml(x) {
    return '<div class="introwrap" id="intro" role="dialog" aria-modal="true" aria-labelledby="introTitle"><div class="introcard">' +
      '<div class="ik">' + esc(x.kicker) + '</div><h2 id="introTitle">' + esc(x.title) + "</h2>" +
      '<div class="ibody"><div class="ilearn"><h3>Here\u2019s what we\u2019ll learn</h3>' + x.learn.map(function (l) { return "<p>" + esc(l) + "</p>"; }).join("") + "</div>" +
      '<figure class="iex"><h3>Example</h3>' + miniBoard(x.example) + "<figcaption>" + esc(x.example.caption) + "</figcaption></figure></div>" +
      '<section class="iterms"><h3>Words to know</h3><dl>' + x.terms.map(function (t) { return "<div><dt>" + esc(t[0]) + "</dt><dd>" + esc(t[1]) + "</dd></div>"; }).join("") + "</dl></section>" +
      '<div class="ifoot">' + (x.id && x.id.indexOf("key-") === 0 ? '<span class="muted small">Your stars in every key are kept.</span>' : '<label class="inoshow"><input type="checkbox" id="introNo"' + (P.settings.intros === false ? " checked" : "") + "> Don\u2019t show intros again</label>") +
      '<button class="btn check igo" data-act="introGo">Let\u2019s go ›</button></div></div></div>';
  }
  function openIntro(given, onGo) {
    if (document.getElementById("intro")) return;
    var host = given ? app : document.querySelector(screen === "jam" ? ".jam" : ".play"); if (!host) return;
    var x = given || (screen === "jam" ? IN.forJam(jamBpm(jam.sched.track)) : (run && !run.speed ? IN.forLevel(run.part, run.set, keyIdx()) : null));
    if (!x) return;
    host.insertAdjacentHTML("beforeend", introHtml(x));
    intro = { at: Date.now(), onGo: onGo || null, given: !!given, id: x.id || "" };
    var b = document.querySelector("#intro .igo"); if (b) b.focus({ preventScroll: true });
  }
  function closeIntro() {
    var el = document.getElementById("intro"); if (!el) { intro = null; return; }
    var no = document.getElementById("introNo");
    if (no && !(intro && intro.id.indexOf("key-") === 0)) { P.settings.intros = !no.checked; }
    if (screen === "jam") P.seenJamIntro = true;
    save();
    if (intro && run && screen === "play" && !intro.given) { var dt = Date.now() - intro.at; run.itemStart += dt; run.runStart += dt; }
    var go2 = intro && intro.onGo;
    el.remove(); intro = null;
    if (go2) go2();
  }
  function refreshAll() { updateTop(); updatePrompt(); updateBoard(); updatePanel(); updateSpell(true); }

  /* ---------- spell-it strip ---------- */
  var spellSig = "", peekUntil = 0, peekTimer = null;
  function chipsHtml(notes, small) {
    return notes.map(function (x) { return '<span class="sn ' + x.cls + (small ? " sm" : "") + '">' + esc(x.n) + "<i>" + x.short + "</i></span>"; }).join("");
  }
  function spellHtml(sp, disp, opts) {
    opts = opts || {};
    var peekBtn = '<button class="peek" data-act="peek" aria-label="Peek at the notes">👁 Peek' + (opts.cost ? " <small>−" + opts.cost + "</small>" : "") + "</button>";
    if (disp === "none") return '<div class="spell none">' + peekBtn + "</div>";
    if (disp === "tap") return '<button class="spell tap" data-act="peek" data-hold="1"><span class="sp-name">' + esc(sp.name) + ' =</span><span class="blur">' + chipsHtml(sp.notes) + '</span><span class="sp-hint">Tap or hold to see the notes' + (opts.cost ? " (−" + opts.cost + ")" : "") + "</span></button>";
    var order = sp.order ? '<span class="sp-order">' + esc((sp.inv !== undefined && sp.inv !== null ? TQ.INV_NAME[sp.inv] + " " : "") + "on " + sp.set) + ' <span class="lh">low → high</span> ' + chipsHtml(sp.order, true) + "</span>" : "";
    return '<div class="spell full"><span class="sp-name">' + esc(sp.name) + ' =</span>' + chipsHtml(sp.notes) + order + "</div>";
  }
  function spellState(chord) { return SP.get(P.spell, chord); }
  function updateSpell(force) {
    var el = document.getElementById("spell"); if (!el || !run || screen !== "play") return;
    var it = run.item, now = Date.now(), answered = run.phase !== "place";
    var pl = answered && run.verdict ? run.verdict.best : (it.mode === "near" ? null : SP.invPlacement(it.inv));
    var st = spellState(it.chord);
    var disp = SP.display(P.settings.notes, st, { missedNow: run.missed, idleMs: now - run.itemStart, peek: peekUntil > now, answered: answered });
    if (P.settings.notes === "off" && !answered && peekUntil <= now) disp = "none";
    // shown by the ~4 s idle reveal: that answer doesn't count toward fading (but costs nothing)
    if (!answered && disp === "full" && peekUntil <= now && !run.missed && SP.display(P.settings.notes, st, { idleMs: 0 }) === "tap") run.revealed = true;
    var sig = [disp, it.chord.name, pl ? pl.roles.join("") : "", run.phase, it.set].join("|");
    if (!force && sig === spellSig) return;
    spellSig = sig;
    var sp = SP.spell(it.chord, pl, it.set);
    el.className = "spellbar d-" + disp;
    el.innerHTML = spellHtml(sp, disp, { cost: run.peeked || answered ? 0 : SP.PEEK_COST });
  }
  function peek() {
    if (screen === "jam") { jam.peekUntil = Date.now() + SP.PEEK_MS; jamRefresh(); clearTimeout(peekTimer); peekTimer = setTimeout(function () { if (screen === "jam") jamRefresh(); }, SP.PEEK_MS + 50); return; }
    if (!run || screen !== "play") return;
    if (run.phase === "place" && !run.peeked) { run.peeked = true; }
    peekUntil = Date.now() + SP.PEEK_MS; updateSpell(true);
    clearTimeout(peekTimer); peekTimer = setTimeout(function () { updateSpell(true); }, SP.PEEK_MS + 50);
  }
  function unpeek() { peekUntil = 0; if (screen === "jam") { jam.peekUntil = 0; jamRefresh(); } else updateSpell(true); }

  function updateTop() {
    var kd = keyDef();
    document.getElementById("kicker").innerHTML = run.speed
      ? "Speed Round · " + esc(kd.label)
      : "Part " + run.part + " · " + TQ.PARTS[run.part - 1].title + " · <b>" + TQ.SET_SHORT[run.set] + "</b>" + (kd.id !== "G" ? " · " + esc(kd.label) : "");
    var pg = document.getElementById("progress");
    if (run.speed) {
      pg.innerHTML = '<div class="timebar"><i id="timefill"></i></div>';
    } else {
      var h = "";
      for (var i = 0; i < run.count; i++) {
        var r = run.results[i], cls = r ? (r.ok ? "ok" : "bad") : i === run.idx ? "cur" : "";
        h += '<i class="' + cls + '"></i>';
      }
      pg.innerHTML = '<div class="segs">' + h + "</div>";
    }
    document.getElementById("chipStreak").innerHTML = "🔥 " + streak;
    document.getElementById("chipPts").innerHTML = "★ " + P.points.toLocaleString();
    onTick();
  }
  function onTick() {
    if (!run || intro) return;
    updateSpell(false);
    var now = Date.now();
    var ct = document.getElementById("chipTime");
    if (run.speed) {
      var left = Math.max(0, TQ.SPEED_MS - (now - run.runStart));
      if (ct) ct.textContent = Math.ceil(left / 1000) + "s · " + run.correct + " ✓";
      var tf = document.getElementById("timefill");
      if (tf) tf.style.width = (left / TQ.SPEED_MS * 100) + "%";
      if (left <= 0) finishSpeed();
    } else if (ct) {
      var secs = run.phase === "place" ? (now - run.itemStart) / 1000 : run.checkSecs;
      ct.textContent = Math.floor(secs) + "s";
      ct.classList.toggle("over", run.phase === "place" && secs > run.par);
    }
  }
  function updatePrompt() {
    var it = run.item;
    var showHint = it.hint && (it.mode !== "scale" || run.missed);
    document.getElementById("prompt").innerHTML =
      '<div class="pt">' + esc(it.title).replace(esc(it.chord.name), '<em>' + esc(it.chord.name) + "</em>") + "</div>" +
      '<div class="ps">' + esc(it.sub) + "</div>" + (showHint ? '<div class="ph2">' + esc(it.hint) + "</div>" : "");
  }
  function showLabels() { return run.phase === "place" ? P.settings.names : !(run.phase === "quiz" && run.quiz && run.quiz.picked === null); }
  function updateBoard() {
    var it = run.item, set = TQ.SETS[it.set], lab = showLabels(), flat = keyDef().flat, dots = [], v = run.verdict;
    board.setActive(set);
    if (it.given && it.givenChord) {
      it.given.frets.forEach(function (f, i) {
        dots.push({ key: set[i] + "-" + f + "-g", s: set[i], f: f, kind: "given", label: lab ? TQ.nm(it.givenChord.tones[it.given.roles[i]]) : "" });
      });
    }
    marks.forEach(function (m, s) {
      if (m === null) return;
      var kind = v ? (v.per[s] === "ok" ? "ok" : "bad") : "mark";
      var role = v && lab ? TQ.roleAt(s, m, it.chord) : null;
      dots.push({ key: s + "-" + m + "-m", s: s, f: m, kind: kind, label: lab ? TQ.noteName(s, m, it.chord, flat) : "", role: role ? shortRole(role) : "" });
    });
    if (v && !v.ok) {
      v.best.frets.forEach(function (f, i) {
        if (marks[set[i]] !== f) dots.push({ key: set[i] + "-" + f + "-h", s: set[i], f: f, kind: "ghost", label: TQ.nm(it.chord.tones[v.best.roles[i]]), role: shortRole(it.chord.roles[v.best.roles[i]]) });
      });
    }
    board.setDots(dots);
  }
  function shortRole(r) { return r === "root" ? "R" : r === "3rd" ? "3" : r === "5th" ? "5" : r === "4th" ? "4" : ""; }

  function updatePanel() {
    var pn = document.getElementById("panel"), v = run.verdict, placed = marks.filter(function (m) { return m !== null; }).length;
    pn.className = "panel " + run.phase + (v ? (v.ok ? " good" : " miss") : "");
    if (run.phase === "place") {
      pn.innerHTML =
        '<div class="actions">' +
        '<button class="btn" data-act="undo"' + (history.length ? "" : " disabled") + '>↶ Undo</button>' +
        '<button class="btn" data-act="clear"' + (placed ? "" : " disabled") + '>Clear</button>' +
        '<button class="btn" data-act="hear">🔊 Hear it</button>' +
        '<span class="dots3">' + TQ.SETS[run.item.set].map(function (s) { return '<i class="' + (marks[s] !== null ? "on" : "") + '">' + TQ.STR_LETTER[s] + "</i>"; }).join("") + "</span>" +
        '<button class="btn check" data-act="check"' + (placed ? "" : " disabled") + ">Check</button></div>";
      return;
    }
    var head = v.ok ? (run.missed ? "Got it" : pick(["Nailed it!", "Yes!", "Clean.", "Nice!", "That's the one."])) : "Not quite";
    var html = '<div class="fb"><div class="fbh"><span class="fbi">' + (v.ok ? "✓" : "✕") + "</span><b>" + head + "</b>" +
      (run.lastGain ? '<span class="gain">' + esc(run.lastGain) + "</span>" : "") + '</div><div class="fbm">' + esc(v.msg) + "</div></div>";
    if (run.speed) { pn.innerHTML = html; return; }
    if (run.phase === "quiz" && run.quiz) {
      var q = run.quiz, done = q.picked !== null;
      html += '<div class="quiz"><div class="qq">Bonus +25 · ' + esc(q.q) + '</div><div class="qo">' +
        q.options.map(function (o, i) {
          var cls = done ? (i === q.answer ? "right" : i === q.picked ? "wrong" : "dim") : "";
          return '<button class="opt ' + cls + '" data-act="pick" data-i="' + i + '"' + (done ? " disabled" : "") + ">" + esc(o) + "</button>";
        }).join("") + "</div></div>";
      html += '<div class="actions end"><button class="btn" data-act="replay">🔊 Replay</button><button class="btn check" data-act="next">' + (done ? (lastItem() ? "Finish" : "Next") : "Skip") + " ›</button></div>";
    } else {
      html += '<div class="actions end"><button class="btn" data-act="hearAnswer">🔊 Hear answer</button><button class="btn" data-act="retry">Try again</button><button class="btn check" data-act="next">' + (lastItem() ? "Finish" : "Next") + " ›</button></div>";
    }
    pn.innerHTML = html;
  }
  function pick(a) { return a[TQ.rnd(a.length)]; }
  function lastItem() { return run.idx + 1 >= run.count; }

  function setMarks(nm) { history.push(marks.slice()); if (history.length > 40) history.shift(); marks = nm; updateBoard(); updatePanel(); }
  function tap(s, f) {
    if (screen !== "play" || !run) return;
    var midi = TQ.midiAt(s, f);
    if (run.phase !== "place") { A.pluck(midi); board.vibrate(s); return; }
    var set = TQ.SETS[run.item.set];
    if (set.indexOf(s) < 0) { A.pluck(midi, null, 0.4); board.vibrate(s); board.nudge(s); toast("Only the lit strings count for this shape"); return; }
    var nmk = marks.slice();
    if (nmk[s] === f) nmk[s] = null;
    else { nmk[s] = f; A.pluck(midi); board.vibrate(s); }
    setMarks(nmk);
  }
  function strumPlacement(frets, set, delay) {
    var midis = frets.map(function (f, i) { return TQ.midiAt(set[i], f); });
    setTimeout(function () { A.strum(midis); set.forEach(function (s, i) { setTimeout(function () { if (board) board.vibrate(s); }, i * 70); }); }, delay || 0);
  }
  function strumMarks() {
    var ms = [];
    marks.forEach(function (m, s) { if (m !== null) ms.push({ s: s, m: TQ.midiAt(s, m) }); });
    A.strum(ms.map(function (x) { return x.m; }));
    ms.forEach(function (x, i) { setTimeout(function () { if (board) board.vibrate(x.s); }, i * 70); });
  }
  function addPoints(g) { P.points += g; save(); }
  function bumpStreak() { streak++; if (streak > P.bestStreak) P.bestStreak = streak; save(); }

  function check() {
    if (run.phase !== "place") return;
    if (!marks.some(function (m) { return m !== null; })) return;
    var v = TQ.evaluate(marks, run.item), secs = (Date.now() - run.itemStart) / 1000;
    run.checkSecs = secs;
    strumMarks();
    var set = TQ.SETS[run.item.set];
    if (run.speed) {
      run.verdict = v; run.phase = "checked";
      SP.record(P.spell, run.item.chord, v.ok, run.peeked || run.revealed); save();
      var sg = run.peeked ? 50 - SP.PEEK_COST : 50;
      if (v.ok) { addPoints(sg); bumpStreak(); run.correct++; run.earned += sg; run.lastGain = "+" + sg + (run.peeked ? " (peeked)" : ""); setTimeout(function () { A.chime("ok"); }, 220); }
      else { streak = 0; run.lastGain = ""; setTimeout(function () { A.chime("miss"); }, 220); strumPlacement(v.best.frets, set, 650); }
      refreshAll(); board.flash(v.ok ? "ok" : "bad");
      var myIdx = run.idx;
      setTimeout(function () { if (run && run.speed && run.idx === myIdx && screen === "play") advance(); }, v.ok ? 650 : 1500);
      return;
    }
    if (!run.missed) { SP.record(P.spell, run.item.chord, v.ok, run.peeked || run.revealed); save(); }
    if (v.ok) {
      var gain = 0, lg = "Retry: practice only";
      if (!run.missed) {
        var sb = Math.max(0, Math.round(50 - 4 * secs)), stb = Math.min(streak * 10, 100), pk = run.peeked ? SP.PEEK_COST : 0;
        gain = 100 + sb + stb - pk; lg = "+" + gain + " (100 shape · " + sb + " speed · " + stb + " streak" + (pk ? " · −" + pk + " peek" : "") + ")";
        run.results.push({ ok: true, secs: secs }); bumpStreak(); addPoints(gain);
      }
      run.earned += gain; run.lastGain = lg; run.verdict = v; run.phase = "quiz"; run.prev = v.best;
      run.quiz = TQ.makeQuiz(run.item, v.best, run.part, keyIdx());
      setTimeout(function () { A.chime("ok"); }, 260);
      refreshAll(); board.flash("ok");
    } else {
      if (!run.missed) { run.results.push({ ok: false, secs: secs }); streak = 0; }
      run.missed = true; run.verdict = v; run.phase = "checked"; run.prev = v.best; run.lastGain = "";
      setTimeout(function () { A.chime("miss"); }, 260);
      strumPlacement(v.best.frets, set, 900);
      refreshAll(); board.flash("bad");
    }
  }
  function advance() {
    var ni = run.idx + 1;
    if (!run.speed && ni >= run.count) { finishLevel(); return; }
    run.idx = ni; run.item = TQ.makeItem(run.part, run.set, ni, keyIdx(), run.plan, run.prev, speedWide());
    run.missed = false; run.peeked = false; run.revealed = false; peekUntil = 0; run.phase = "place"; run.verdict = null; run.quiz = null; run.itemStart = Date.now(); run.lastGain = "";
    marks = emptyMarks(); history = [];
    refreshAll();
  }
  function retry() { run.phase = "place"; run.verdict = null; marks = emptyMarks(); history = []; run.itemStart = Date.now(); refreshAll(); }
  function finishLevel() {
    var firstOk = run.results.filter(function (x) { return x.ok; }).length, acc = firstOk / run.count;
    var avg = run.results.reduce(function (s, x) { return s + x.secs; }, 0) / Math.max(1, run.results.length);
    var stars = 1 + (acc >= 0.8 ? 1 : 0) + (avg <= run.par ? 1 : 0);
    var kid = keyDef().id, id = kid + "|p" + run.part + "s" + run.set, prev = P.stars[id] || 0, was = KP.keyCleared(P.stars, kid);
    P.stars[id] = Math.max(prev, stars);
    var kc = null;
    if (!was && KP.keyCleared(P.stars, kid)) { kc = { from: kid, to: KP.nextKey(P.stars, kid) }; if (kc.to) P.keyId = kc.to; }
    save();
    summary = { kind: "level", stars: stars, acc: acc, avg: avg, earned: run.earned, prevStars: prev, part: run.part, set: run.set, par: run.par, keyCleared: kc };
    go("result");
  }
  function finishSpeed() {
    if (screen !== "play" || !run || !run.speed) return;
    var kid = keyDef().id, best = P.speed[kid] || 0;
    P.speed[kid] = Math.max(best, run.correct); save();
    summary = { kind: "speed", score: run.correct, best: best, earned: run.earned, part: 0, set: 0 };
    go("result");
  }

  function renderResult() {
    var s = summary, html = '<div class="result"><div class="rcard">';
    if (s.kind === "level") {
      var nl = TQ.LEVELS[TQ.LEVELS.findIndex(function (l) { return l.part === s.part && l.set === s.set; }) + 1];
      var nextOpen = nl && unlocked(nl.part, nl.set);
      html += '<div class="rk">Part ' + s.part + " · " + TQ.PARTS[s.part - 1].title + " · " + TQ.SET_SHORT[s.set] + "</div><h2>Level cleared</h2>" +
        '<div class="bigstars">' + [0, 1, 2].map(function (i) { return '<span class="bs' + (i < s.stars ? " got" : "") + '" style="animation-delay:' + (0.35 + i * 0.35) + 's">★</span>'; }).join("") + "</div>" +
        '<div class="rstats">' + stat("Right first time", Math.round(s.acc * 100) + "%") + stat("Avg per shape", s.avg.toFixed(1) + "s / " + s.par + "s") + stat("Points", "+" + s.earned) + "</div>" +
        '<p class="muted small">★ finish · ★ 80%+ right first time · ★ beat ' + s.par + "s per shape" + (s.stars > s.prevStars && s.prevStars > 0 ? " · <b>New best!</b>" : "") + "</p>" +
        (s.keyCleared ? keyClearedHtml(s.keyCleared) : '<div class="ractions">' + (nextOpen ? '<button class="btn check" data-act="start" data-part="' + nl.part + '" data-set="' + nl.set + '">Next level ›</button>' : "") +
        '<button class="btn" data-act="start" data-part="' + s.part + '" data-set="' + s.set + '">Play again</button><button class="btn" data-act="levels">Levels</button><button class="btn" data-act="home">Home</button></div>');
      var lvN = TQ.LEVELS.findIndex(function (l) { return l.part === s.part && l.set === s.set; }) + 1, jt = J.track(PART_TRACK[s.part]);
      html += '<div class="apply"><div><b>Congrats on Level ' + lvN + ' — now let\'s apply it.</b><span>Jam ' + esc(jt.title) + " on " + TQ.SET_SHORT[s.set] + ' with a band, with your shapes lit up as the chords change.</span></div><button class="btn check" data-act="jamstart" data-track="' + jt.id + '" data-set="' + s.set + '">🎸 Apply it</button></div>';

    } else {
      var nb = s.score > s.best;
      html += '<div class="rk">Speed Round · ' + esc(keyDef().label) + '</div><h2>' + (nb ? "New best!" : "Time!") + '</h2><div class="bignum">' + s.score + '<small>shapes</small></div>' +
        '<p class="muted">' + (nb ? "Previous best: " + s.best : "Best: " + Math.max(s.best, s.score)) + " · +" + s.earned + " points</p>" +
        '<div class="ractions"><button class="btn check" data-act="speed">Go again</button><button class="btn" data-act="home">Home</button></div>';
    }
    html += "</div></div>";
    app.innerHTML = html;
    var big = s.kind === "level" ? s.stars : (s.score > s.best ? 3 : 1);
    A.chime("fanfare");
    if (s.kind === "level") for (var i = 0; i < s.stars; i++) (function (i) { setTimeout(function () { A.chime("star"); }, 450 + i * 350); })(i);
    window.TQConfetti(s.keyCleared ? 320 : big >= 3 ? 220 : big === 2 ? 140 : 80);
    if (s.keyCleared && s.keyCleared.to) { var kc = s.keyCleared; if (P.settings.intros !== false) setTimeout(function () { if (screen === "result" && summary === s) openKeyIntro(kc.to, kc.from); }, 1600); }
  }
  function keyClearedHtml(kc) {
    var f = KP.def(kc.from).label, t = kc.to ? KP.def(kc.to).label : null, done = KP.PATH.filter(function (k) { return KP.keyCleared(P.stars, k); }).length;
    return '<div class="keyclear"><div class="kcbig">🔑 Key cleared!</div><p>All 16 levels in <b>' + esc(f) + "</b> done · " + done + " of 12 keys.</p>" +
      (t ? "<p>Next up: <b>" + esc(t) + "</b>. You're there now.</p>" : "<p><b>That's all 12 keys.</b> You can find every major-key triad on every string set. Pick any key to keep your stars up.</p>") + "</div>" +
      '<div class="ractions">' + (t ? '<button class="btn check" data-act="keyIntro" data-v="' + kc.to + '" data-from="' + kc.from + '">Meet ' + esc(t) + " ›</button>" : "") +
      '<button class="btn" data-act="levels">Levels</button><button class="btn" data-act="home">Home</button></div>';
  }
  function openKeyIntro(to, from) {
    if (document.getElementById("intro")) return;
    openIntro(IN.forKey(to, from), function () { P.keyId = to; save(); start(1, 0); });
  }


  /* ---------- Jam: play-along backing tracks ---------- */
  var J = window.TQJamData, Jam = window.TQJam;
  var jam = { sched: null, cur: 0, playing: false, counting: 0, dots: [], mixer: false, loadMsg: "" };
  var PART_TRACK = { 1: "p1", 2: "p2", 3: "p3a", 4: "p4a" };
  function jamTrackOpen(t) {
    if (t.part === 0 || P.practice) return true;
    return [0, 1, 2, 3].some(function (s) { return jamSetOpen(t, s); });
  }
  function jamSetOpen(t, s) { return t.part === 0 || P.practice || anyKey(function (k) { return starsOf(k, "p" + t.part + "s" + s) > 0; }); }
  function jamOpenCount() { return J.TRACKS.filter(jamTrackOpen).length; }
  function jamKeyId(t) {
    if (P.jam.key && (keyOpen(P.jam.key) || P.jam.key === t.key)) return P.jam.key;
    return t.key || P.keyId;
  }
  function jamMode(t) { return P.jam.mode === null || P.jam.mode === undefined ? t.shape : P.jam.mode; }
  function jamStyle(t) { return P.jam.style || t.style; }
  function jamBpm(t) { return P.jam.bpm || t.bpm; }
  function jamPent(t) { return P.jam.ovPent === null || P.jam.ovPent === undefined ? !!t.pent : P.jam.ovPent; }
  function jamBuild() {
    var t = J.track(P.jam.track);
    if (!jamTrackOpen(t)) { t = J.TRACKS[0]; P.jam.track = t.id; }
    if (!jamSetOpen(t, P.jam.set)) P.jam.set = [0, 1, 2, 3].filter(function (s) { return jamSetOpen(t, s); }).pop();
    jam.sched = J.build(t.id, J.keyIndex(jamKeyId(t)), P.jam.set, jamMode(t));
    return jam.sched;
  }
  function jamOpts() { var t = jam.sched.track; return { sched: jam.sched, style: jamStyle(t), bpm: jamBpm(t), countIn: P.jam.countIn, loop: P.jam.loop }; }
  function openJam(trackId, set) {
    if (trackId) { if (P.jam.track !== trackId) { P.jam.mode = null; P.jam.style = null; P.jam.bpm = null; P.jam.ovPent = null; P.jam.boxShift = 0; } P.jam.track = trackId; }
    if (set !== undefined && set !== null) P.jam.set = set;
    save(); go("jam");
  }
  function sel(id, val, opts) {
    return '<select id="' + id + '" class="jsel">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? " selected" : "") + (o[2] ? " disabled" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
  }
  function tog(id, on, label) { return '<button class="tog' + (on ? " on" : "") + '" data-act="jamTog" data-id="' + id + '" aria-pressed="' + on + '">' + label + "</button>"; }

  function renderJam() {
    var s = jamBuild(), t = s.track, part = t.part ? "Part " + t.part + " · " + TQ.PARTS[t.part - 1].title : "play along";
    var trackOpts = J.TRACKS.map(function (x) { return [x.id, (x.part ? "Part " + x.part + " · " : "★ ") + x.title + (jamTrackOpen(x) ? "" : " (locked)"), !jamTrackOpen(x)]; });
    var keyOpts = KP.PATH.map(function (id) { var k = KP.def(id), op = keyOpen(id) || id === t.key; return [id, k.label + (op ? "" : " (locked)"), !op]; });
    app.innerHTML =
      '<div class="jam">' +
      '<header class="topbar"><button class="icon-btn" data-act="home" aria-label="Back to home">‹</button>' +
      '<button class="icon-btn info" data-act="intro" aria-label="How Jam works">ⓘ</button>' +
      '<div class="tb-title"><div class="tb-kicker">Jam · ' + esc(part) + "</div>" + sel("jTrack", t.id, trackOpts) + "</div>" +
      '<div class="jopts"><label class="jlab">Key ' + sel("jKey", jamKeyId(t), keyOpts) + "</label>" +
      '<div class="seg jset">' + [0, 1, 2, 3].map(function (i) { var op = jamSetOpen(t, i); return '<button data-act="jamSet" data-v="' + i + '" class="' + (i === P.jam.set ? "on" : "") + '"' + (op ? "" : " disabled") + ">" + TQ.SET_SHORT[i] + "</button>"; }).join("") + "</div></div></header>" +
      '<section class="jamhead"><div class="jnow" id="jNow"></div><div class="jlane" id="jLane"></div><div class="jbeats" id="jBeats"><i></i><i></i><i></i><i></i></div></section>' +
      '<p class="jtip" id="jTip"></p>' +
      '<section class="board-area" id="boardArea"></section>' +
      '<section class="panel transport" id="transport"></section>' +
      '<div class="mixer" id="mixer" hidden></div></div>';
    board = new Board(document.getElementById("boardArea"), { onTap: jamTap, getOrientation: function () { return P.settings.orientation; } });
    board.setActive(s.set);
    jam.cur = 0; jam.counting = 0;
    document.getElementById("jTrack").addEventListener("change", function (e) { jamStop(); openJam(e.target.value, null); });
    document.getElementById("jKey").addEventListener("change", function (e) { P.jam.key = e.target.value; save(); jamRebuild(); });
    renderTransport(); jamRefresh(); renderMixer();
    intro = null;
    if (P.settings.intros !== false && !P.seenJamIntro) openIntro();
    if (!Jam.ready) {
      jam.loadMsg = "Loading sounds…"; renderTransport();
      Jam.load(function (d, n) { jam.loadMsg = "Loading sounds " + d + "/" + n; var b = document.getElementById("jPlay"); if (b && screen === "jam") b.querySelector("small").textContent = jam.loadMsg; })
        .then(function () { jam.loadMsg = ""; if (Jam.failed.length) toast(Jam.failed.length + " sounds didn't load; using what's there"); if (screen === "jam") renderTransport(); })
        .catch(function () { jam.loadMsg = "Audio isn't available in this browser"; if (screen === "jam") renderTransport(); });
    }
  }
  function renderTransport() {
    var el = document.getElementById("transport"); if (!el) return;
    var t = jam.sched.track, bpm = jamBpm(t), st = jamStyle(t), mode = jamMode(t), ready = Jam.ready;
    el.classList.toggle("open", !!jam.more);
    el.innerHTML =
      '<div class="trow">' +
      '<button class="btn check jplay' + (jam.playing ? " on" : "") + '" id="jPlay" data-act="jamPlay"' + (ready ? "" : " disabled") + ">" + (jam.playing ? "■ Stop" : "▶ Play") + "<small>" + esc(jam.loadMsg || (jam.playing ? (P.jam.loop ? "looping" : "once through") : "")) + "</small></button>" +
      '<div class="tempo"><button class="icon-btn sm" data-act="jamBpm" data-v="-2" aria-label="Slower">−</button><input id="jTempo" type="range" min="70" max="120" step="1" value="' + bpm + '" aria-label="Tempo"><button class="icon-btn sm" data-act="jamBpm" data-v="2" aria-label="Faster">+</button><b id="jBpmVal">' + bpm + "</b><span class='muted small'>bpm</span></div>" +
      tog("countIn", P.jam.countIn, "Count-in") + tog("loop", P.jam.loop, "Loop") +
      '<button class="tog" data-act="jamMixer" aria-expanded="' + jam.mixer + '">🎚 Mixer</button><button class="tog onlyphone' + (jam.more ? " on" : "") + '" data-act="jamMore">Options</button></div>' +
      '<div class="trow more"><div class="seg">' + J.STYLES.map(function (x) { return '<button data-act="jamStyle" data-v="' + x.id + '" class="' + (x.id === st ? "on" : "") + '">' + x.label + "</button>"; }).join("") + "</div>" +
      '<div class="seg">' + J.SHAPE_MODES.map(function (m) { return '<button data-act="jamMode" data-v="' + m[0] + '" class="' + (String(m[0]) === String(mode) ? "on" : "") + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      '<div class="ovs">' + tog("ovTriad", P.jam.ovTriad, "Triad") + tog("ovNext", P.jam.ovNext, "Next") + tog("ovPent", jamPent(t), "Pentatonic") +
      (jamPent(t) ? '<button class="tog" data-act="jamBox" aria-label="Move the pentatonic box">Box ›</button>' : "") + tog("names", P.jam.names, "Names") + "</div></div>";
    var tr = document.getElementById("jTempo");
    tr.addEventListener("input", function () { setBpm(+tr.value, true); });
    tr.addEventListener("change", function () { setBpm(+tr.value); });
  }
  function setBpm(v, live) {
    v = Math.max(70, Math.min(120, Math.round(v)));
    P.jam.bpm = v; var b = document.getElementById("jBpmVal"); if (b) b.textContent = v;
    var tr = document.getElementById("jTempo"); if (tr && +tr.value !== v) tr.value = v;
    if (jam.playing) Jam.update({ bpm: v });
    if (!live) save();
  }
  function renderMixer() {
    var el = document.getElementById("mixer"); if (!el) return;
    el.hidden = !jam.mixer;
    var tp = document.getElementById("transport");
    if (tp) el.style.bottom = (tp.offsetHeight + 10) + "px";
    var m = P.jam.mix;
    function row(k, label) {
      var mk = "m" + k[0].toUpperCase() + k.slice(1);
      return '<div class="mrow"><b>' + label + '</b><input type="range" min="0" max="1" step="0.02" value="' + m[k] + '" data-mix="' + k + '" aria-label="' + label + ' volume"><button class="tog' + (m[mk] ? " on danger" : "") + '" data-act="jamMute" data-id="' + k + '">' + (m[mk] ? "Muted" : "Mute") + "</button></div>";
    }
    el.innerHTML = '<div class="mhead"><b>Mixer</b><button class="icon-btn sm" data-act="jamMixer" aria-label="Close mixer">×</button></div>' + row("drums", "Drums") + row("bass", "Bass") + row("gtr", "Chords");
    el.querySelectorAll("input[data-mix]").forEach(function (inp) {
      inp.addEventListener("input", function () { var k = inp.getAttribute("data-mix"); P.jam.mix[k] = +inp.value; Jam.set(k, +inp.value); });
      inp.addEventListener("change", save);
    });
  }
  function applyMix() {
    var m = P.jam.mix;
    ["drums", "bass", "gtr"].forEach(function (k) { Jam.set(k, m[k]); Jam.set("m" + k[0].toUpperCase() + k.slice(1), !!m["m" + k[0].toUpperCase() + k.slice(1)]); });
    Jam.set("out", P.settings.sound ? 0.9 * Math.max(0.05, P.settings.volume) / 0.8 : 0);
  }
  function jamRebuild() {
    var prevCur = jam.cur;
    jamBuild();
    if (jam.playing) Jam.update(jamOpts());
    jam.cur = Math.min(prevCur, jam.sched.items.length - 1);
    if (screen === "jam") { board.setActive(jam.sched.set); renderTransport(); jamRefresh(); }
  }
  function jamPlay() {
    if (jam.playing) { jamStop(); return; }
    if (!Jam.ready) return;
    A.unlock(); applyMix();
    if (!P.settings.sound) toast("Sound is off in Settings");
    jam.cur = 0; jam.counting = P.jam.countIn ? 4 : 0;
    jam.playing = Jam.play(jamOpts());
    renderTransport(); jamRefresh();
  }
  function jamStop() {
    Jam.stop(); jam.playing = false; jam.counting = 0;
    if (screen === "jam") { renderTransport(); jamRefresh(); }
  }
  Jam.on("ui", function (ev) { if (screen !== "jam") return; jam.counting = 0; jam.cur = ev.i; jamRefresh(true); });
  Jam.on("beat", function (ev) {
    if (screen !== "jam") return;
    var bs = document.querySelectorAll("#jBeats i");
    bs.forEach(function (b, i) { b.classList.toggle("on", i === ev.n); });
    var it = jam.sched.items[jam.cur], left = it.startBeat + it.beats - (Math.floor(it.startBeat / 4) * 4 + ev.n);
    var nx = document.getElementById("jNext"); if (nx) nx.classList.toggle("soon", left <= 1 && jam.sched.items.length > 1);
  });
  Jam.on("count", function (ev) { if (screen !== "jam") return; jam.counting = ev.n; jamRefresh(); });
  Jam.on("end", function () { jam.playing = false; jam.counting = 0; if (screen === "jam") { renderTransport(); jamRefresh(); } });

  /* Jam: current chord spelled (+ low-to-high order of the lit shape) and the next chord spelled */
  function jamSpellHtml(s, it, nx) {
    var now = Date.now(), peeking = (jam.peekUntil || 0) > now;
    var disp = SP.display(P.settings.notes, spellState(it.chord), { idleMs: Infinity, peek: peeking });
    var sp = SP.spell(it.chord, it.placement, s.setIdx), h = "";
    if (disp === "full") h += '<div class="spell full jsp">' + '<span class="sp-name">' + esc(sp.name) + " =</span>" + chipsHtml(sp.notes) +
      '<span class="sp-order">' + esc(TQ.INV_NAME[it.placement.inv] + " on " + sp.set) + ' <span class="lh">low → high</span> ' + chipsHtml(sp.order, true) + "</span></div>";
    else h += '<div class="spell none jsp"><span class="muted">' + esc(TQ.INV_NAME[it.placement.inv]) + " · " + esc(TQ.SET_SHORT[s.setIdx]) + '</span><button class="peek" data-act="peek">👁 Peek</button></div>';
    if (s.items.length > 1) {
      var ns = SP.spell(nx.chord), ndisp = SP.display(P.settings.notes, spellState(nx.chord), { idleMs: Infinity, peek: peeking });
      h += '<span class="jnext" id="jNext">Next: <b>' + esc(nx.chord.name) + "</b> " + esc(nx.roman) + (ndisp === "full" ? ' <span class="nsp">= ' + chipsHtml(ns.notes, true) + "</span>" : "") + "</span>";
    }
    return h;
  }
  function roleCls(r) { return r === "root" ? "jr" : r === "3rd" ? "j3" : r === "4th" ? "j4" : "j5"; }
  function jamDots() {
    var s = jam.sched, it = s.items[jam.cur], nx = s.items[(jam.cur + 1) % s.items.length], flat = s.key.flat, lab = P.jam.names, dots = [], taken = {};
    if (P.jam.ovTriad) it.placement.frets.forEach(function (f, i) {
      var str = s.set[i], r = it.chord.roles[it.placement.roles[i]];
      taken[str + "-" + f] = true;
      dots.push({ key: "t" + str + "-" + f, s: str, f: f, kind: "jt " + roleCls(r), label: lab ? TQ.nm(it.chord.tones[it.placement.roles[i]]) : "", role: shortRole(r) });
    });
    if (P.jam.ovNext && nx !== it) nx.placement.frets.forEach(function (f, i) {
      var str = s.set[i]; if (taken[str + "-" + f]) return;
      dots.push({ key: "n" + str + "-" + f, s: str, f: f, kind: "jn", label: lab ? TQ.nm(nx.chord.tones[nx.placement.roles[i]]) : "", role: "" });
    });
    if (jamPent(s.track)) {
      var box = J.pentBox(s, P.jam.boxShift || 0), pcs = J.pentPcs(s.keyIdx), seen = {};
      var tonePc = it.chord.tones.map(TQ.pcOf);
      box.notes.forEach(function (n) {
        var k = n.s + "-" + n.f; seen[k] = true; if (taken[k]) return;
        var ti = tonePc.indexOf(TQ.mod(TQ.OPEN[n.s] + n.f, 12));
        if (ti >= 0) dots.push({ key: "p" + k, s: n.s, f: n.f, kind: "jp tgt " + roleCls(it.chord.roles[ti]), label: lab ? TQ.nm(it.chord.tones[ti]) : "", role: shortRole(it.chord.roles[ti]) });
        else dots.push({ key: "p" + k, s: n.s, f: n.f, kind: "jp", label: lab ? TQ.noteName(n.s, n.f, null, flat) : "", role: "" });
      });
      // chord tones that sit inside the box's frets but outside the scale (e.g. A over the A chord in E pentatonic)
      for (var str = 0; str < 6; str++) for (var f = box.lo; f <= box.hi; f++) {
        var k2 = str + "-" + f; if (seen[k2] || taken[k2]) continue;
        var ti2 = tonePc.indexOf(TQ.mod(TQ.OPEN[str] + f, 12));
        if (ti2 >= 0 && pcs.indexOf(tonePc[ti2]) < 0) dots.push({ key: "p" + k2, s: str, f: f, kind: "jp tgt out " + roleCls(it.chord.roles[ti2]), label: lab ? TQ.nm(it.chord.tones[ti2]) : "", role: shortRole(it.chord.roles[ti2]) });
      }
    }
    return dots;
  }
  function jamRefresh(changed) {
    if (screen !== "jam" || !jam.sched) return;
    var s = jam.sched, it = s.items[jam.cur], nx = s.items[(jam.cur + 1) % s.items.length], t = s.track;
    var now = document.getElementById("jNow");
    now.innerHTML = jam.counting
      ? '<div class="jcount">' + jam.counting + '</div><div class="jmeta">Count-in…<br><span class="muted">First chord: ' + esc(s.items[0].chord.name) + "</span></div>"
      : '<div class="jchord' + (changed ? " pop" : "") + '">' + esc(it.chord.name) + "<small>" + esc(it.roman) + '</small></div><div class="jmeta">' + jamSpellHtml(s, it, nx) + "</div>";
    document.getElementById("jLane").innerHTML = s.items.map(function (x, i) { return '<span class="jc' + (i === jam.cur ? " on" : "") + '" style="flex:' + x.beats + '"><b>' + esc(x.chord.name) + "</b><small>" + esc(x.roman) + "</small></span>"; }).join("");
    var tip = t.tip;
    if (jamPent(t)) tip = TQ.nm(TQ.diatonic(s.key.root)[5].root) + "m pentatonic = " + TQ.nm(s.key.root) + " major pentatonic. Ringed notes are the chord tones to land on. " + (t.id === "kevin" ? "" : tip);
    document.getElementById("jTip").textContent = tip;
    if (!jam.playing) document.querySelectorAll("#jBeats i").forEach(function (b) { b.classList.remove("on"); });
    jam.dots = jamDots(); board.setDots(jam.dots);
  }
  function jamTap(s, f) { Jam.tapNote(TQ.midiAt(s, f)); board.vibrate(s); }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    if (act.charAt(0) === "n" && act.length > 1 && act.charAt(1) === act.charAt(1).toUpperCase() && window.TQNotesUI) { window.TQNotesUI.act(act, el); return; }
    switch (act) {
      case "home": go("home"); break;
      case "levels": go("levels"); break;
      case "settings": go("settings"); break;
      case "learn": go("learn"); break;
      case "jam": openJam(null, null); break;
      case "jamstart": openJam(el.getAttribute("data-track"), +el.getAttribute("data-set")); break;
      case "jamPlay": jamPlay(); break;
      case "intro": openIntro(); break;
      case "notes": go("notes"); break;
      case "pickKey": var pk = el.getAttribute("data-v"); if (keyOpen(pk)) { P.keyId = pk; save(); renderLevels(); } break;
      case "keyIntro": openKeyIntro(el.getAttribute("data-v"), el.getAttribute("data-from")); break;
      case "introGo": closeIntro(); break;
      case "peek": if (!el.getAttribute("data-hold") || !holdPeeked) peek(); holdPeeked = false; break;
      case "unpeek": unpeek(); break;
      case "jamBpm": setBpm(jamBpm(jam.sched.track) + +el.getAttribute("data-v")); break;
      case "jamSet": P.jam.set = +el.getAttribute("data-v"); save(); jamRebuild(); break;
      case "jamStyle": P.jam.style = el.getAttribute("data-v"); save(); if (jam.playing) Jam.update({ style: P.jam.style }); renderTransport(); break;
      case "jamMode": var mv = el.getAttribute("data-v"); P.jam.mode = mv === "lead" ? "lead" : +mv; save(); jamRebuild(); break;
      case "jamBox": P.jam.boxShift = (P.jam.boxShift || 0) + 1; save(); jamRefresh(); break;
      case "jamMore": jam.more = !jam.more; renderTransport(); break;
      case "jamMixer": jam.mixer = !jam.mixer; renderMixer(); renderTransport(); break;
      case "jamMute": var mk = "m" + el.getAttribute("data-id")[0].toUpperCase() + el.getAttribute("data-id").slice(1); P.jam.mix[mk] = !P.jam.mix[mk]; save(); Jam.set(mk, P.jam.mix[mk]); renderMixer(); break;
      case "jamTog":
        var tid = el.getAttribute("data-id");
        if (tid === "ovPent") P.jam.ovPent = !jamPent(jam.sched.track); else P.jam[tid] = !P.jam[tid];
        save();
        if (tid === "loop" && jam.playing) Jam.update({ loop: P.jam.loop });
        renderTransport(); jamRefresh(); break;
      case "continue": var nu = nextUp(); if (nu) start(nu.part, nu.set); break;
      case "speed": if (speedOpen()) start(0, 0); break;
      case "start": start(+el.getAttribute("data-part"), +el.getAttribute("data-set")); break;
      case "quit": run = null; go("home"); break;
      case "undo": if (history.length) { marks = history.pop(); updateBoard(); updatePanel(); } break;
      case "clear": setMarks(emptyMarks()); break;
      case "hear": var p = run.item.valid[0]; strumPlacement(p.frets, TQ.SETS[run.item.set], 0); break;
      case "hearAnswer": strumPlacement(run.verdict.best.frets, TQ.SETS[run.item.set], 0); break;
      case "replay": strumPlacement(run.verdict.best.frets, TQ.SETS[run.item.set], 0); break;
      case "check": check(); break;
      case "next": advance(); break;
      case "retry": retry(); break;
      case "pick":
        if (!run.quiz || run.quiz.picked !== null) break;
        var i = +el.getAttribute("data-i"); run.quiz.picked = i;
        if (i === run.quiz.answer) { addPoints(25); run.earned += 25; A.chime("star"); } else A.chime("miss");
        updateTop(); updateBoard(); updatePanel(); break;
      case "toggle":
        var id = el.getAttribute("data-id");
        if (id === "practice") { P.practice = !P.practice; if (!P.practice && !keyOpen(P.keyId)) P.keyId = KP.current(P.stars, false); }
        else if (id === "intros") P.settings.intros = P.settings.intros === false;
        else { P.settings[id] = !P.settings[id]; if (id === "sound") { A.setMuted(!P.settings.sound); if (P.settings.sound) A.chime("ok"); } }
        save(); renderSettings(); break;
      case "seg":
        var sid = el.getAttribute("data-id"), val = el.getAttribute("data-v");
        P.settings[sid] = sid === "metronome" ? +val : val; save(); renderSettings(); break;
      case "reset":
        if (window.confirm("Reset all stars, points, streaks and note stats (the heatmap) on this device?")) { var keep = P.settings; P = fresh(); P.settings = keep; streak = 0; save(); go("home"); }
        break;
    }
  });
  // press-and-hold on the collapsed strip reveals it right away
  var holdPeeked = false;
  document.addEventListener("pointerdown", function (e) { var t = e.target.closest ? e.target.closest('[data-hold="1"]') : null; if (t) { holdPeeked = true; peek(); } }, true);
  // iOS: audio can only start inside a user gesture
  function unlockAudio() { A.unlock(); }
  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("touchend", unlockAudio, true);
  document.addEventListener("keydown", function (e) {
    if (document.getElementById("intro")) { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); closeIntro(); } return; }
    if (screen.indexOf("notes") === 0 && window.TQNotesUI) { window.TQNotesUI.key(e); return; }
    if (screen !== "play" || !run) { if (e.key === "Escape" && screen !== "home") go("home"); return; }
    if (e.key === "Enter") { e.preventDefault(); if (run.phase === "place") check(); else if (!run.speed && (run.phase === "checked" || run.quiz)) advance(); }
    else if (e.key === "Backspace" && run.phase === "place" && history.length) { e.preventDefault(); marks = history.pop(); updateBoard(); updatePanel(); }
    else if (e.key === "Escape") { run = null; go("home"); }
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden && jam.playing) { jamStop(); jam.pausedBg = true; } else if (!document.hidden && jam.pausedBg) { jam.pausedBg = false; if (screen === "jam") toast("Paused while the app was in the background"); } });
  window.addEventListener("pagehide", function () { if (jam.playing) jamStop(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) A.metroStop(); else if (screen === "play" && run && run.speed && P.settings.metronome) A.metroStart(P.settings.metronome); });

  // test hook (used by the automated tests only)
  window.TQApp = { P: function () { return P; }, save: save, go: go, esc: esc, toast: toast, openCard: openIntro, closeCard: closeIntro, keyIdx: keyIdx, keyLabel: function () { return keyDef().label; },
    A: A, Board: Board, orientation: function () { return P.settings.orientation; }, introsOn: function () { return P.settings.intros !== false; }, screen: function () { return screen; } };
  window.__tq = { get run() { return run; }, get marks() { return marks; }, get screen() { return screen; }, tap: tap, check: check, start: start, go: go, P: function () { return P; }, jam: jam, openJam: openJam, jamTap: jamTap, peek: peek, get streak() { return streak; } };

  go("home");
})();
