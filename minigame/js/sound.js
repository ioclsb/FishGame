// SoundManager ported from push-slide-match.html. All SFX stay synthesized;
// only the AudioContext factory changes to wx.createWebAudioContext()
// (base library >= 2.19.0). If WebAudio is unavailable the manager degrades
// to silent no-ops and never throws.
const storage = require('./storage.js');

class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.enabled = SoundManager.loadPref();
    this._unlocked = false;
  }

  // Call from the first user gesture (App wires this to touchstart).
  unlock() {
    this._initOnFirstUse();
    this._silentUnlock();
  }

  // wx.onShow resumes a suspended context (iOS).
  onShow() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _silentUnlock() {
    if (!this.ctx || !this.master || this._unlocked) return;
    try {
      // Android 上 WebAudio context 默认 suspended；部分基础库的 ctx 没有
      // state 属性，所以无条件 resume（对已 running 的 ctx 调用无害）
      if (this.ctx.resume) this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.master);
      src.start(0);
      this._unlocked = true;
    } catch (e) { /* non-fatal */ }
  }

  static loadPref() {
    try { return storage.get('psm.sound') !== 'off'; } catch (e) { return true; }
  }

  setEnabled(on) {
    this.enabled = on;
    try { storage.set('psm.sound', on ? 'on' : 'off'); } catch (e) {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.5 : 0.0001, this.ctx.currentTime, 0.02);
    }
    if (on) this._initOnFirstUse();
  }

  _initOnFirstUse() {
    if (this.ctx) {
      try { if (this.ctx.resume) this.ctx.resume(); } catch (e) {}
      return;
    }
    try {
      if (typeof wx === 'undefined' || !wx.createWebAudioContext) {
        console.warn('[sound] wx.createWebAudioContext 不可用，走静音模式');
        return;
      }
      this.ctx = wx.createWebAudioContext();
      console.log('[sound] ctx created, state=' + (this.ctx.state || 'n/a') +
        ', resume=' + typeof this.ctx.resume);
      // Android 上新建的 context 常为 suspended；部分基础库无 state 属性，
      // 所以无条件 resume（对 running 的 ctx 调用无害）
      try { if (this.ctx.resume) this.ctx.resume(); } catch (e) {}
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0.0001;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 24;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.25;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  _tone(freq, dur, type, vol, when = 0, slideTo = null, detuneCents = 0, atk = 0.012) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (detuneCents) osc.detune.value = detuneCents;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  _click(dur, vol, center, q, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    const tau = Math.max(1, this.ctx.sampleRate * dur * 0.2);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = center;
    bp.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  _noise(dur, vol, fFrom, fTo, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(fFrom, t0);
    bp.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // Fixed match anchor (see the web version's comment block).
  // (Assigned below the class: `static` class fields are avoided for the
  // DevTools Babel transpile path.)

  static tierForStreak(streak) {
    return Math.min(Math.max(1, Math.floor(streak || 1)), 3);
  }

  match(combo = 1) {
    this._initOnFirstUse();
    const tier = SoundManager.tierForStreak(combo);
    const f = SoundManager.MATCH_BASE;
    this._click(0.05, 0.28 + 0.05 * tier, 3800, 0.8);
    const tinks = 2 + tier;
    for (let i = 0; i < tinks; i++) {
      const base = f * (3.2 + Math.random() * 3.2);
      this._tone(
        base,
        0.06 + Math.random() * 0.03,
        'sine',
        0.12 + Math.random() * 0.05,
        i * 0.03 + Math.random() * 0.012,
        base * 0.88,
        Math.random() * 8 - 4,
        0.0015
      );
    }
  }

  release() {
    this._initOnFirstUse();
    this._tone(420, 0.13, 'sine', 0.16, 0, 270);
    this._noise(0.12, 0.05, 1600, 400);
  }

  click() {
    this._initOnFirstUse();
    this._tone(300, 0.08, 'sine', 0.12, 0, 210);
  }

  pick() {
    this._initOnFirstUse();
    this._tone(620, 0.07, 'triangle', 0.20, 0, 800, 0, 0.004);
  }

  ui() {
    this._initOnFirstUse();
    this._tone(820, 0.04, 'square', 0.06);
  }

  shuffleSfx() {
    this._initOnFirstUse();
    this._noise(0.28, 0.18, 300, 2400);
    this._tone(220, 0.18, 'sine', 0.10, 0.02, 330);
  }

  win() {
    this._initOnFirstUse();
    this._tone(130.81, 0.5, 'sine', 0.22, 0);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone(f, 0.22, 'triangle', 0.30, i * 0.11);
      this._tone(f * 2, 0.16, 'sine', 0.10, i * 0.11 + 0.03);
    });
    this._noise(0.5, 0.06, 6000, 11000, 0.33);
  }
}

SoundManager.MATCH_BASE = 659.25; // E5 anchor, tinks scatter ~3-6 octaves above

module.exports = { SoundManager };