# Triad Quest (PWA)

A fretboard game for learning guitar triads in every inversion on every string set. It works offline as an installable web app.
Version 1.1 adds **Jam**: play-along backing tracks (sampled drums, bass and guitar) with the current chord's triad lit up on the fretboard.

## Files that would be published (to kcoppins-creator/guitar-lessons under /triad-quest/)
```
triad-quest/index.html
triad-quest/manifest.webmanifest
triad-quest/sw.js
triad-quest/css/app.css
triad-quest/js/theory.js        (music engine: shapes computed from tuning + fret)
triad-quest/js/keypath.js       (guided key path: key order, key/level unlocks, next key; works on the saved stars)
triad-quest/js/intro.js         ("Here's what we'll learn" cards for all 16 levels + Jam; text written per level, notes/frets computed per key)
triad-quest/js/spell.js         (Spell it: note spelling of each triad + the fade-out state machine; pure functions)
triad-quest/js/audio.js         (Web Audio: Karplus-Strong plucks, chimes, metronome; shares its AudioContext with Jam)
triad-quest/js/board.js         (fretboard renderer)
triad-quest/js/confetti.js
triad-quest/js/jam-samples.js   (generated list of sample files + tuning data)
triad-quest/js/jamdata.js       (Jam progressions, voicings, pentatonic boxes, drum/bass/guitar patterns; pure functions)
triad-quest/js/jam.js           (Jam audio engine: sample loader, look-ahead scheduler, mixing, reverb, limiter)
triad-quest/js/app.js           (screens, game flow, scoring, progress, Jam screen)
triad-quest/audio/*.m4a         (120 AAC samples, about 3.4 MB, see "Sample sources and licences")
triad-quest/icons/*.png         (apple-touch-icon 180/167/152/120, 192, 512, maskable 512, favicon 32)
```
Do NOT publish `tests/`, `tools/`, `screens/`, `preview-jam.m4a` or `preview-jam-v3.mp3`; they are only for development.
URL: https://kcoppins-creator.github.io/guitar-lessons/triad-quest/

## Guided key path (v1.3.0)
The 12 major keys in circle-of-fifths order, guitar-friendly keys first: **G → C → D → A → E → F → B♭ → B → E♭ → A♭ → F♯ → D♭**.

