/* Triad Quest - Notes mode screens: Note Path home, Find the Note / Name That Note quizzes, weak-note drill,
   heatmap, Mic mode and the chord-tone tie-in. Uses js/notes.js (logic), js/pitch.js (mic) and the app host (TQApp). */
(function (root) {
  "use strict";
  var TQ = root.TQ, N = root.TQNotes, PI = root.TQPitch;
  var H = function () { return root.TQApp; };
  var view = null, board = null, quiz = null, timers = [], heatWhat = "acc", heatSel = null, keyChord = 0;
  var mic = { listener: null, on: false, err: null, mode: "quiz", stab: null, target: null, startAt: 0, last: null, recorded: false, wrongShown: null, lock: 0 };
  var sel = null;   // selected phase index on the Notes home

  function app() { return document.getElementById("app"); }
  function st() { return H().P().notes; }
  function esc(x) { return H().esc(x); }
  function practice() { var P = H().P(); return !!(P.practice || (P.settings && P.settings.notesUnlockAll)); }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function mkBoard(el) { var B = H().Board; board = new B(el, { onTap: onTap, getOrientation: H().orientation }); board.el.classList.add("nboard"); return board; }
  function masteredCount() { var s = st(); return N.allCells().filter(function (c) { return N.mastered(N.stat(s, c.key)); }).length; }
  function homeLine() { try { var s = st(), i = N.currentPhase(s); return masteredCount() + "/78 mastered · Phase " + (i + 1) + ": " + N.PHASES[i].title; } catch (e) { return "Note Path, drills and a heatmap"; } }
  function where(c) { return N.names(c.pc)[0] + " (" + N.SNAME[c.s] + (c.f ? " " + c.f : " open") + ")"; }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function sname(s) { return N.SNAME[s] + " string"; }
  function label(pc) { var n = N.names(pc); return n.length > 1 ? n[0] + "<small>" + n[1] + "</small>" : n[0]; }

  /* ---------- screens ---------- */
  function render(name) {
    view = name; var a = app();
    a.classList.add("screen-notesmode");
    if (name === "notes") renderHome();
    else if (name === "notes-quiz") renderQuiz();
    else if (name === "notes-result") renderResult();
    else if (name === "notes-heat") renderHeat();
    else if (name === "notes-mic") renderMic();
    else if (name === "notes-key") renderKey();
  }
  function teardown() {
    timers.forEach(clearTimeout); timers = [];
    if (board) { board.destroy(); board = null; }
    stopMic();
    var a = app(); if (a) a.classList.remove("screen-notesmode", "screen-play");
  }
  function go(name) { H().go(name); }

  function renderHome() {
    var s = st(), cur = N.currentPhase(s); if (sel === null || !N.phaseUnlocked(s, sel, practice())) sel = cur;
    var drill = N.drillCells(s, practice()), weak = N.weakest(s, drill, 4);
    var p = N.PHASES[sel], ps = s.phases[p.id];
    var h = '<div class="page nhome"><header class="pagebar"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><h2>Notes</h2><span class="muted small">' + masteredCount() + "/78 notes mastered</span></header>" +
      '<div class="ncols"><section class="npath"><div class="nph-head"><b>Note Path</b><span class="muted small">Pass a phase with ' + Math.round(N.PASS_ACC * 100) + "% right and a quick typical answer time" + (H().P().settings.notesUnlockAll ? " · all phases unlocked in Settings" : ". Already know them? Test out.") + "</span></div><ol class=\"nphases\">" +
      N.PHASES.map(function (q, i) {
        var o = s.phases[q.id], open = N.phaseUnlocked(s, i, practice()), state = o && o.passed ? "passed" : i === cur ? "current" : open ? "open" : "locked";
        if (!open) return '<li class="nlock"><div class="nph locked"><span class="nn">🔒</span><span class="nt">' + esc(q.title) + '<small class="nwhy2">' + esc(N.lockReason(s, i, practice())) + '</small></span><button class="ntest" data-act="nTestOut" data-i="' + i + '" aria-label="Test out of ' + esc(q.title) + '">Test out</button></div></li>';
        return '<li><button class="nph ' + state + (i === sel ? " sel" : "") + '" data-act="nPhase" data-i="' + i + '"><span class="nn">' + (state === "passed" ? "✓" : i + 1) + '</span><span class="nt">' + esc(q.title) + (o && o.testedOut && !o.rounds ? '<small class="nwhy2">Tested out</small>' : "") + "</span><span class=\"nb\">" + (o && o.rounds ? Math.round(o.bestAcc * 100) + "%" + (o.bestMs ? " · " + (o.bestMs / 1000).toFixed(1) + " s" : "") : "") + "</span></button></li>";
      }).join("") + "</ol>" +
      '<div class="nstart"><div class="muted small">Phase ' + (sel + 1) + ": " + esc(p.title) + " · " + p.round + " questions · target " + Math.round(N.PASS_ACC * 100) + "% and " + (p.targetMs / 1000) + " s" + (ps && ps.passed ? " · passed ✓" : "") + ' <button class="linkbtn" data-act="nIntro" data-i="' + sel + '">ⓘ What\u2019s in it</button></div>' +
      '<div class="nbtns"><button class="btn check" data-act="nStart" data-type="find">Find the Note</button><button class="btn check" data-act="nStart" data-type="name">Name That Note</button><button class="btn" data-act="nStart" data-type="mix">Mixed</button></div></div></section>' +
      '<section class="nside"><button class="big primary" data-act="nDrill"><span class="bt">Weak-note drill</span><span class="bs">' +
      (weak.length ? "Your weakest: " + weak.map(where).join(", ") : "Mostly your weakest and slowest notes, with mastered ones mixed in") + "</span></button>" +
      '<button class="big" data-act="nHeat"><span class="bt">Heatmap</span><span class="bs">Accuracy and answer time for every note</span></button>' +
      '<button class="big" data-act="nMic"><span class="bt">🎤 Mic mode</span><span class="bs">Play the note on your guitar and the app listens</span></button>' +
      '<button class="big" data-act="nKey"><span class="bt">Chord tones in ' + esc(H().keyLabel()) + '</span><span class="bs">Where your Triad Quest key\u2019s chord notes sit on the neck</span></button></section></div></div>';
    app().innerHTML = h;
  }

  /* ---------- quiz (path round or drill) ---------- */
  function startRound(cfg) {
    var s = st(), cells, total;
    if (cfg.mode === "drill") { cells = N.drillCells(s, practice()); total = 20; }
    else if (cfg.mode === "test") { cells = N.testCells(cfg.phase); total = N.TEST_N; }
    else { var p = N.PHASES[cfg.phase]; cells = N.phaseCells(p); total = p.round; }
    quiz = { cfg: cfg, cells: cells, total: total, bag: [], i: 0, answers: [], hist: [], queue: [], streak: 0, kinds: [], target: null, kind: null, answered: false, t0: 0, why: "" };
    go("notes-quiz");
    var pid = cfg.mode === "path" ? N.PHASES[cfg.phase].id : null;
    if (pid && H().introsOn() && !s.seen[pid]) { s.seen[pid] = 1; H().save(); openPhaseCard(cfg.phase); }
  }
  function openPhaseCard(i) {
    var paused = now();
    H().openCard(N.phaseIntro(N.PHASES[i].id), function () { if (quiz && !quiz.answered) quiz.t0 += now() - paused; });
  }
  function phaseOf() { return quiz.cfg.mode === "path" ? N.PHASES[quiz.cfg.phase] : quiz.cfg.mode === "test" ? N.testPhase(quiz.cfg.phase) : { strings: [0, 1, 2, 3, 4, 5], frets: [0, 12], kind: "all", targetMs: 6000 }; }
  function renderQuiz() {
    app().classList.add("screen-play");
    var c = quiz.cfg, kick = c.mode === "drill" ? "Weak-note drill" : c.mode === "test" ? "Test out · <b>" + esc(N.PHASES[c.phase].title) + "</b> + earlier phases · need 90% and " + (N.PHASES[c.phase].targetMs / 1000) + " s" : "Note Path · Phase " + (c.phase + 1) + " · <b>" + esc(N.PHASES[c.phase].title) + "</b>";
    app().innerHTML = '<div class="play nplay"><header class="topbar"><button class="icon-btn" data-act="nHome" aria-label="Back to Notes">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker">' + kick + '</div><div class="progress" id="nProg"></div></div>' +
      (c.mode === "path" ? '<button class="icon-btn info" data-act="nIntro" data-i="' + c.phase + '" aria-label="What this phase teaches">ⓘ</button>' : "") +
      '<div class="chips"><span class="chip" id="nTime">0.0s</span><span class="chip streak" id="nStreak">🔥 0</span><span class="chip" id="nScore">0/0</span></div></header>' +
      '<section class="prompt" id="nPrompt"></section><section class="board-area" id="nBoard"></section><section class="panel" id="nPanel"></section></div>';
    mkBoard(document.getElementById("nBoard"));
    nextQ();
    tick();
  }
  function tick() {
    if (view !== "notes-quiz" || !quiz) return;
    var t = document.getElementById("nTime");
    if (t && !quiz.answered) t.textContent = ((now() - quiz.t0) / 1000).toFixed(1) + "s";
    later(tick, 100);
  }
  function progress() {
    var el = document.getElementById("nProg"); if (!el) return;
    el.innerHTML = '<div class="timebar"><i style="width:' + Math.round(quiz.i / quiz.total * 100) + '%"></i></div>';
    var ok = quiz.answers.filter(function (a) { return a.ok; }).length;
    document.getElementById("nScore").textContent = ok + "/" + quiz.answers.length;
    document.getElementById("nStreak").textContent = "🔥 " + quiz.streak;
  }
  function nextQ() {
    if (quiz.i >= quiz.total) return finishRound();
    var s = st(), pick;
    if (quiz.cfg.mode === "drill") { var r = N.pickDrill(s, quiz.cells, quiz.hist, null, quiz.queue); pick = r.cell; quiz.why = r.why; }
    else pick = N.pickBag(quiz.cells, quiz.hist, quiz.bag);
    var t = quiz.cfg.type, k = t;
    if (t === "mix") { var ks = quiz.kinds.slice(-2); k = Math.random() < 0.5 ? "find" : "name"; if (ks.length === 2 && ks[0] === ks[1] && ks[0] === k) k = k === "find" ? "name" : "find"; }
    quiz.target = pick; quiz.kind = k; quiz.kinds.push(k); quiz.answered = false; quiz.t0 = now(); quiz.tapped = null;
    showQ();
    progress();
  }
  function showQ() {
    var c = quiz.target, p = phaseOf(), pr = document.getElementById("nPrompt"), pa = document.getElementById("nPanel");
    var openPhase = p.frets[1] === 0;
    board.setActive(openPhase && quiz.kind === "find" ? p.strings : [c.s]);
    var why = quiz.cfg.mode === "drill" ? '<span class="nwhy ' + quiz.why + '">' + (quiz.why === "retry" ? "Again: you missed this one" : quiz.why === "review" ? "Review: a note you know" : "Weak spot") + "</span>" : "";
    if (quiz.kind === "find") {
      pr.innerHTML = '<div class="pt">' + (openPhase ? "Tap the open string that plays <em>" + esc(c.name) + "</em>" : "Find <em>" + esc(c.name) + "</em> on the " + esc(sname(c.s))) + "</div>" +
        '<div class="ps">' + (openPhase ? (c.pc === 4 ? "Either E string counts" : "Open strings only") : "Frets " + p.frets[0] + "–" + p.frets[1] + " · tap the fret") + why + "</div>";
      board.setDots([]);
      pa.className = "panel"; pa.innerHTML = '<div class="actions"><span class="muted">Tap the fretboard. Your time counts, so go with your first instinct.</span><button class="btn" data-act="nSkip">Skip</button></div>';
    } else {
      pr.innerHTML = '<div class="pt">Name this note</div><div class="ps">' + esc(cap(sname(c.s))) + ", " + (c.f === 0 ? "open" : "fret " + c.f) + why + "</div>";
      board.setDots([{ key: "q", s: c.s, f: c.f, kind: "mark", label: "?" }]);
      pa.className = "panel"; pa.innerHTML = padHtml(p);
    }
  }
  function padHtml(p) {
    return '<div class="npad n' + (p.kind === "nat" ? 7 : 12) + '">' + N.padFor(p).map(function (b) {
      return '<button class="nkey' + (N.isNatural(b.pc) ? "" : " acc") + '" data-act="nPick" data-pc="' + b.pc + '">' + label(b.pc) + "</button>";
    }).join("") + "</div>";
  }
  function onTap(s, f) {
    if (view === "notes-heat") return heatTap(s, f);
    if (view === "notes-key") return;
    if (view === "notes-mic") return;
    if (!quiz || quiz.answered || quiz.kind !== "find") return;
    var p = phaseOf(), c = quiz.target;
    var allowed = p.frets[1] === 0 ? p.strings : [c.s];
    if (allowed.indexOf(s) < 0) { board.nudge(c.s); return; }
    if (f < p.frets[0] || f > p.frets[1]) { H().toast(p.frets[1] === 0 ? "Open strings only here" : "Frets " + p.frets[0] + "–" + p.frets[1] + " only"); return; }
    var ok = N.checkFind(c, s, f, p);
    quiz.tapped = { s: s, f: f };
    answer(ok, { s: s, f: f });
  }
  function pick(pc) {
    if (!quiz || quiz.answered || quiz.kind !== "name") return;
    answer(N.checkName(quiz.target, pc), { pc: pc });
  }
  function answer(ok, info) {
    var c = quiz.target, ms = Math.round(now() - quiz.t0), s = st(), p = phaseOf();
    quiz.answered = true;
    N.record(s, c.key, ok, ms); H().save();
    quiz.answers.push({ ok: ok, ms: ms, key: c.key, kind: quiz.kind });
    quiz.hist.push(c); quiz.i++;
    if (quiz.cfg.mode === "drill" && !ok) N.drillMiss(quiz.queue, c.key, quiz.hist.length);
    quiz.streak = ok ? quiz.streak + 1 : 0;
    var A = H().A;
    try { A.pluck(c.midi); if (!ok) setTimeout(function () { A.chime("miss"); }, 120); } catch (e) { /* audio optional */ }
    var dots = [], pa = document.getElementById("nPanel"), t = (ms / 1000).toFixed(1) + " s";
    if (quiz.kind === "find") {
      var tgtFrets = p.frets[1] === 0 ? [] : N.fretsFor(c.s, c.pc).filter(function (f) { return f >= p.frets[0] && f <= p.frets[1]; });
      if (ok) dots.push({ key: "a", s: info.s, f: info.f, kind: "ok", label: label(c.pc) });
      else {
        dots.push({ key: "a", s: info.s, f: info.f, kind: "bad", label: label(N.pcAt(info.s, info.f)) });
        (p.frets[1] === 0 ? p.strings.filter(function (x) { return N.pcAt(x, 0) === c.pc; }).map(function (x) { return { s: x, f: 0 }; }) : tgtFrets.map(function (f) { return { s: c.s, f: f }; }))
          .forEach(function (g, i) { dots.push({ key: "g" + i, s: g.s, f: g.f, kind: "ghost", label: label(c.pc) }); });
      }
    } else {
      dots.push({ key: "q", s: c.s, f: c.f, kind: ok ? "ok" : "ghost", label: label(c.pc) });
      var keys = document.querySelectorAll(".nkey");
      keys.forEach(function (k) { var pc = +k.getAttribute("data-pc"); if (pc === c.pc) k.classList.add("right"); else if (pc === info.pc) k.classList.add("wrong"); else k.classList.add("dim"); });
    }
    board.setDots(dots); board.flash(ok ? "ok" : "bad");
    var msg;
    if (ok) msg = "<b>Yes, " + esc(c.name) + "</b> · " + t + (ms <= N.MASTER_MS ? " ⚡" : "");
    else if (quiz.kind === "find") msg = "<b>That's " + esc(N.nameOf(N.pcAt(info.s, info.f))) + ".</b> " + esc(c.name) + " on the " + esc(sname(c.s)) + (p.frets[1] === 0 ? " is the open string." : " is at fret " + N.fretsFor(c.s, c.pc).filter(function (f) { return f >= p.frets[0] && f <= p.frets[1]; }).join(" and ") + ".");
    else msg = "<b>It's " + esc(c.name) + "</b> (you said " + esc(N.nameOf(info.pc)) + ").";
    var fb = '<div class="actions fb"><span class="nmsg ' + (ok ? "good" : "miss") + '">' + msg + '</span><button class="btn check" data-act="nNext">' + (quiz.i >= quiz.total ? "Finish" : "Next") + " ›</button></div>";
    if (quiz.kind === "name") pa.insertAdjacentHTML("beforeend", fb); else pa.innerHTML = fb;
    pa.className = "panel " + (ok ? "good" : "miss");
    progress();
    if (ok) { var at = quiz.i; later(function () { if (quiz && quiz.answered && quiz.i === at && view === "notes-quiz") nextQ(); }, 850); }
  }
  function skip() { if (!quiz || quiz.answered) return; answer(false, quiz.kind === "find" ? { s: -1, f: -1, skip: true } : { pc: -1 }); }
  function finishRound() {
    var s = st(), c = quiz.cfg, res;
    if (c.mode === "path") {
      var p = N.PHASES[c.phase], was = !!(s.phases[p.id] && s.phases[p.id].passed);
      res = N.roundResult(p, quiz.answers); N.recordRound(s, p, res); res.newPass = res.passed && !was;
    } else if (c.mode === "test") {
      res = N.testResult(c.phase, quiz.answers);
      if (res.passed) { N.applyTestOut(s, c.phase); res.newPass = true; }
      else res.advice = N.testAdvice(c.phase, res, quiz.answers);
    } else res = N.roundResult({ round: quiz.total, targetMs: 6000 }, quiz.answers);
    H().save();
    quiz.result = res;
    go("notes-result");
  }
  function renderResult() {
    var q = quiz, r = q.result, c = q.cfg, s = st();
    var missed = []; q.answers.forEach(function (a) { if (!a.ok && missed.indexOf(a.key) < 0) missed.push(a.key); });
    var med = isFinite(r.medMs) ? (r.medMs / 1000).toFixed(1) + " s" : "–";
    var h = '<div class="result"><div class="rcard nres"><div class="rk">' + (c.mode === "drill" ? "Weak-note drill" : c.mode === "test" ? "Test out · " + esc(N.PHASES[c.phase].title) : "Note Path · Phase " + (c.phase + 1) + " · " + esc(N.PHASES[c.phase].title)) + "</div>";
    if (c.mode === "test") {
      var tp = N.PHASES[c.phase], tn = N.PHASES[c.phase + 1], prevI = c.phase - 1;
      while (prevI > 0 && !N.phaseUnlocked(s, prevI, practice())) prevI--;
      h += "<h2>" + (r.passed ? "Tested out!" : "Not yet") + "</h2>" +
        '<div class="rstats">' + stat("Right first time", Math.round(r.acc * 100) + "% " + (r.passAcc ? "✓" : "✗"), "need " + Math.round(N.PASS_ACC * 100) + "%") + stat("Typical time", med + " " + (r.passSpeed ? "✓" : "✗"), "need ≤ " + tp.targetMs / 1000 + " s") + stat("Notes", r.ok + "/" + r.n) + "</div>";
      if (r.passed) h += '<p class="infonote">Phases 1–' + (c.phase + 1) + " are now marked passed" + (tn ? ". Next up: <b>Phase " + (c.phase + 2) + " · " + esc(tn.title) + "</b>" : "") + ".</p>" +
        '<div class="ractions">' + (tn ? '<button class="btn check" data-act="nGoPhase" data-i="' + (c.phase + 1) + '">Start Phase ' + (c.phase + 2) + " ›</button>" : "") + '<button class="btn' + (tn ? "" : " check") + '" data-act="nHome">Notes</button></div>';
      else h += '<p class="ntadvice">' + esc(r.advice) + "</p>" +
        '<div class="ractions"><button class="btn check" data-act="nGoPhase" data-i="' + prevI + '">Start Phase ' + (prevI + 1) + ": " + esc(N.PHASES[prevI].title) + ' ›</button><button class="btn" data-act="nTestOut" data-i="' + c.phase + '">Test again</button><button class="btn" data-act="nHome">Notes</button></div>';
    } else if (c.mode === "path") {
      var p = N.PHASES[c.phase], nx = N.PHASES[c.phase + 1];
      h += "<h2>" + (r.passed ? (r.newPass ? "Phase passed!" : "Passed again") : "Round done") + "</h2>" +
        '<div class="rstats">' + stat("Right first time", Math.round(r.acc * 100) + "% " + (r.passAcc ? "✓" : "✗"), "need " + Math.round(N.PASS_ACC * 100) + "%") + stat("Typical time", med + " " + (r.passSpeed ? "✓" : "✗"), "need ≤ " + p.targetMs / 1000 + " s") + stat("Notes", r.ok + "/" + r.n) + "</div>";
      if (r.newPass && nx) h += '<p class="infonote">Unlocked: <b>Phase ' + (c.phase + 2) + " · " + esc(nx.title) + "</b></p>";
      else if (!r.passed) h += '<p class="muted">' + (!r.passAcc && !r.passSpeed ? "Aim for accuracy first, then speed." : !r.passAcc ? "Fast enough. Now get " + Math.round(N.PASS_ACC * 100) + "% right." : "Accurate. Now a bit quicker: trust the landmarks instead of counting.") + "</p>";
      h += '<div class="ractions">' + (r.newPass && nx ? '<button class="btn check" data-act="nGoPhase" data-i="' + (c.phase + 1) + '">Next phase ›</button>' : "") +
        '<button class="btn' + (r.newPass && nx ? "" : " check") + '" data-act="nAgain">Go again</button><button class="btn" data-act="nDrill">Weak-note drill</button><button class="btn" data-act="nHome">Notes</button></div>';
    } else {
      var weak = N.weakest(s, N.drillCells(s, practice()), 5);
      h += "<h2>Drill done</h2>" + '<div class="rstats">' + stat("Right first time", Math.round(r.acc * 100) + "%") + stat("Typical time", med) + stat("Mastered", masteredCount() + "/78") + "</div>" +
        (weak.length ? '<p class="muted">Still weakest: ' + weak.map(function (x) { return esc(where(x)); }).join(", ") + "</p>" : "") +
        '<div class="ractions"><button class="btn check" data-act="nDrill">Drill again</button><button class="btn" data-act="nHeat">Heatmap</button><button class="btn" data-act="nHome">Notes</button></div>';
    }
    if (missed.length && c.mode !== "test") h += '<p class="muted small">Missed this round: ' + missed.map(function (k) { return esc(where(N.cell(+k.split(",")[0], +k.split(",")[1]))); }).join(", ") + "</p>";
    app().innerHTML = h + "</div></div>";
    if (r.passed && root.TQConfetti) root.TQConfetti(r.newPass ? 220 : 90);
    try { H().A.chime(r.passed ? "fanfare" : "ok"); } catch (e) { /* audio optional */ }
  }
  function stat(l, v, sub) { return '<div class="stat"><div class="sv">' + esc(v) + '</div><div class="sl">' + esc(l) + (sub ? "<br><small>" + esc(sub) + "</small>" : "") + "</div></div>"; }

  /* ---------- heatmap ---------- */
  function renderHeat() {
    app().classList.add("screen-play");
    app().innerHTML = '<div class="play nplay"><header class="topbar"><button class="icon-btn" data-act="nHome" aria-label="Back to Notes">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker">Notes · <b>Heatmap</b></div><div class="muted small" id="nHeatSum"></div></div>' +
      '<div class="seg"><button data-act="nHeatWhat" data-v="acc" class="' + (heatWhat === "acc" ? "on" : "") + '">Accuracy</button><button data-act="nHeatWhat" data-v="speed" class="' + (heatWhat === "speed" ? "on" : "") + '">Speed</button></div></header>' +
      '<section class="board-area" id="nBoard"></section><section class="panel" id="nPanel"></section></div>';
    mkBoard(document.getElementById("nBoard"));
    board.setActive([0, 1, 2, 3, 4, 5]);
    drawHeat();
  }
  function drawHeat() {
    var s = st(), dots = [], tried = 0, open = {}, unl = N.drillCells(s, practice());
    unl.forEach(function (c) { open[c.key] = 1; });
    N.allCells().forEach(function (c) {
      var x = N.stat(s, c.key), h = N.heat(x, heatWhat), lk = !open[c.key]; if (x && x.n && !lk) tried++;
      dots.push({ key: c.key, s: c.s, f: c.f, kind: "hm " + (lk ? "hl" : h === null ? "hn" : "h" + h) + (!lk && N.mastered(x) ? " mst" : "") + (heatSel === c.key ? " hsel" : ""), label: lk ? "" : N.names(c.pc)[0] });
    });
    board.setDots(dots);
    document.getElementById("nHeatSum").textContent = tried + "/" + unl.length + " unlocked notes tried · " + masteredCount() + " mastered" + (unl.length < 78 ? " · faded = locked phase" : "");
    var weak = N.weakest(s, unl, 6), info;
    if (heatSel && !open[heatSel]) info = "That note is in a locked phase. Pass or test out of it on the Note Path (or unlock all phases in Settings).";
    else if (heatSel) {
      var c = N.cell(+heatSel.split(",")[0], +heatSel.split(",")[1]), x = N.stat(s, heatSel);
      info = "<b>" + esc(c.name) + "</b> on the " + esc(sname(c.s)) + ", " + (c.f ? "fret " + c.f : "open") + ": " +
        (x && x.n ? x.ok + "/" + x.n + " right · typical " + (x.ms ? (x.ms / 1000).toFixed(1) + " s" : "–") + " · " + (N.mastered(x) ? "mastered ✓" : x.streak + " right in a row") : "not tried yet");
    } else info = "Tap any note for its numbers.";
    var leg = heatWhat === "acc" ? ["under 50%", "50%+", "70%+", "85%+", "95%+"] : ["6 s+", "4–6 s", "2.5–4 s", "1.5–2.5 s", "under 1.5 s"];
    document.getElementById("nPanel").innerHTML = '<div class="hleg">' + leg.map(function (l, i) { return '<span><i class="hsw h' + i + '"></i>' + l + "</span>"; }).join("") + '<span><i class="hsw hn"></i>not tried</span><span><i class="hsw mstk"></i>mastered</span></div>' +
      '<div class="actions"><span class="hinfo" id="nHeatInfo">' + info + "</span>" + (weak.length ? '<span class="muted small">Weakest: ' + weak.map(function (c) { return esc(where(c)); }).join(" · ") + "</span>" : "") +
      '<button class="btn check" data-act="nDrill">Drill weak notes ›</button></div>';
  }
  function heatTap(s, f) { if (f > N.MAXF) return; heatSel = N.cellKey(s, f); drawHeat(); }

  /* ---------- chord tones of the current Triad Quest key ---------- */
  function renderKey() {
    app().classList.add("screen-play");
    var ki = H().keyIdx(), d = TQ.diatonic(TQ.KEYS[ki].root);
    app().innerHTML = '<div class="play nplay"><header class="topbar"><button class="icon-btn" data-act="nHome" aria-label="Back to Notes">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker">Notes · <b>Chord tones in ' + esc(H().keyLabel()) + '</b></div><div class="muted small">Your Triad Quest key. Change it on the Levels screen.</div></div></header>' +
      '<div class="nchips">' + d.map(function (c, i) { return '<button class="chipbtn' + (i === keyChord ? " on" : "") + '" data-act="nKeyChord" data-i="' + i + '"><b>' + esc(c.name) + "</b> " + TQ.ROMAN[i] + "</button>"; }).join("") +
      '<button class="chipbtn' + (keyChord === 7 ? " on" : "") + '" data-act="nKeyChord" data-i="7"><b>Scale</b> all 7</button></div>' +
      '<section class="board-area" id="nBoard"></section><section class="panel" id="nPanel"></section></div>';
    mkBoard(document.getElementById("nBoard"));
    board.setActive([0, 1, 2, 3, 4, 5]);
    drawKey();
  }
  function keyDots(ki, which) {
    var d = TQ.diatonic(TQ.KEYS[ki].root), dots = [];
    if (which === 7) {
      var tonic = TQ.pcOf(d[0].root);
      N.allCells().forEach(function (c) { var hit = d.filter(function (x) { return TQ.pcOf(x.root) === c.pc; })[0]; if (hit) dots.push({ key: c.key, s: c.s, f: c.f, kind: c.pc === tonic ? "jt jr" : "given", label: TQ.nm(hit.root) }); });
      return dots;
    }
    var ch = d[which], cls = { root: "jr", "3rd": "j3", "5th": "j5" }, sh = { root: "R", "3rd": "3", "5th": "5" };
    N.allCells().forEach(function (c) {
      ch.tones.forEach(function (t, i) { if (TQ.pcOf(t) === c.pc) dots.push({ key: c.key, s: c.s, f: c.f, kind: "jt " + cls[ch.roles[i]], label: TQ.nm(t), role: sh[ch.roles[i]] }); });
    });
    return dots;
  }
  function drawKey() {
    var ki = H().keyIdx(), d = TQ.diatonic(TQ.KEYS[ki].root);
    board.setDots(keyDots(ki, keyChord));
    var txt = keyChord === 7 ? "The seven notes of " + esc(H().keyLabel()) + ": " + d.map(function (c) { return TQ.nm(c.root); }).join(" ") + ". The key note is lit."
      : "<b>" + esc(d[keyChord].name) + " = " + d[keyChord].tones.map(TQ.nm).join(" ") + "</b>. Here is every place they sit on frets 0–12. The triad shapes from the game are one of each colour on three neighbouring strings, close together.";
    document.getElementById("nPanel").innerHTML = '<div class="actions"><span>' + txt + "</span></div>";
  }

  /* ---------- Mic mode ---------- */
  function renderMic() {
    app().classList.add("screen-play");
    var s = st();
    app().innerHTML = '<div class="play nplay"><header class="topbar"><button class="icon-btn" data-act="nHome" aria-label="Back to Notes">‹</button>' +
      '<div class="tb-title"><div class="tb-kicker">Notes · <b>Mic mode</b></div><div class="muted small">Play the note on your guitar. Tune up first (Tuner tab).</div></div>' +
      '<div class="seg"><button data-act="nMicMode" data-v="quiz" class="' + (mic.mode === "quiz" ? "on" : "") + '">Quiz</button><button data-act="nMicMode" data-v="tuner" class="' + (mic.mode === "tuner" ? "on" : "") + '">Tuner</button></div></header>' +
      '<section class="prompt" id="nPrompt"></section>' +
      '<section class="micread" id="nRead"><div class="mnote" id="nHeard">–</div><div class="mcents"><i id="nNeedle"></i><span class="z"></span></div><div class="mlevel"><i id="nLevel"></i></div><div class="muted small" id="nHz">&nbsp;</div></section>' +
      '<section class="board-area" id="nBoard"></section><section class="panel" id="nPanel"></section></div>';
    mkBoard(document.getElementById("nBoard"));
    micPanel();
    if (mic.mode === "quiz") micNext(); else micTunerPrompt();
  }
  function micPanel() {
    var s = st(), pa = document.getElementById("nPanel"); if (!pa) return;
    var tol = s.mic.tol;
    if (mic.err) { pa.className = "panel miss"; pa.innerHTML = '<div class="micerr"><b>Mic mode is off.</b> ' + esc(mic.err.msg) + '</div><div class="actions end"><button class="btn" data-act="nStart" data-type="find">Practise by tapping</button><button class="btn check" data-act="nMicStart">Try again</button></div>'; return; }
    pa.className = "panel";
    pa.innerHTML = '<div class="actions micbar">' + (mic.on ? '<span class="miclive">● Listening</span><button class="btn" data-act="nMicStop">Stop mic</button>' : '<button class="btn check" data-act="nMicStart">🎤 Start mic</button><span class="muted small">Safari will ask to use the microphone. Nothing is recorded or sent anywhere.</span>') +
      '<span class="mictol"><span class="muted small">In tune within</span><div class="seg">' + [25, 35, 50].map(function (v) { return '<button data-act="nMicTol" data-v="' + v + '" class="' + (tol === v ? "on" : "") + '">±' + v + "¢</button>"; }).join("") + "</div></span>" +
      (mic.mode === "quiz" ? '<button class="btn" data-act="nMicSkip">Skip</button>' : "") + "</div>";
  }
  function micTunerPrompt() {
    var pr = document.getElementById("nPrompt"); if (pr) pr.innerHTML = '<div class="pt">Tuner</div><div class="ps">Play an open string: E A D G B E (82, 110, 147, 196, 247, 330 Hz)</div>';
    board.setActive([0, 1, 2, 3, 4, 5]); board.setDots([]);
  }
  function micNext() {
    var s = st(), cells = N.phaseCells(N.PHASES[N.currentPhase(s)]);
    var c = N.pickRandom(cells, mic.target ? [mic.target] : []);
    // the last note may still be ringing: ignore it until the strings go quiet or another note starts, and give him a moment
    mic.ignore = mic.target ? mic.target.midi : null; mic.quiet = 0; mic.ignoreUntil = now() + 2500;
    mic.target = c; mic.recorded = false; mic.wrongShown = null; mic.startAt = now(); mic.lock = now() + 500;
    if (mic.stab) mic.stab.reset();
    var pr = document.getElementById("nPrompt");
    if (pr) pr.innerHTML = '<div class="pt">Play <em>' + esc(c.name) + "</em> on the " + esc(sname(c.s)) + "</div>" + '<div class="ps" id="nMicSub">' + (mic.on ? "Listening… let the note ring" : "Start the mic, then play it") + "</div>";
    board.setActive([c.s]); board.setDots([]);
  }
  function startMic() {
    var A = H().A, ctx;
    mic.err = null;
    try { A.unlock(); ctx = A.context(); } catch (e) { ctx = null; }
    if (!ctx || !PI.Listener.supported()) { mic.err = PI.Listener.explain({ name: "unsupported" }); micPanel(); return Promise.resolve(false); }
    mic.listener = new PI.Listener(); mic.stab = new PI.Stabilizer(4, 35);
    return mic.listener.start(ctx, onFrame).then(function () { mic.on = true; micPanel(); var sub = document.getElementById("nMicSub"); if (sub) sub.textContent = "Listening… let the note ring"; return true; })
      .catch(function (e) { mic.on = false; mic.err = PI.Listener.explain(e); micPanel(); return false; });
  }
  function stopMic() { if (mic.listener) mic.listener.stop(); mic.listener = null; mic.on = false; }
  function onFrame(r) {
    if (view !== "notes-mic") return;
    var lv = document.getElementById("nLevel"); if (lv) lv.style.width = Math.min(100, Math.round((r.rms || 0) * 600)) + "%";
    var hz = mic.stab.push(r.hz && r.clarity > 0.75 ? r.hz : null);
    if (!r.hz) { if (++mic.quiet >= 2) mic.ignore = null; } else mic.quiet = 0;
    if (hz) onHz(hz);
  }
  /* a steady pitch was heard */
  function onHz(hz) {
    var n = PI.noteOf(hz), heard = document.getElementById("nHeard"), nd = document.getElementById("nNeedle"), hzEl = document.getElementById("nHz");
    if (heard) heard.innerHTML = esc(N.nameOf(n.pc)) + "<small>" + (Math.floor(n.midi / 12) - 1) + "</small>";
    if (nd) { nd.style.left = (50 + Math.max(-50, Math.min(50, n.cents))) + "%"; nd.className = Math.abs(n.cents) <= st().mic.tol ? "in" : ""; }
    if (hzEl) hzEl.textContent = hz.toFixed(1) + " Hz · " + (n.cents > 0 ? "+" : "") + n.cents + " cents";
    if (mic.mode !== "quiz" || !mic.target || now() < mic.lock) return;
    if (mic.ignore !== null && mic.ignore !== undefined) { if (n.midi === mic.ignore && now() < mic.ignoreUntil) return; mic.ignore = null; }
    var c = mic.target, j = PI.judge(hz, c.midi, st().mic.tol), sub = document.getElementById("nMicSub"), s = st();
    if (j.ok) {
      if (!mic.recorded) { N.record(s, c.key, true, Math.round(now() - mic.startAt)); H().save(); mic.recorded = true; }
      board.setDots([{ key: "m", s: c.s, f: c.f, kind: "ok", label: label(c.pc) }]); board.flash("ok");
      if (sub) sub.innerHTML = "<b>Heard it: " + esc(c.name) + "</b> (" + esc(N.octaveName(c.midi)) + ", " + (c.f ? "fret " + c.f : "open") + "), " + (j.cents > 0 ? "+" : "") + j.cents + " cents";
      mic.lock = now() + 1e9;
      later(function () { if (view === "notes-mic" && mic.mode === "quiz") micNext(); }, 1400);
      return;
    }
    var key = n.midi;
    if (mic.wrongShown === key) return;
    mic.wrongShown = key;
    if (!mic.recorded) { N.record(s, c.key, false, 0); H().save(); mic.recorded = true; }
    if (sub) sub.innerHTML = j.wrongOctave
      ? "Right note, wrong octave (" + esc(N.octaveName(n.midi)) + "). On the " + esc(sname(c.s)) + " it's " + esc(N.octaveName(c.midi)) + "."
      : "Heard " + esc(N.nameOf(n.pc)) + " (" + esc(N.octaveName(n.midi)) + "). Keep trying: " + esc(c.name) + " on the " + esc(sname(c.s)) + ".";
  }

  /* ---------- events ---------- */
  function act(a, el) {
    var v = el.getAttribute("data-v"), i = +el.getAttribute("data-i");
    switch (a) {
      case "nHome": go("notes"); break;
      case "nPhase": sel = i; renderHome(); break;
      case "nIntro": openPhaseCard(isNaN(i) ? sel : i); break;
      case "nStart": startRound(view === "notes-mic" ? { mode: "path", phase: N.currentPhase(st()), type: "find" } : { mode: "path", phase: sel === null ? N.currentPhase(st()) : sel, type: el.getAttribute("data-type") }); break;
      case "nGoPhase": sel = i; startRound({ mode: "path", phase: i, type: quiz && quiz.cfg.mode === "path" ? quiz.cfg.type : "mix" }); break;
      case "nTestOut": startRound({ mode: "test", phase: i, type: "mix" }); break;
      case "nAgain": startRound(quiz.cfg); break;
      case "nDrill": startRound({ mode: "drill", type: "mix" }); break;
      case "nHeat": heatSel = null; go("notes-heat"); break;
      case "nHeatWhat": heatWhat = v; segOn(el); drawHeat(); break;
      case "nKey": go("notes-key"); break;
      case "nKeyChord": keyChord = i; segOn(el); drawKey(); break;
      case "nMic": go("notes-mic"); break;
      case "nMicStart": startMic(); break;
      case "nMicStop": stopMic(); micPanel(); break;
      case "nMicTol": st().mic.tol = +v; H().save(); micPanel(); break;
      case "nMicSkip": micNext(); break;
      case "nMicMode": mic.mode = v; segOn(el); if (v === "quiz") micNext(); else { mic.target = null; micTunerPrompt(); } micPanel(); break;
      case "nPick": pick(+el.getAttribute("data-pc")); break;
      case "nNext": if (quiz && quiz.answered) nextQ(); break;
      case "nSkip": skip(); break;
    }
  }
  function segOn(el) { Array.prototype.forEach.call(el.parentNode.children, function (b) { b.classList.toggle("on", b === el); }); }
  function key(e) {
    if (e.key === "Escape") { e.preventDefault(); if (view === "notes") H().go("home"); else go("notes"); return; }
    if (view === "notes-quiz" && quiz) {
      if (e.key === "Enter" && quiz.answered) { e.preventDefault(); nextQ(); }
      else if (quiz.kind === "name" && !quiz.answered && /^[a-gA-G]$/.test(e.key)) { var pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[e.key.toLowerCase()]; pick(pc); }
    }
  }
  root.TQNotesUI = { render: render, teardown: teardown, act: act, key: key, homeLine: homeLine, keyDots: keyDots };
  root.__tqNotes = { get quiz() { return quiz; }, get view() { return view; }, get mic() { return mic; }, onHz: function (hz) { onHz(hz); }, startRound: startRound, store: st, startMic: startMic, setMicTarget: function (s, f) { micNext(); var c = N.cell(s, f); mic.target = c; var pr = document.getElementById("nPrompt"); if (pr) pr.querySelector(".pt").innerHTML = "Play <em>" + esc(c.name) + "</em> on the " + esc(sname(c.s)); board.setActive([s]); }, onFrame: function (r) { onFrame(r); } };
})(typeof self !== "undefined" ? self : globalThis);
