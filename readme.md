# Push-Slide Match (推推消消乐) - Ocean Edition

A single-player puzzle game shipped as a **single-file HTML5 page**
(`push-slide-match.html`). Double-click to run - no server, no build step,
no external assets. UI text is Chinese; code identifiers are English.

Mobile-first and production-oriented: responsive square board that fits any
viewport, safe-area aware layout, device-pixel-ratio-crisp SVG artwork,
synthesized audio, haptics, combo feedback, installability meta, and
reduced-motion support.

## 1. How to play

- Push a block (or a chain of contiguous blocks) along one of four orthogonal
  directions by dragging.
- On release, the dragged block **A** ray-casts along its row/column. If the
  first block hit in any direction has the same pattern (**B**), the pair is
  eliminated. Otherwise the whole group smoothly reverts.
- Tap a block directly to eliminate it when a same-pattern block already
  faces it along a clear line.
- When A can match in BOTH axes, a pick overlay highlights every target;
  tap the one you want, or cancel to revert the slide.
- Clear all 24 pairs (48 blocks, 6 sea-creature species) to win.

## 2. Running & verifying

```bash
# open push-slide-match.html in any modern browser (double-click works)

# everything at once (fails fast on any regression):
node tests/run-all.mjs

# core logic regression suite (no browser needed):
node tests/run-core-tests.mjs          # all groups (~100+ assertions)
node tests/run-core-tests.mjs undo     # single group by name

# full input->view->core interaction smoke suite (virtual clock, manual rAF):
node tests/smoke-interaction.mjs       # 5 scenarios / 24 checks

# layout regression across extreme viewports, DPR caps and rotation:
node tests/layout-viewport.mjs         # 8 device profiles / 40 checks

# solver simulation: plays N full games through GameCore (greedy hint chase
# + shuffle on deadlock) and reports winnability/deadlock statistics
node tests/solver-sim.mjs 300          # 100% winnable, ~0.06 shuffles/game

# no-solution correctness: findHint vs a brute-force move oracle across
# mid-game states, plus intermediate-distance (point-slide) and tap-only cases
node tests/find-hint.mjs
```

The page also embeds `window.runSelfTest(which)` asserting push-group
construction, max slide distance, ray-cast elimination, revert restoration,
shuffle empty-cell conservation, hint solvability, progress/win, multi-match
detection, pair elimination, drag commit/revert, point-sliding, tap-to-match,
ghost consistency, and single-step undo. `tests/run-core-tests.mjs` executes
that suite inside a Node VM with browser stubs.

Manual QA checklist (mobile):

- [ ] Board fits width on 320px / 375px / 414px screens; no page scroll or bounce
- [ ] Rotation re-fits the board; sprites/background rebake crisp at new DPR
- [ ] Safe areas respected on notch devices (top/bottom padding)
- [ ] No long-press context menu on the board; no double-tap zoom on buttons
- [ ] Sound toggle persists across reloads; muted state shows slashed icon
- [ ] First visit shows coach overlay once; "开始游戏" dismisses permanently

## 3. Architecture

Four decoupled layers inside one page:

```
App (assembly + HUD + game feel)
 ├─ GameCore          pure logic, no DOM/Canvas dependency
 │    Grid(8x8) + block list + species table
 │    buildPushGroup / getMaxSlideDistance / checkMatch / resolve / revert
 │    shuffle / findHint / win detection / pushSnapshot / undo / resolvePair
 │    clickResolve / findMultiMatches / applySlide / revertSlide
 ├─ RenderView        Canvas 2D, continuous rAF loop
 │    baked deep-sea background (god rays, caustics, sand glow, vignette)
 │    per-species sprites: procedural glossy candy tile + async SVG creature
 │    drag follow / removal ghosts / revert / hint / pick overlay /
 │    same-pattern pulse / drag cross mask / particles + rings / ambient bubbles
 ├─ InputController   mouse + touch pointer events -> grid coords -> core
 └─ HUD               progress ring + bar, frosted icon buttons, toast msg,
                      win overlay (stats + confetti), first-run coach overlay
```

