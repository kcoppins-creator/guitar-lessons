/* Triad Quest service worker: precache everything, serve cache-first, work fully offline. */
var VERSION = "triad-quest-v1.4.1";
var ASSETS = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/theory.js", "js/spell.js", "js/keypath.js", "js/intro.js", "js/audio.js", "js/board.js", "js/confetti.js", "js/jam-samples.js", "js/jamdata.js", "js/jam.js", "js/notes.js", "js/pitch.js", "js/notesui.js", "js/app.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/favicon-32.png",
  "icons/apple-touch-icon.png", "icons/apple-touch-icon-180.png", "icons/apple-touch-icon-167.png",
  "icons/apple-touch-icon-152.png", "icons/apple-touch-icon-120.png"
];
// backing-track samples (CC0, see README): the list comes from the same file the app uses
importScripts("js/jam-samples.js");
(function (S) {
  Object.keys(S.drums).forEach(function (k) { S.drums[k].forEach(function (f) { ASSETS.push("audio/" + f); }); });
  Object.keys(S).forEach(function (k) { if (Array.isArray(S[k])) S[k].forEach(function (e) { ASSETS.push("audio/" + e.file); }); }); // bass, gtr, gst
})(self.TQ_SAMPLES);
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("triad-quest-") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      if (e.request.mode === "navigate") return caches.match("index.html");
      return new Response("", { status: 504 });
    });
  }));
});
