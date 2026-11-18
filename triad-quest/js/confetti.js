/* Triad Quest - lightweight confetti on a full-screen canvas. */
(function (root) {
  "use strict";
  var cv = null, cx = null, parts = [], raf = 0;
  var COLORS = ["#ffd36b", "#ffb547", "#5ad1ff", "#3ee08f", "#ff7ab6", "#b48cff", "#ffffff"];
  function size() { var d = root.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; cx.setTransform(d, 0, 0, d, 0, 0); }
  function frame() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    var alive = 0;
    parts.forEach(function (p) {
      if (p.life <= 0) return;
      alive++;
      p.vy += 0.16; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.globalAlpha = Math.min(1, p.life / 40);
      cx.fillStyle = p.c;
      if (p.shape === 0) cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      else { cx.beginPath(); cx.arc(0, 0, p.s / 3, 0, 6.283); cx.fill(); }
      cx.restore();
    });
    if (alive) raf = requestAnimationFrame(frame); else { cx.clearRect(0, 0, innerWidth, innerHeight); raf = 0; }
  }
  root.TQConfetti = function (n) {
    try {
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!cv) { cv = document.getElementById("fx"); cx = cv.getContext("2d"); root.addEventListener("resize", size); }
      size();
      for (var i = 0; i < n; i++) {
        var side = i % 2 ? 1 : -1;
        parts.push({ x: innerWidth / 2 + side * innerWidth * 0.3, y: innerHeight * 0.55, vx: -side * (2 + Math.random() * 7) + (Math.random() - 0.5) * 3,
          vy: -(7 + Math.random() * 9), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, s: 7 + Math.random() * 7,
          c: COLORS[i % COLORS.length], life: 140 + Math.random() * 80, shape: i % 3 === 0 ? 1 : 0 });
      }
      if (!raf) raf = requestAnimationFrame(frame);
    } catch (e) { /* decorative only */ }
  };
})(typeof self !== "undefined" ? self : globalThis);
