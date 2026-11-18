# Triad Quest (PWA)

A fretboard game for learning guitar triads in every inversion on every string set. It works offline as an installable web app.

## Files that would be published (to kcoppins-creator/guitar-lessons under /triad-quest/)
```
triad-quest/index.html
triad-quest/manifest.webmanifest
triad-quest/sw.js
triad-quest/css/app.css
triad-quest/js/theory.js   (music engine: shapes computed from tuning + fret)
triad-quest/js/audio.js    (Web Audio: Karplus-Strong plucks, chimes, metronome)
triad-quest/js/board.js    (fretboard renderer)
triad-quest/js/confetti.js
triad-quest/js/app.js      (screens, game flow, scoring, progress)
triad-quest/icons/*.png    (apple-touch-icon 180/167/152/120, 192, 512, maskable 512, favicon 32)
```
Do NOT publish `tests/` or `screens/`; they are only for development.
Once published, the URL would be https://kcoppins-creator.github.io/guitar-lessons/triad-quest/

## Install on iPad
Open the URL in Safari, then tap Share > Add to Home Screen. After that it opens full-screen and works offline.

## Updating
The service worker serves files from its cache first. When you change any file, also change `VERSION` in `sw.js`. Otherwise installed copies keep the old files.

## Tests
```
node tests/theory.test.js                 # music-theory verification (no browser needed)
python3 -m http.server 8765 --bind 127.0.0.1 &
NODE_PATH=<dir with playwright-core>/node_modules node tests/e2e.js http://127.0.0.1:8765/
python3 tests/make_icons.py               # regenerate icons
```
