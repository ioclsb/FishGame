// Shared VM harness for interaction tests: loads the game page with browser
// stubs, a controllable virtual clock, a manual rAF pump, and event firing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function makeCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return null;
      if (p === 'measureText') return () => ({ width: 10 });
      return () => makeCtx();
    },
    set() { return true; },
  });
}

class ImageStub { set src(v) { this._src = v; } get src() { return this._src; } }

export function createHarness() {
  const html = readFileSync(path.join(root, 'push-slide-match.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found');
  const src = m[1];

  let vNow = 1000;              // virtual clock (ms)
  let rafQ = [];                // pending requestAnimationFrame callbacks
  let G = null;                 // page geometry, available after load

  function fakeEl(tag = 'div') {
    const handlers = {};
    const el = {
      tagName: String(tag).toUpperCase(),
      style: {},
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, force) {
          const want = force === undefined ? !this._set.has(c) : !!force;
          want ? this._set.add(c) : this._set.delete(c);
          return want;
        },
      },
      handlers,
      addEventListener(t, h) { (handlers[t] ??= []).push(h); },
      removeEventListener() {},
      setAttribute() {}, getAttribute: () => null,
      setPointerCapture() {}, releasePointerCapture() {},
      getContext: () => makeCtx(),
      getBoundingClientRect: () => ({
        left: 0, top: 0,
        width: (G ? G.size : 540), height: (G ? G.size : 540),
      }),
      get clientWidth() { return G ? G.size : 540; },
      get clientHeight() { return G ? G.size : 540; },
      width: 300, height: 150,
      textContent: '',
      appendChild() {},
    };
    return el;
  }

  const sandbox = {
    console,
    URLSearchParams,
    Math, JSON, Set, Map, Object, Array, Number, String, Boolean, Date, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    performance: { now: () => vNow },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document = {
    _els: {},
    getElementById(id) { return (this._els[id] ??= fakeEl(id === 'board' ? 'canvas' : 'div')); },
    createElement(tag) { return fakeEl(tag); },
    addEventListener() {},
    body: fakeEl('body'),
  };
  sandbox.location = { search: '' };
  sandbox.navigator = {};
  sandbox.devicePixelRatio = 1;
  sandbox.innerWidth = 900;
  sandbox.innerHeight = 950;
  sandbox.visualViewport = null;
  sandbox.addEventListener = () => {};
  sandbox.localStorage = (() => {
    const store = {};
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  })();
  sandbox.Image = ImageStub;
  sandbox.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  // toast auto-hide is cosmetic; no-op in the harness
  sandbox.setTimeout = () => 0;
  sandbox.clearTimeout = () => {};

  // boardWrap must report a size BEFORE the script runs (App reads it in
  // computeLayout during RenderView construction).
  const wrapEl = fakeEl('div');
  wrapEl._wrapW = 540;
  wrapEl._wrapH = 540;
  Object.defineProperty(wrapEl, 'clientWidth', { get() { return this._wrapW; } });
  Object.defineProperty(wrapEl, 'clientHeight', { get() { return this._wrapH; } });
  const docGet = (id) => (sandbox.document._els[id] ??= fakeEl(id === 'board' ? 'canvas' : 'div'));
  sandbox.document.getElementById = (id) => (id === 'boardWrap' ? wrapEl : docGet(id));

  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'push-slide-match.html#inline' });

  G = sandbox.__G;

  // Advance the virtual clock and run every pending rAF callback per frame.
  // Callbacks scheduled during a frame are picked up on the following one,
  // matching real rAF semantics.
  function flush(ms) {
    const frames = Math.max(1, Math.ceil(ms / 16.7));
    for (let f = 0; f < frames; f++) {
      vNow += 16.7;
      const q = rafQ;
      rafQ = [];
      for (const cb of q) cb(vNow);
    }
  }

  function fire(el, type, ev = {}) {
    ev.preventDefault ??= () => {};
    (el.handlers[type] || []).forEach((h) => h(ev));
  }

  function centerPx(r, c) {
    const p = sandbox.app.view.gridToPixel(r, c);
    return { x: p.x + G.cell / 2, y: p.y + G.cell / 2 };
  }

  return {
    sandbox, flush, fire, centerPx, G,
    el: (id) => sandbox.document.getElementById(id),
    app: () => sandbox.app,
  };
}
