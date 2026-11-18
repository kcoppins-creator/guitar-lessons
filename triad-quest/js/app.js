/* Triad Quest - app shell: screens, game flow, scoring, progress. */
(function () {
  "use strict";
  var TQ = window.TQ, A = window.TQAudio, Board = window.TQBoard;
  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");

  /* ---------- progress (localStorage is optional; every access is guarded) ---------- */
  var STORE = "triad-quest-app-v1";
  var DEFAULT_SETTINGS = { sound: true, volume: 0.8, names: false, metronome: 0, orientation: "auto" };
  function fresh() { return { stars: {}, points: 0, bestStreak: 0, speed: {}, practice: false, keyId: "G", last: null, settings: Object.assign({}, DEFAULT_SETTINGS) }; }
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
  function allG() { return [1, 2, 3, 4].every(function (p) { return partCleared("G", p); }); }
  function freeplay() { return P.practice || P.keyId !== "G"; }
  function unlocked(part, set) {
    if (freeplay()) return true;
    if (set > 0) return starsOf("G", "p" + part + "s" + (set - 1)) > 0;
    return part === 1 || partCleared("G", part - 1);
  }
  function keyPickerOpen() { return allG() || P.practice; }
  function speedOpen() { return freeplay() || partCleared("G", 1); }
  function speedWide() { return freeplay() || partCleared(P.keyId, 3); }
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
      html += '<label class="keypick">Key <select id="keySel">' + TQ.KEYS.map(function (k) { return '<option value="' + k.id + '"' + (k.id === P.keyId ? " selected" : "") + ">" + k.label + "</option>"; }).join("") + "</select></label>";
    } else html += '<span class="muted small">Key of G · clear all 16 levels to unlock all 12 keys</span>';
    html += "</header><div class='parts'>";
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
    if (sel) sel.addEventListener("change", function () { P.keyId = sel.value; save(); renderLevels(); });
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
      '<div class="setrow col"><span><b>Board</b><small>Auto: across on iPad, upright on narrow phones</small></span>' + seg("orientation", s.orientation, [["auto", "Auto"], ["across", "Across"], ["upright", "Upright"]]) + "</div>" +
      '<div class="setrow col"><span><b>Metronome in the speed round</b><small>A click to keep you moving (beats per minute)</small></span>' + seg("metronome", s.metronome, [[0, "Off"], [60, "60"], [80, "80"], [100, "100"]]) + "</div>" +
      sw("practice", P.practice, "Practice mode", "Unlock every level and the key picker") +
      '<button class="setrow danger" data-act="reset"><span><b>Reset progress</b><small>Clears stars, points and streaks on this device</small></span></button>' +
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
      ["Unlocks", "Each level opens the next string set; a cleared part opens the next part; all 16 in G opens all 12 keys."]
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
      itemStart: now, runStart: now, missed: false, phase: "place", verdict: null, quiz: null, lastGain: "", checkSecs: 0 };
  }
  function start(part, set) {
    run = newRun(part, set); marks = emptyMarks(); history = [];
    if (part > 0) { P.last = { part: part, set: set }; save(); }
    go("play");
  }

  function renderPlay() {
    app.innerHTML =
      '<div class="play">' +
      '<header class="topbar"><button class="icon-btn" data-act="quit" aria-label="Back to home">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker" id="kicker"></div><div class="progress" id="progress"></div></div>' +
      '<div class="chips"><span class="chip" id="chipTime"></span><span class="chip streak" id="chipStreak"></span><span class="chip pts" id="chipPts"></span></div></header>' +
      '<section class="prompt" id="prompt"></section>' +
      '<section class="board-area" id="boardArea"></section>' +
      '<section class="panel" id="panel"></section></div>';
    board = new Board(document.getElementById("boardArea"), { onTap: tap, getOrientation: function () { return P.settings.orientation; } });
    if (run.speed && P.settings.metronome) A.metroStart(P.settings.metronome);
    refreshAll();
    tick = setInterval(onTick, 250);
  }
  function refreshAll() { updateTop(); updatePrompt(); updateBoard(); updatePanel(); }

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
    if (!run) return;
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
      if (v.ok) { addPoints(50); bumpStreak(); run.correct++; run.earned += 50; run.lastGain = "+50"; setTimeout(function () { A.chime("ok"); }, 220); }
      else { streak = 0; run.lastGain = ""; setTimeout(function () { A.chime("miss"); }, 220); strumPlacement(v.best.frets, set, 650); }
      refreshAll(); board.flash(v.ok ? "ok" : "bad");
      var myIdx = run.idx;
      setTimeout(function () { if (run && run.speed && run.idx === myIdx && screen === "play") advance(); }, v.ok ? 650 : 1500);
      return;
    }
    if (v.ok) {
      var gain = 0, lg = "Retry: practice only";
      if (!run.missed) {
        var sb = Math.max(0, Math.round(50 - 4 * secs)), stb = Math.min(streak * 10, 100);
        gain = 100 + sb + stb; lg = "+" + gain + " (100 shape · " + sb + " speed · " + stb + " streak)";
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
    run.missed = false; run.phase = "place"; run.verdict = null; run.quiz = null; run.itemStart = Date.now(); run.lastGain = "";
    marks = emptyMarks(); history = [];
    refreshAll();
  }
  function retry() { run.phase = "place"; run.verdict = null; marks = emptyMarks(); history = []; run.itemStart = Date.now(); refreshAll(); }
  function finishLevel() {
    var firstOk = run.results.filter(function (x) { return x.ok; }).length, acc = firstOk / run.count;
    var avg = run.results.reduce(function (s, x) { return s + x.secs; }, 0) / Math.max(1, run.results.length);
    var stars = 1 + (acc >= 0.8 ? 1 : 0) + (avg <= run.par ? 1 : 0);
    var id = keyDef().id + "|p" + run.part + "s" + run.set, prev = P.stars[id] || 0;
    P.stars[id] = Math.max(prev, stars); save();
    summary = { kind: "level", stars: stars, acc: acc, avg: avg, earned: run.earned, prevStars: prev, part: run.part, set: run.set, par: run.par };
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
        '<div class="ractions">' + (nextOpen ? '<button class="btn check" data-act="start" data-part="' + nl.part + '" data-set="' + nl.set + '">Next level ›</button>' : "") +
        '<button class="btn" data-act="start" data-part="' + s.part + '" data-set="' + s.set + '">Play again</button><button class="btn" data-act="levels">Levels</button><button class="btn" data-act="home">Home</button></div>';
      if (!nl && allG()) html += '<p class="infonote">All 16 levels cleared in G. The key picker on the Levels screen now has all 12 keys.</p>';
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
    window.TQConfetti(big >= 3 ? 220 : big === 2 ? 140 : 80);
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    switch (act) {
      case "home": go("home"); break;
      case "levels": go("levels"); break;
      case "settings": go("settings"); break;
      case "learn": go("learn"); break;
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
        if (id === "practice") { P.practice = !P.practice; if (!P.practice && !allG()) P.keyId = "G"; }
        else { P.settings[id] = !P.settings[id]; if (id === "sound") { A.setMuted(!P.settings.sound); if (P.settings.sound) A.chime("ok"); } }
        save(); renderSettings(); break;
      case "seg":
        var sid = el.getAttribute("data-id"), val = el.getAttribute("data-v");
        P.settings[sid] = sid === "metronome" ? +val : val; save(); renderSettings(); break;
      case "reset":
        if (window.confirm("Reset all stars, points and streaks on this device?")) { var keep = P.settings; P = fresh(); P.settings = keep; streak = 0; save(); go("home"); }
        break;
    }
  });
  // iOS: audio can only start inside a user gesture
  function unlockAudio() { A.unlock(); }
  document.addEventListener("pointerdown", unlockAudio, true);
  document.addEventListener("touchend", unlockAudio, true);
  document.addEventListener("keydown", function (e) {
    if (screen !== "play" || !run) { if (e.key === "Escape" && screen !== "home") go("home"); return; }
    if (e.key === "Enter") { e.preventDefault(); if (run.phase === "place") check(); else if (!run.speed && (run.phase === "checked" || run.quiz)) advance(); }
    else if (e.key === "Backspace" && run.phase === "place" && history.length) { e.preventDefault(); marks = history.pop(); updateBoard(); updatePanel(); }
    else if (e.key === "Escape") { run = null; go("home"); }
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) A.metroStop(); else if (screen === "play" && run && run.speed && P.settings.metronome) A.metroStart(P.settings.metronome); });

  // test hook (used by the automated tests only)
  window.__tq = { get run() { return run; }, get marks() { return marks; }, get screen() { return screen; }, tap: tap, check: check, start: start, go: go, P: function () { return P; } };

  go("home");
})();