`GameCore` exposes only plain data and functions; `RenderView` and input code
depend on it, never the reverse.

## 4. Data model

- `grid[8][8]`: value is species id 1..6, or `0` for empty. Every block is an
  obstacle to other blocks; empty cells provide sliding space.
- `blocks: [{ id, pattern, r, c }]`: block entity table; `grid` is the spatial
  index kept in sync (`consistencyCheck()` verifies).
- 6 species x 8 blocks = 48 blocks, 16 empty cells, 24 pairs.
- Progress = `clearedPairs / totalPairs`. No refill/gravity after elimination.

## 5. Geometry & responsiveness

- All board math reads the mutable `G = { cell, gap, pitch, size, dpr }`.
- `computeLayout()` fits the square board into `#boardWrap`
  (flex: 1 of a fixed-body column), snapping cells to whole pixels.
- Backing store density capped at `DPR_CAP = 2` (the biggest single mobile
  GPU lever); canvas CSS size always
  equals logical size so pointer math stays exact.
- Sprite cache is a numeric geometry bucket (`cell*16 + dpr*4`) - zero
  string allocation in the per-frame lookup path; an absolute board cap
  (`BOARD_MAX_PX = 760`) keeps giant desktop monitors sane.
- resize/orientationchange/visualViewport events are debounced (120ms) and
  hysteresis-filtered (`maybeRelayout`, <24px jitter ignored) - this breaks
  the mobile URL-bar resize feedback storm. `resize()` itself is a no-op when
  dimensions did not change, so redundant events never re-allocate the
  canvas buffer.

## 5b. Rendering budget

- One continuous rAF loop serves all effects. It skips work entirely when
  the tab is hidden or a modal overlay is open (`RenderView.setPaused`),
  and drops to ~30fps when idle (only ambient bubbles move); drags,
  particles, hints and the pick overlay restore full-rate rendering
  (`isBusyFrame()`).
- No `backdrop-filter` sits above the animating canvas (#msg toast and HUD
  buttons use solid translucency) - blur layers over a changing backdrop
  force a full re-composite every frame on mobile GPUs.
- Confetti nodes self-remove via animationend plus a 4s timeout fallback.

## 6. Art pipeline

- Species: 小丑鱼 clownfish, 蓝倒吊 blue tang, 绿海龟 turtle, 河豚 pufferfish,
  紫水母 jellyfish, 小红蟹 crab (`PATTERN_NAMES`).
- Each sprite = procedurally painted glossy rounded tile (gradients, bevel,
  gloss, drop shadow - synchronous) with a hand-authored inline SVG creature
  composited asynchronously via data-URI -> Image -> offscreen canvas.
- Background bakes water gradient, god rays, caustic blobs, warm sand glow,
  rounded translucent cell tiles and vignette into one cached bitmap.
- Runtime-generated 512px PNG icon feeds apple-touch-icon + blob manifest
  (`ensurePwaIcons()`); static SVG favicon sits in `<head>`.

## 7. Game feel (juice)

- Continuous rAF loop drives effects; idles cheaply when hidden and freezes
  entirely under modal overlays (`RenderView.setPaused`).
- **Hit-stop**: eliminations freeze the board for 70–115ms (scaling with the
  streak); real-timestamp animators are shifted across the freeze so every
  effect resumes exactly where it stopped.
- **Choreography** (multimodal timing per platform haptics guidance): sound +
  vibration fire together with the shockwave rings; bubble particles pop
  +30ms; the combo floater rises +110ms.
- **Screen shake**: only earned at combo x3+, tier-scaled amplitude/duration,
  decaying fast, skipped under reduced-motion.
- **Combo floater**: `连击 ×N` pops in above the eliminated pair (replaces
  the old toast), ease-out-back scale, layout hard-clamped to the visible
  board for the whole animation so edge eliminations never draw off-screen.
