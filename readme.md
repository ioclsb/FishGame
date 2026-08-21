# Push-Slide Match (推推消消乐) - Handoff / Handover Document

> **Read me first.** This directory (`C:\Users\arybin\Desktop\FishGame`) is now
> the **active development target**. It currently contains only the game file
> `push-slide-match.html` (the final, fully-verified version). All test scripts,
> the Python/Playwright runtime, and the design docs still live in the original
> workspace `C:\Users\arybin\Documents\Default Project` (see
> [Handover / File map](#handover--file-map) below).

---

## 1. What this is

A single-player puzzle game shipped as a **single-file HTML5 Canvas page**
(`push-slide-match.html`) - double-click to run, no server, no build step, no
external assets. UI text is in Chinese; code identifiers are in English.

The player pushes a block (or a chain of contiguous blocks) along one of four
orthogonal directions. When released, the dragged block **A** is ray-cast along
its row and column. If a same-pattern block **B** is the first block hit in any
direction, the pair (A, B) is removed. If no match exists, the whole pushed
group smoothly reverts to its pre-drag positions. The board has no permanent
obstacle cells - any block acts as an obstacle, and empty cells provide sliding
space.

## 2. How to run

- Open `push-slide-match.html` in any modern browser (double-click).
- Optional `?debug=1` URL flag enables the in-page debug overlay (grid values,
  hover coordinates) and structured logging (see [Debugging](#7-debugging)).

## 3. Architecture

Four decoupled layers inside one page:

```
App (assembly + HUD)
 ├─ GameCore          pure logic, no DOM/Canvas dependency
 │    Grid(8x8) + block list + pattern table
 │    buildPushGroup / getMaxSlideDistance / checkMatch / resolve / revert
 │    shuffle / findHint / win detection / pushSnapshot / undo / resolvePair
 │    clickResolve / findMultiMatches / applySlide / revertSlide
 ├─ RenderView        Canvas 2D
 │    offscreen background layer + per-pattern block sprites
 │    drag follow / elimination line / revert / hint / pick overlay /
 │    same-pattern pulse (triggerBounce) / drag cross mask
 ├─ InputController   mouse + touch pointer events -> grid coords -> core
 └─ HUD               progress bar, win overlay, shuffle/hint/undo buttons
```

`GameCore` exposes only plain data and functions; `RenderView` and
`InputController` depend on it, never the reverse.

## 4. Data model

- `grid[8][8]`: value is pattern id, or `0` for empty. No dedicated obstacle
  value; every block is a movement obstacle to other blocks.
- `blocks: [{ id, pattern, r, c }]`: block entity table; `grid` is the spatial
  index kept in sync.
- Board: 8x8, `CELL=64`, `GAP=4`, `BOARD_PX=540` (fits a ~900x950 viewport).
- 6 patterns x 8 blocks = 48 blocks, 16 empty cells, `TOTAL_PAIRS = 24`.
- Progress = `clearedPairs / totalPairs`. No refill, no gravity after
  elimination. Board empties -> 100% -> win overlay.

## 5. Core algorithms

- **Push group**: walk from A in the drag direction; every contiguous block
  joins the group; A is the tail; blocks behind A stay put.
- **Max slide distance**: count contiguous empty cells from the group's
  leading edge in the current direction (rigid translation). Direction can flip
  within a locked axis; group stays fixed.
- **Match check**: from A's final position scan up/down/left/right, skipping
  empty cells; first same-pattern block in any direction = match. `O(4x8)`.
- **Success**: remove A and B only; other group members commit their
  post-slide coordinates; `clearedPairs++`.
- **Revert**: whole group animates back to pre-drag positions.
- **Multi-choice**: if A matches 2+ targets across any rays
  (`findMultiMatches` returns an array), open a PICKING overlay (dark mask +
  yellow-highlighted targets) and let the player choose; click elsewhere
  cancels (reverts the drag slide).
- **Same-pattern pulse**: tapping and releasing a block with no match pulses
  every same-pattern block (scale ~0.22 around each block's own center).
- **Drag cross mask**: while dragging, a light-white cross always centers on
  the dragged block's current row/column (`Math.floor` of center / cell pitch);
  it advances only when the block center truly crosses into the next cell.

## 6. Completed features & bugfix history

Everything below is implemented, regression-tested, and in the shipped file.

1. Core push-group / max-slide / ray-cast match / revert (copy-on-write).
2. Ghost-block bugfix - resolve() now clears all surviving members' original
   cells atomically before writing new cells (order-independent, no ghosts).
3. Discrete-point sliding - snap to the cell under the cursor (clamped
   1..maxDist); release short of the next cell's center reverts directly.
4. Tap-to-match - a short tap (under the 6px threshold) eliminates a matching
   pair directly (cross-gap, any direction).
5. 8x8 square board + viewport fit (from 10x10).
6. Multi-choice overlay - all match targets across all rays highlighted;
   pick to eliminate in place or cancel to revert.
7. Same-pattern pulse feedback (amplitude 0.22, decaying).
8. Drag row/column cross mask that always follows the block's live cell.
9. Bidirectional drag on a locked axis (direction flips, group fixed).
10. Web Audio synth sound manager (no assets):
    - click: only when a tap is released WITHOUT a match (pressing alone is
      silent);
    - match: any successful elimination (tap/drag/pick) - same sound for all;
    - release: only when a DRAG ends without a match (revert);
    - no sound on drag start or successful drag release.
    - Sound callbacks are re-attached on restart (`App._wireView`) so they
      survive a view rebuild.
11. Single-step undo button ("撤销") - reverts the most recent elimination;
    restores the dragged block to its ORIGINAL cell (snapshot taken before any
    slide/overlay). Shuffle is intentionally not undoable.

## 7. Verification

The page embeds `window.runSelfTest(which)` asserting push-group construction,
max slide distance, ray-cast elimination, revert restoration, shuffle empty-cell
conservation, hint solvability, progress/win, multi-match detection, pair
elimination, drag commit/revert, point-sliding, tap-to-match, ghost consistency,
and single-step undo (tap + drag).

Run the Playwright suite (Python 3.11 + Playwright in the repo runtime):

```
& "C:\Users\arybin\Documents\Default Project\runtime\python\python.exe" tests/verify.py all
```

From `C:\Users\arybin\Documents\Default Project`. Latest result:
**PASS** (100+ self-test checks + interaction).

### Debugging

- `?debug=1` flag; `window.__LOGS` structured buffer; `dbg()`/`dbgStep()`.
- `tests/debug_session.py` - headful Chromium + CDP on port 9222.
- `tests/debug_inspect.py --steps|--full-grid|--blocks|--consistency|--selftest|--tail|--filter` - live CDP query.
- `tests/debug_reload.py` - reload + fresh game in the debug window.

## Handover / File map

| Path | Purpose |
|------|---------|
| `C:\Users\arybin\Desktop\FishGame\push-slide-match.html` | **The game (active dev target).** Final, fully-verified single-file page. |
| `C:\Users\arybin\Documents\Default Project\tests\verify.py` | Playwright verification driver. |
| `C:\Users\arybin\Documents\Default Project\tests\debug_*.py` | Debug session / inspect / reload scripts. |
| `C:\Users\arybin\Documents\Default Project\runtime\python\python.exe` | Bundled Python 3.11 + Playwright runtime. |
| `C:\Users\arybin\Documents\Default Project\docs\superpowers\specs\2026-08-20-push-slide-match-design.md` | Design spec (source of truth; kept in sync with every change). |
| `C:\Users\arybin\Documents\Default Project\docs\superpowers\plans\2026-08-20-push-slide-match.md` | Original task-by-task implementation plan. |
| `C:\Users\arybin\AppData\Local\Temp\opencode\sdd-push-slide-match\progress.md` | SDD execution ledger - full change/fix history with root causes. |
| `C:\Users\arybin\AppData\Local\Temp\opencode\cdp_*.py` | Ad-hoc CDP end-to-end test scripts (sound, undo, mask, bidirectional, revert, etc.). |

## Handover notes for the next developer

- **This directory is now the dev target.** Continue editing
  `push-slide-match.html` here. The test scripts and runtime are referenced
  from `Default Project`; either run them there (paths above) or copy
  `tests/` + `runtime/` next to the game if you want a self-contained FishGame.
- The `GameCore` logic is fully unit-testable via `window.runSelfTest`; add new
  self-test cases there and extend `tests/verify.py` if interaction is needed.
- Keep the design spec in sync - it is the binding authority for behavior.
- No git, no node; verification is Python + Playwright only.
- When changing sound behavior, remember sound callbacks must be re-attached to
  the view on restart (`App._wireView`).
- Board geometry constants (`COLS/ROWS/CELL/GAP/TOTAL_PAIRS/HUD progress`) must
  stay consistent with each other and with any self-test coordinate assumptions.
