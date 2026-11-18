/* Triad Quest - fretboard renderer (DOM, absolutely positioned; re-lays out on resize/rotation). */
(function (root) {
  "use strict";
  var TQ = root.TQ;
  var STR_THICK = [4.4, 3.6, 2.9, 2.2, 1.5, 1.1];
  var WOUND = [true, true, true, true, false, false]; // phosphor-bronze acoustic set: E A D G wound
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function Board(host, opts) {
    this.host = host;
    this.onTap = opts.onTap;
    this.getOrientation = opts.getOrientation || function () { return "auto"; };
    this.active = [0, 1, 2];
    this.dots = [];
    this.dotEls = {};
    this.build();
    var self = this;
    if (root.ResizeObserver) { this.ro = new ResizeObserver(function () { self.layout(); }); this.ro.observe(host); }
    this._onResize = function () { self.layout(); };
    root.addEventListener("resize", this._onResize);
    root.addEventListener("orientationchange", this._onResize);
    this.layout();
  }
  Board.prototype.destroy = function () {
    if (this.ro) this.ro.disconnect();
    root.removeEventListener("resize", this._onResize);
    root.removeEventListener("orientationchange", this._onResize);
  };
  Board.prototype.build = function () {
    this.host.innerHTML =
      '<div class="board">' +
      '<div class="neck"><div class="headstock"></div><div class="wood"></div><div class="nut"></div>' +
      '<div class="layer lanes"></div><div class="layer frets"></div><div class="layer inlays"></div>' +
      '<div class="layer strings"></div><div class="layer dots"></div><div class="layer zones" role="grid" aria-label="Fretboard"></div></div>' +
      '<div class="slabels"></div><div class="fnums"></div></div>';
    var q = this.host.querySelector.bind(this.host);
    this.el = q(".board"); this.neck = q(".neck"); this.wood = q(".wood"); this.head = q(".headstock"); this.nut = q(".nut");
    this.lanesL = q(".lanes"); this.fretsL = q(".frets"); this.inlaysL = q(".inlays"); this.stringsL = q(".strings");
    this.dotsL = q(".dots"); this.zonesL = q(".zones"); this.slabels = q(".slabels"); this.fnums = q(".fnums");
    var self = this;
    this.zonesL.addEventListener("click", function (e) {
      var z = e.target.closest ? e.target.closest(".zone") : null;
      if (!z) return;
      self.onTap(+z.getAttribute("data-s"), +z.getAttribute("data-f"));
    });
  };
  Board.prototype.layout = function () {
    var W = this.host.clientWidth, H = this.host.clientHeight;
    if (!W || !H) return;
    var o = this.getOrientation();
    var upright = o === "upright" || (o === "auto" && W < 560);
    this.upright = upright;
    this.el.classList.toggle("upright", upright);
    var LAB = 30, NUM = 26, sumw = 0, k, openU = 0.95, taper = 24;
    function sumFor(tp) { var t = 0; for (var j = 1; j <= 15; j++) t += Math.pow(2, -(j - 1) / tp); return t; }
    var unit, cross, neckLen, ox, oy;
    if (!upright) {
      neckLen = W - LAB - 6;
      // real frets get narrower up the neck; ease the taper on narrow screens so fret 15 stays >= 40px
      var tapers = [24, 36, 60, 120, 1e9];
      for (k = 0; k < tapers.length; k++) {
        taper = tapers[k]; sumw = sumFor(taper);
        if (neckLen / (sumw + openU) * Math.pow(2, -14 / taper) >= 40) break;
      }
      unit = neckLen / (sumw + openU);
      cross = clamp((H - NUM - 6) / 6, 38, root.innerHeight > root.innerWidth ? 96 : 74);
      ox = LAB; oy = Math.max(0, (H - NUM - cross * 6) / 2);
    } else {
      cross = clamp((W - LAB - 10) / 6, 42, 84);
      sumw = sumFor(taper);
      unit = Math.max((H - NUM - 6) / (sumw + openU), 40 / Math.pow(2, -14 / taper));
      neckLen = unit * (sumw + openU);
      ox = LAB + Math.max(0, (W - LAB - cross * 6) / 2); oy = NUM;
    }
    var edges = [0, openU * unit];
    for (k = 1; k <= 15; k++) edges.push(edges[k] + unit * Math.pow(2, -(k - 1) / taper));
    this.edges = edges; this.cross = cross; this.unit = unit;
    var neckCross = cross * 6;
    var ns = this.neck.style, bs = this.el.style;
    if (!upright) {
      ns.left = ox + "px"; ns.top = oy + "px"; ns.width = neckLen + "px"; ns.height = neckCross + "px";
      bs.height = (oy + neckCross + NUM) + "px"; bs.width = "100%";
    } else {
      ns.left = ox + "px"; ns.top = oy + "px"; ns.width = neckCross + "px"; ns.height = neckLen + "px";
      bs.height = (oy + neckLen + 6) + "px"; bs.width = "100%";
    }
    // regions along the neck
    this.place(this.head, 0, edges[1], 0, neckCross);
    this.place(this.wood, edges[1], edges[16], 0, neckCross);
    this.place(this.nut, edges[1] - 4, edges[1] + 4, 0, neckCross);
    var html = "", s, f;
    // fret wires
    for (f = 1; f <= 15; f++) html += '<div class="fret" style="' + this.rectCss(edges[f + 1] - 2, edges[f + 1] + 2, 0, neckCross) + '"></div>';
    this.fretsL.innerHTML = html;
    // pearl inlays
    html = "";
    var inl = cross * 0.32;
    [3, 5, 7, 9, 15].forEach(function (ff) { html += this.inlayHtml(ff, 3 * cross, inl); }, this);
    html += this.inlayHtml(12, 2 * cross, inl) + this.inlayHtml(12, 4 * cross, inl);
    this.inlaysL.innerHTML = html;
    // lanes (active string glow), strings, zones, labels
    var lanes = "", strs = "", zones = "", labs = "", nums = "";
    for (s = 0; s < 6; s++) {
      var ci = upright ? s : 5 - s;
      var c0 = ci * cross, c1 = c0 + cross;
      lanes += '<div class="lane" data-s="' + s + '" style="' + this.rectCss(0, edges[16], c0 + 3, c1 - 3) + '"></div>';
      var th = STR_THICK[s] * clamp(cross / 60, 0.85, 1.25);
      var mid = c0 + cross / 2;
      strs += '<div class="string' + (WOUND[s] ? " wound" : "") + '" data-s="' + s + '" style="' + this.rectCss(4, edges[16] + 6, mid - th / 2, mid + th / 2) + '"></div>';
      for (f = 0; f <= 15; f++) {
        zones += '<button class="zone" data-s="' + s + '" data-f="' + f + '" aria-label="' + TQ.STR_NAME[s] + " string, " + (f === 0 ? "open" : "fret " + f) + '" style="' + this.rectCss(edges[f], edges[f + 1], c0, c1) + '"></button>';
      }
      if (!upright) labs += '<div class="slab" data-s="' + s + '" style="left:0;width:' + (LAB - 4) + 'px;top:' + (oy + mid - 12) + 'px;height:24px">' + TQ.STR_LETTER[s] + "</div>";
      else labs += '<div class="slab" data-s="' + s + '" style="top:0;height:' + (NUM - 4) + 'px;left:' + (ox + mid - 15) + 'px;width:30px">' + TQ.STR_LETTER[s] + "</div>";
    }
    for (f = 0; f <= 15; f++) {
      var a = f === 0 ? edges[1] / 2 : (edges[f] + edges[f + 1]) / 2;
      var big = [3, 5, 7, 9, 12, 15].indexOf(f) >= 0;
      var txt = f === 0 ? "open" : String(f);
      var nw = Math.min(40, edges[f + 1] - edges[f]);
      if (!upright) nums += '<div class="fnum' + (big ? " hi" : "") + '" style="left:' + (ox + a - nw / 2) + 'px;width:' + nw + 'px;top:' + (oy + neckCross + 4) + 'px">' + txt + "</div>";
      else nums += '<div class="fnum' + (big ? " hi" : "") + '" style="left:' + (ox - LAB - 2) + 'px;width:' + (LAB - 2) + 'px;top:' + (oy + a - 10) + 'px">' + txt + "</div>";
    }
    this.lanesL.innerHTML = lanes; this.stringsL.innerHTML = strs; this.zonesL.innerHTML = zones;
    this.slabels.innerHTML = labs; this.fnums.innerHTML = nums;
    this.applyActive();
    var self = this;
    Object.keys(this.dotEls).forEach(function (key) { self.positionDot(self.dotEls[key]); });
  };
  Board.prototype.rectCss = function (a0, a1, c0, c1) {
    return this.upright
      ? "left:" + c0 + "px;width:" + (c1 - c0) + "px;top:" + a0 + "px;height:" + (a1 - a0) + "px"
      : "left:" + a0 + "px;width:" + (a1 - a0) + "px;top:" + c0 + "px;height:" + (c1 - c0) + "px";
  };
  Board.prototype.place = function (el, a0, a1, c0, c1) { el.setAttribute("style", this.rectCss(a0, a1, c0, c1)); };
  Board.prototype.alongC = function (f) { var e = this.edges; return f === 0 ? e[1] / 2 : (e[f] + e[f + 1]) / 2; };
  Board.prototype.inlayHtml = function (f, crossPos, size) {
    var a = this.alongC(f), x = this.upright ? crossPos : a, y = this.upright ? a : crossPos;
    return '<div class="inlay" style="left:' + (x - size / 2) + "px;top:" + (y - size / 2) + "px;width:" + size + "px;height:" + size + 'px"></div>';
  };
  Board.prototype.xy = function (s, f) {
    var a = this.alongC(f), ci = this.upright ? s : 5 - s, c = ci * this.cross + this.cross / 2;
    return this.upright ? { x: c, y: a } : { x: a, y: c };
  };
  Board.prototype.setActive = function (set) { this.active = set.slice(); this.applyActive(); };
  Board.prototype.applyActive = function () {
    var act = this.active;
    this.host.querySelectorAll("[data-s]").forEach(function (el) {
      if (el.classList.contains("zone") || el.classList.contains("note")) return;
      var on = act.indexOf(+el.getAttribute("data-s")) >= 0;
      el.classList.toggle("on", on); el.classList.toggle("off", !on);
    });
  };
  Board.prototype.positionDot = function (el) {
    var s = +el.getAttribute("data-s"), f = +el.getAttribute("data-f");
    var p = this.xy(s, f), e = this.edges;
    var fw = e[f + 1] - e[f];
    var d = clamp(Math.min(this.cross, fw) * 0.78, 28, 52);
    el.style.left = (p.x - d / 2) + "px"; el.style.top = (p.y - d / 2) + "px";
    el.style.width = d + "px"; el.style.height = d + "px"; el.style.fontSize = Math.round(d * 0.36) + "px";
  };
  /* dots: [{key,s,f,kind,label,role}] - keyed diff so only new notes animate in */
  Board.prototype.setDots = function (dots) {
    var seen = {}, self = this;
    dots.forEach(function (d) {
      seen[d.key] = true;
      var el = self.dotEls[d.key];
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("data-s", d.s); el.setAttribute("data-f", d.f);
        el.className = "note enter";
        self.dotsL.appendChild(el);
        self.dotEls[d.key] = el;
        setTimeout(function () { el.classList.remove("enter"); }, 400);
        self.positionDot(el);
      }
      var entering = el.classList.contains("enter");
      el.className = "note " + d.kind + (entering ? " enter" : "");
      el.innerHTML = '<span class="nl">' + (d.label || "") + "</span>" + (d.role ? '<span class="nr">' + d.role + "</span>" : "");
    });
    Object.keys(this.dotEls).forEach(function (key) {
      if (seen[key]) return;
      var el = self.dotEls[key];
      delete self.dotEls[key];
      el.classList.add("leave");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    });
  };
  Board.prototype.flash = function (kind) {
    var self = this;
    Object.keys(this.dotEls).forEach(function (key) {
      var el = self.dotEls[key];
      if (kind === "ok" && el.classList.contains("ok")) { el.classList.remove("glow"); void el.offsetWidth; el.classList.add("glow"); }
      if (kind === "bad" && el.classList.contains("bad")) { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }
    });
  };
  Board.prototype.vibrate = function (s) {
    var el = this.stringsL.querySelector('.string[data-s="' + s + '"]');
    if (!el) return;
    el.classList.remove("vib"); void el.offsetWidth; el.classList.add("vib");
  };
  Board.prototype.nudge = function (s) {
    var el = this.slabels.querySelector('.slab[data-s="' + s + '"]');
    if (!el) return;
    el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge");
  };
  root.TQBoard = Board;
})(typeof self !== "undefined" ? self : globalThis);