- The match sound is a CLEAN glass break: one sharp broadband "crack"
  (the glass giving way) then a few DISTINCT high shard "tinks" - short
  sines with a near-instant attack, slight downward pitch bend and fast
  decay, cleanly spaced so each one reads crisply (anchored above
  `SoundManager.MATCH_BASE`). Density scales with the streak and LOCKS at
  the max once reached (`_registerMatch`): every combo >= 3 plays the
  identical max-tier feedback - no extra milestone layers. The streak is
  miss-based, never time-based: it continues across arbitrarily long
  thinking pauses and breaks only on an actual miss (a tap whose global
  same-pattern bounce fires, or a reverted drag) or on undo/shuffle/restart.
- Web Audio synth: clean glass-break match hits (one sharp crack + distinct
  high shard tinks), noise-sweep shuffle, descending revert slide, soft miss
  blip, UI ticks, win arpeggio. Master
  gain mute persisted in `localStorage('psm.sound')`; a
  DynamicsCompressorNode guards against clipping; first pointerdown performs
  the iOS silent-unlock; the context auto-resumes when the tab becomes
  visible again.
- Haptics via `navigator.vibrate` (guarded) on match/pick/shuffle/win.
- Win overlay: elapsed time, pairs cleared, hints/undos used, DOM confetti.
- `prefers-reduced-motion` disables particles, bubbles, confetti, shake,
  floaters and CSS animations while keeping full functionality.

## 8. Persistence

| Key            | Meaning                              |
|----------------|--------------------------------------|
| `psm.sound`    | `'on'` / `'off'` sound preference    |
| `psm.coached`  | `'1'` once the coach overlay is done |
| `psm.bestTime` | fastest clear time, in seconds       |

Deadlock handling: after every board change the app probes `findHint()`;
when nothing can eliminate, the shuffle button pulses and a toast suggests
reshuffling. `findHint()` is exact: it checks EVERY reachable slide distance
(1..maxDist, so intermediate point-slides count) and falls back to tap-to-match,
so "no hint" really means no legal move exists.

## 9. Debugging

- `?debug=1` URL flag enables the in-page overlay (grid values, hover cell,
  fps/P95 frame-time and bake counters) and structured logging into
  `window.__LOGS` via `dbg()`/`dbgStep()`; uncaught errors are captured too.
- `SMOKE_DEBUG=1 node tests/smoke-interaction.mjs` dumps a full per-drag
  timeline (pick-open frame, clear frame, core mutation calls, grid states)
  whenever a drag's outcome diverges from the pure-logic prediction.

### Notable bugfix history

- **Sprite cache wipe storm**: an early spriteFor() cleared the whole cache
  on any miss; the per-block render loop then re-baked every tile + re-decoded
  every SVG each frame (memory climb, jank, endless tab spinner). Cache is now
  a numeric geometry bucket and S6 asserts bake counters stay flat.
- **Resize feedback storm** on mobile: URL-bar toggling re-assigned
  canvas.width (full buffer realloc) in a loop. Fixed with debounce +
  hysteresis (`maybeRelayout`) + no-op resize guard.
- **Chain-push corruption**: applySlide looked members up by coordinate
  mid-move; chained pushes (member N destination == member N+1 origin)
  re-captured moved blocks, corrupting blocks[] so later multi-pick picks
  silently failed. Now moves by ID; guarded by embedded `chainPick` test.
- `GameCore.consistencyCheck()` guards grid<->block agreement after every
  mutation; results ride along in debug log entries.

## 10. Handover notes for the next developer

- Everything lives in `push-slide-match.html`; keep it self-contained
  (no external assets, no network calls beyond none).
- Keep `GameCore` DOM-free; extend `selfTests` in-page and rerun
  `node tests/run-core-tests.mjs` after every change. Assertion counts vary
  between runs because the `group` test walks a random layout.
- Geometry: never reintroduce hard-coded pixel constants; read from `G`.
- Sound callbacks/effects are re-wired to each new RenderView in
  `App._wireView` (called on construction and restart).
- Undo restores the dragged block to its ORIGINAL cell (snapshot precedes
  slide commit); shuffle is intentionally not undoable.