- Each key has the same 16 levels, unlocked the same way as G (next string set, then next part). Clearing all 16 levels in a key opens the next key on the path.
- When you clear the 16th level of a key, the result screen shows **Key cleared!** with extra confetti and moves you to the next key automatically. The next key's card then explains what's new: its sharps or flats, which notes change from the previous key, and its I, IV and V chords, with the I chord drawn on E-A-D. **Let's go** starts Level 1 in the new key. If the next key is already cleared, it skips to the next one that isn't.
- The Levels screen has a **key path map**: 12 pips showing cleared (✓), current (amber ring) and locked (🔒) keys, with "x/16" levels for open keys. Tap any unlocked pip, or use the Key picker, to play that key. Locked keys can't be picked.
- Jam's key picker follows the same unlocks. A track's own home key stays playable (Kevin's E jam is always available in E).
- **Existing progress is kept.** Stars are stored per key exactly as before, so G clears count: a player who already cleared G gets C open with the path at C. Any key you already have stars in stays open, and so do levels you've already cleared. A saved key that isn't open falls back to where the path is up to. Practice mode still opens every key and level.

## Level intros ("Here's what we'll learn")
Before each level a card explains, in plain English, what the level teaches and why it matters in songs (2–4 short sentences), shows one example on a mini fretboard (notes labelled R / 3 / 5, coloured like the dots; Part 2 shows a chord change with the start shape as silver rings, Part 4 shows a reshape), and lists **Words to know**. Every term is defined the first time it shows up: triad, root/3rd/5th, interval and half step, major and minor 3rd, major vs minor, root position, inversion and string set (Level 1); tuning in 4ths (2); the B-string gap (3); key, Roman numerals and voice leading (5); common tone (6); chord scale, minor triad and diminished (9); vii° (10); ii–V–I (11); relative minor (12); chord quality and sus4 (13); minor iv (14); resolve (15).

- The card shows on every level until that level has been cleared once (in any key). **ⓘ** in the top bar reopens it any time. The level clock is paused while the card is open.
- **Let's go** (or Enter) closes it. Tick **Don't show intros again** on the card, or use Settings → *Show level intros*.
- Text is written per level; every chord name, note, fret and interval in it is computed from the theory engine for the key you're playing, so the cards are right in all 12 keys.
- Jam has its own card the first time you open it (also on ⓘ), covering the timing words: BPM, beat, bar, count-in, loop and pentatonic.

## Curriculum coverage (what the game levels actually drill)
| Part | Chords (in G) | Qualities | Inversions | String sets |
|---|---|---|---|---|
| 1 · The 12 Shapes | I only (G) | major | root, 1st, 2nd: each twice per level (6 shapes) | one per level: E-A-D, A-D-G, D-G-B, G-B-E |
| 2 · Smooth Moves | I, IV, V (G, C, D) as I–IV–I–V–I | major | any: you pick the closest shape (start shape in 2 of the 3 inversions) | one per level |
| 3 · Chord Scale | all 7: G Am Bm C D Em F♯dim | major, minor, diminished | one inversion per run, picked at random (replays cover all 3) | one per level |
| 4 · Shape Shifting | minor, dim and sus4 versions of I, IV, V (Gm Gdim Gsus4 Cm Cdim Csus4 Dm Ddim Dsus4) | minor, diminished, sus4 (from major) | all 3; 6 shapes per run (2 each of minor, dim and sus4, on random I/IV/V roots) | one per level |
| Speed round | I only; all 7 chords of the key once Part 3 is cleared in that key | major (+ minor, dim) | random | random |

**Keys:** see "Guided key path" below. All 12 major keys are reached in the game levels by following the path; every key has the same 16 levels, with key-correct spellings (E♯dim in F♯, B♭ in F, and so on).
**Not covered:** augmented and sus2 triads, 7th chords, minor keys as the home key (their chords appear as ii, iii and vi), and starting a reshape from a minor chord.

## Spell it (notes of the triad)
A strip under the chord name spells the triad with the right sharps/flats for the key, colour-coded like the dots and labelled R / 3 / 5 (4 for sus4): `A = A C♯ E`, `C♯m = C♯ E G♯`, `Gm = G B♭ D`. When the level asks for an inversion it also shows the notes from low to high on the string set (e.g. *2nd inversion on D-G-B, low → high: E A C♯*). After you check, it shows the order of the shape you actually played.

**Auto-fade** (default), tracked per chord root + quality and saved on the device:
- new chord: shown in full;
- 3 first-try right answers in a row: dimmed (blurred). Tap or hold it to see it, or it shows by itself after about 4 seconds without an answer;
- 6 in a row: hidden, with only a Peek button;
- any miss: back to full.

**Peek** (any time) shows the strip for 3 seconds. It costs 10 points on that shape and never touches your streak. An answer given after a peek, or after the 4-second reveal, doesn't move the fade forward. Retries don't count.

Settings → *Notes of the triad*: **Auto-fade**, **Always**, **After a miss** (shown only after you miss that chord, until you get it right again), **Off** (Peek still works).

In **Jam**, the header spells the current chord, gives its low-to-high order on the lit string set, and spells the next chord. The same setting applies: in Auto-fade, chords you have learned (6 in a row) are hidden there too, and Peek shows them.

## Jam (backing tracks)
- **Where:** the "🎸 Jam" button on the home screen, and "Apply it" on the result card after you clear a level ("Congrats on Level N — now let's apply it").
- **Tracks:**
  - ★ Kevin's E jam: E – A – C♯m – B (I–IV–vi–V). The C♯m pentatonic overlay (same notes as E major pentatonic) is on by default, with the chord tones ringed.
  - Part 1: I–IV–V in one inversion.
  - Part 2: I–IV–I–V, voice-led.
  - Part 3: I–vi–IV–V, ii–V–I and I–V–vi–IV.
  - Part 4: Em–C–G–D, and sus4 → major resolutions.
- **Unlocking:** each curriculum track opens on a string set once that Part's level on that set has a star. Kevin's jam is always open. Every key opens after all 16 levels are cleared in G, or with Practice mode on.
- **Styles:** each style has its own drum pattern, bass line and comping.
  - Rock 8ths
  - Blues shuffle: triplet ride, boogie bass, stabs on 2 and 4
  - Country: boom-chick, cross-stick, walking bass, light swing
  - Ballad: half-time, arpeggios ringing into a bigger reverb
- **Transport (always on screen):**
  - Play/Stop.
  - Tempo 70–120 bpm (slider or ± buttons). A tempo change takes effect at the next bar.
  - 1-bar count-in.
  - Loop. With Loop off, the track plays once, ends on the I chord and stops.
- **Fretboard:**
  - The current chord's triad is lit on the chosen string set (root amber, 3rd cyan, 5th green, 4th pink). You can pick voice-led, root position, 1st inversion or 2nd inversion.
  - Dashed rings preview the next chord, and the "Next" label turns gold on the last beat.
  - Optional pentatonic box. "Box ›" moves it to the next position.
  - Overlay toggles: Triad, Next, Pentatonic, Names.
  - Tapping the fretboard plays the guitar sample over the band without stopping it.
- **Mixer:** volume and mute for drums, bass and chords. Mixer settings are saved on the device.
- **iOS:**
  - Audio unlocks on the first tap, and the Jam shares one AudioContext with the game sounds.
  - `navigator.audioSession.type = "playback"` lets audio play with the silent switch on.
  - Playback pauses when the app goes to the background (visibilitychange or pagehide).
- **Audio engine:**
  - Web Audio look-ahead scheduler: a 25 ms timer, 160 ms note look-ahead and bars generated 0.5 s ahead.
  - Swing, plus humanised timing (±3–5 ms) and velocity (±8%).
  - Velocity layers and round-robin drum hits; hi-hat choke; per-string guitar choke; mono bass.
  - Kick: +5 dB at 62 Hz, −7 dB at 4 kHz, −4 dB high-shelf above 7 kHz, plus a sine sub layer tuned to 62.6 Hz (3/4 of the kick's measured 83.5 Hz fundamental) with a 30 ms pitch drop. Then the drum bus compressor.
  - Bass: low-shelf +3 dB at 90 Hz, +3.5 dB at 110 Hz, −1.5 dB at 280 Hz, gentle tanh saturation (4× oversampled), soft low-pass at 2.2 kHz and 3.2 kHz to remove pick/finger click, then a slow-attack compressor.
  - Guitar: high-pass 110 Hz, +1.5 dB at 250 Hz, −1 dB at 2.7 kHz, −3 dB high-shelf above 6 kHz, soft low-pass at 9 kHz, a slow-attack compressor (lets the pick through) and slight right pan. The reverb send is 25% higher than the style's base.
  - Guitar attack: each note also triggers a ~20 ms copy of its own onset, band-passed around 3 kHz, so the pick and string attack stays crisp while the sustain stays warm.
  - Rhythm guitar plays real open and barre chords (4–6 strings: open E/A/D/G/C and their minor/sus4 forms, otherwise E- or A-shape barres), not the lit triad. The lit triad is what you play.
  - Strums: downstrokes low → high, upstrokes high → low, 8–25 ms between strings (softer strokes sweep slower), with per-string timing (±1.5 ms) and velocity (±8%) variation. Two round-robin recordings per note.
  - Rock: full chords on 1 and 3, palm-muted 8th chugs on the low three strings (Karoryfer staccato samples through a 1.8 kHz low-pass), an upstroke on 3-and, and alternating-bar dynamics. Shuffle: full chord on 1, chops on 2 and 4. Country: bass string / alternate bass and upper-string strums. Ballad: fingerpicked full chord.
  - Notes ring until the same string is played again, then damp over ~35 ms. Short notes release over ~120 ms, like a lifted finger rather than a key-off.
  - Mix headroom: the mix bus feeds the glue compressor at 0.6, so the limiter only catches stray peaks (true peak about −1.4 dBTP).
  - Convolution reverb using a generated room impulse response (2.2 s, made in code at start-up, no file).
  - Glue compressor, then a master limiter.
  - Onset detection removes AAC encoder delay, so hits land on the grid.
  - Measured per-sample tuning corrects each note to A4 = 440 Hz.

## Sample sources and licences
All samples are **CC0 1.0 (public domain dedication)**. No attribution is required, but here are the credits:

| Sound | Source | Licence |
|---|---|---|
| Drums: kick, snare, cross-stick, hi-hat (closed, half-open, pedal), ride, ride bell, crash | **Virtuosity Drums** by Versilian Studios and Karoryfer Samples, from the SFZ Instruments archive: https://github.com/sfzinstruments/virtuosity_drums | CC0 1.0 (repository licence) |
| Bass: "Dark Black" bass guitar, fingered, mp and mf layers (the softer layers, for a rounder tone), every minor third from E1 to E3 | **Black and Blue Basses** by Karoryfer Samples: https://github.com/sfzinstruments/karoryfer.black-and-blue-basses | CC0 1.0 (`license` file in the repository) |
| Guitar: "Green" Gretsch Anniversary, clean single notes (mf and f layers, 2 round-robins, every minor third from E2 to G5) and staccato notes (2 round-robins, E2 to A♯4) for palm-muted chugs | **Black and Green Guitars** by Karoryfer Samples (recorded by Brian Wood): https://github.com/sfzinstruments/karoryfer.black-and-green-guitars | CC0 1.0 (`LICENSE` file in the repository) |
| Reverb impulse response | Generated in `js/jam.js` (`makeIR`) | Original code, part of this app |

**How the samples were processed** (`tools/build_samples.py`):
1. Download the original 48 kHz FLAC/WAV files.
2. Mix the drum microphones per hit: close mic plus overheads plus room. For cymbals: overheads, mid and room.
3. Trim each sample to its attack and fade the tail.
4. Normalise each instrument group together, so velocity layers keep their natural dynamics.
5. Check every bass and guitar note's pitch by autocorrelation, and store the measured tuning offset in `js/jam-samples.js`.
6. Encode to AAC `.m4a`: 112–128 kbps for drums, 80 kbps for bass, 112 kbps for guitar (keeps the pick attack).

AAC is used because Safari on iOS decodes it natively. The total is 120 files, about 3.4 MB, well under the 15 MB budget, and they are all precached by the service worker for offline use.

## Install on iPad
Open the URL in Safari, then tap Share > Add to Home Screen. After that it opens full-screen and works offline.

## Updating
The service worker serves files from its cache first. When you change any file, also change `VERSION` in `sw.js` (currently `triad-quest-v1.3.0`). Otherwise installed copies keep the old files. The audio file list comes from `js/jam-samples.js` via `importScripts`.

## Tests
```
node tests/theory.test.js                 # music-theory verification (no browser needed)
node tests/keypath.test.js                # key path: order + spellings, key signatures, unlocks, next key, old saves, key intro cards
node tests/intro.test.js                  # intro cards: all 16 levels x 12 keys, no empty fields, examples = real shapes, text claims checked, words defined before use
node tests/spell.test.js                  # Spell it: every key/quality/inversion spelled, low-to-high order, fade state machine
node tests/jam.test.js                    # Jam scheduler: voicings, chord timings, highlighted tones per chord/key, bar events, pentatonic boxes
python3 -m http.server 8765 --bind 127.0.0.1 &
NODE_PATH=<dir with playwright-core>/node_modules node tests/e2e.js http://127.0.0.1:8765/
node tests/render_preview.js preview-jam.m4a kevin E 2 rock 92 26   # offline render (OfflineAudioContext) of a jam preview
tests/measure_mix.sh <label>             # isolated kick/bass/guitar + full mix band energies (needs the local server)
python3 tools/build_samples.py            # re-download/re-encode the samples (needs ffmpeg + numpy)
python3 tests/make_icons.py               # regenerate icons
```
