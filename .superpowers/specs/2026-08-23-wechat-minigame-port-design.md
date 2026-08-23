# WeChat Mini Game Port - Design

Date: 2026-08-23
Status: Approved by user (AppID provided: `wxdbc3429dae591e19`)

## Goal

Port the single-file web game `push-slide-match.html` (推推消消乐, Ocean
Edition) to a WeChat Mini Game (`小游戏`). The web version stays untouched;
its test suite must keep passing.

## Constraints & runtime facts

- WeChat Mini Game has NO DOM/BOM. Rendering is canvas-only via
  `wx.createCanvas()`. The first `wx.createCanvas()` call returns the
  on-screen canvas.
- JS engine is JavaScriptCore (iOS) / V8 (Android). ES6 classes, `Map`,
  `Set`, destructuring, arrow functions are supported. Modules use
  CommonJS (`require` / `module.exports`).
- `wx.createWebAudioContext()` exists since base library 2.19.0 and
  supports `createOscillator`, `createGain`, `createDynamicsCompressor`,
  `createBufferSource`, `resume()`. Reuse the existing synthesized-audio
  SoundManager with a swapped context factory.
- `wx.createImage()` does NOT decode SVG data-URIs. The six SVG sea
  creatures must be re-drawn as procedural canvas paths.
- Persistence via `wx.setStorageSync/getStorageSync` (same keys as web:
  `psm.sound`, `psm.coached`, `psm.bestTime`).
- Haptics via `wx.vibrateShort({type})` / `wx.vibrateLong()`.
- Window info via `wx.getSystemInfoSync()` (`windowWidth`,
  `windowHeight`, `pixelRatio`); rotation via `wx.onWindowResize`.
- Lifecycle: `wx.onShow` / `wx.onHide`. Debug flag via
  `wx.getLaunchOptionsSync().query` (`debug=1`).
- `requestAnimationFrame`, `cancelAnimationFrame`, `performance.now()`
  are available globally.

## Approach

Native canvas port. Reuse `GameCore` verbatim; rewrite the presentation
layer (RenderView, HUD, input, sound, storage) against the Mini Game
runtime. No third-party engine.

## Project layout

```
minigame/
  game.js                 # entry: bootstrap, rAF loop, wx event wiring
  game.json               # mini game config (portrait, fps, etc.)
  project.config.json     # DevTools project config (real AppID)
  js/
    core.js               # GameCore -> CommonJS module (logic unchanged)
    sound.js              # SoundManager on wx.createWebAudioContext
    view.js               # RenderView: canvas render, sprites, effects
    ui.js                 # HUD / coach / win / buttons (canvas + hit-test)
    input.js              # touch events -> grid coords -> core
    storage.js            # wx storage wrapper
  tests/
    run-core.mjs          # run the core self-test suite against core.js
```

## Layer mapping

| Web capability          | Mini Game replacement                              |
|-------------------------|----------------------------------------------------|
| DOM HUD / overlays      | `ui.js`: canvas-drawn, touch hit-testing           |
| `localStorage`          | `wx.setStorageSync` / `getStorageSync`             |
| `navigator.vibrate`     | `wx.vibrateShort` / `wx.vibrateLong`               |
| `AudioContext`          | `wx.createWebAudioContext()` (fallback to silent)  |
| `new Image()` + SVG     | procedural canvas paths for 6 species               |
| pointer events          | `wx.onTouchStart/Move/End/Cancel` (single touch)   |
| `devicePixelRatio`/resize| `wx.getSystemInfoSync()` + `wx.onWindowResize`     |
| `document.hidden`       | `wx.onHide` / `wx.onShow`                          |
| `?debug=1`              | launch query `debug=1`                             |

## Rendering

- Screen canvas sized to `windowWidth * pixelRatio`, DPR capped at 2
  (same `DPR_CAP` as web). CSS-equivalent logical size via canvas.width
  scaling; all pointer math in logical pixels.
- Offscreen canvases via `wx.createCanvas()` for the baked background
  and sprite cache (numeric geometry bucket, same as web).
- Board layout math (`computeLayout`) re-used from web, driven by
  screen metrics instead of `#boardWrap` DOM.
- Effects (hit-stop, shake, combos, particles, confetti rings) ported
  1:1; reduced-motion becomes a manual flag (no OS API).

## UI (ui.js)

All web DOM pieces re-implemented on canvas with a small hit-testing
layer: progress ring + bar, five round icon buttons (undo/shuffle/
hint/restart/sound), toast, coach overlay (first run), win overlay
(stats + confetti), multi-choice pick overlay.

## Audio (sound.js)

SoundManager mirrors the web implementation. Context created lazily on
first user gesture (iOS unlock); master gain muted via stored
preference. If `wx.createWebAudioContext` is unavailable, all playback
becomes a no-op (never throws).

## Input (input.js)

`wx.onTouchStart/Move/End` routed to the same drag/tap state machine as
the web InputController (down -> cell A -> drag group -> commit/point-
slide -> multi-pick). Single touch only; `e.touches[0]` provides
clientX/clientY.

## Testing & verification

- `minigame/tests/run-core.mjs` runs the core self-test suite (core,
  group, match, shuffle, ghost, pointSlide, clickResolve, multiPick,
  pickSlide, chainPick, undo, full) against `js/core.js` in Node.
  Web test suite untouched.
- Manual verification in WeChat DevTools simulator + phone preview
  follows a checklist in `minigame/README.md`.

## Out of scope (this iteration)

- Publishing / review / 备案 (user handles via mp console).
- Share/leaderboard/open-data context.
- Multi-touch gestures, landscape orientation.
- Software copyright / 版号 paperwork.