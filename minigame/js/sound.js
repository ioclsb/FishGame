// SoundManager ported from push-slide-match.html. All SFX stay synthesized;
// only the AudioContext factory changes to wx.createWebAudioContext()
// (base library >= 2.19.0). If WebAudio is unavailable the manager degrades
// to silent no-ops and never throws.
const storage = require('./storage.js');

// 背景音乐：C 大调轻快循环旋律（0 表示休止，单位 Hz）
const BGM_STEP = 0.34; // 每步时长（八分音符，约 88 BPM）
const BGM_MELODY = [
  329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 329.63, 0,
  261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 0,
  440.00, 523.25, 587.33, 523.25, 440.00, 392.00, 440.00, 0,
  392.00, 440.00, 523.25, 587.33, 659.25, 587.33, 523.25, 0,
];
const BGM_STEPS = BGM_MELODY.length;
// 每 8 步一个低音垫：C - Am - F - G
const BGM_BASS = [130.81, 110.00, 174.61, 196.00];

class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.enabled = SoundManager.loadPref();
    this.musicOn = SoundManager.loadMusicPref();
    this._unlocked = false;
    this.bgmGain = null;
    this.bgmWanted = false;
    this._bgm = null;
  }


  // Call from the first user gesture (App wires this to touchstart).
  unlock() {
    this._initOnFirstUse();
    this._silentUnlock();
    if (this.musicOn) this.startBgm();
  }

  // wx.onShow resumes a suspended context (iOS).
  onShow() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.bgmWanted) this.startBgm();
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

  static loadMusicPref() {
    try { return storage.get('psm.music') !== 'off'; } catch (e) { return true; }
  }

  setEnabled(on) {
    this.enabled = on;
    try { storage.set('psm.sound', on ? 'on' : 'off'); } catch (e) {}
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 1.0 : 0.0001, this.ctx.currentTime, 0.02);
    }
    if (on) this._initOnFirstUse();
  }

  setMusic(on) {
    this.musicOn = on;
    try { storage.set('psm.music', on ? 'on' : 'off'); } catch (e) {}
    if (on) this.startBgm();
    else this.stopBgm();
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
      this.master.gain.value = this.enabled ? 1.0 : 0.0001;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -10;
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

  // ---- 背景音乐：轻快悠扬的 C 大调循环旋律（全程程序化合成，无需音频素材）----
  startBgm() {
    this._initOnFirstUse();
    this.bgmWanted = true;
    if (!this.ctx || !this.musicOn) return;
    if (this._bgm && this._bgm.timer) return;
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.2;
      // 音乐走独立增益，接到 comp（主总线之后），不受音效静音影响
      this.bgmGain.connect(this.comp);
    }
    const b = this._bgm = { step: 0, nextTime: this.ctx.currentTime + 0.12, timer: null };
    b.timer = setInterval(() => this._bgmSched(), 60);
    this._bgmSched();
  }

  // 仅暂停调度（保留 bgmWanted），用于前后台切换省电
  pauseBgm() {
    if (this._bgm && this._bgm.timer) {
      clearInterval(this._bgm.timer);
      this._bgm.timer = null;
    }
    this._bgm = null;
  }

  stopBgm() {
    this.bgmWanted = false;
    this.pauseBgm();
  }

  _bgmSched() {
    if (!this.ctx || !this._bgm) return;
    const ahead = 0.25;
    while (this._bgm.nextTime < this.ctx.currentTime + ahead) {
      this._bgmNoteAt(this._bgm.step, this._bgm.nextTime);
      this._bgm.step = (this._bgm.step + 1) % BGM_STEPS;
      this._bgm.nextTime += BGM_STEP;
    }
  }

  _bgmNoteAt(step, when) {
    const f = BGM_MELODY[step];
    if (f) {
      // 主旋律：温暖的三角波，柔起柔落
      this._bgmTone(f, BGM_STEP * 0.92, 'triangle', 0.5, when, 0.02, 0.14);
      // 每四步点缀一记高八度正弦，增添“亮晶晶”的轻快感
      if (step % 4 === 0) this._bgmTone(f * 2, BGM_STEP * 0.5, 'sine', 0.16, when, 0.01, 0.12);
    }
    // 每 8 步换一个和弦低音垫（C - Am - F - G）
    if (step % 8 === 0) {
      const bass = BGM_BASS[(step / 8) % BGM_BASS.length];
      this._bgmTone(bass, BGM_STEP * 7.4, 'sine', 0.42, when, 0.04, 0.6);
    }
  }

  _bgmTone(freq, dur, type, vol, when, atk = 0.02, rel = 0.12) {
    if (!this.ctx || !this.bgmGain) return;
    const t0 = when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
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
    // 轻快灵动：明亮正弦上滑作主音，叠高八度点缀，连击再升一档
    this._tone(740, 0.12, 'sine', 0.26, 0, 980, 0, 0.008);
    this._tone(1100, 0.10, 'sine', 0.16, 0.05, 1320, 0, 0.008);
    if (tier > 1) this._tone(1480, 0.09, 'sine', 0.12, 0.10, 1660);
  }

  release() {
    this._initOnFirstUse();
    this._tone(420, 0.13, 'sine', 0.28, 0, 270);
    this._noise(0.12, 0.10, 1600, 400);
  }

  click() {
    this._initOnFirstUse();
    // 点击音效：整体偏小，频率提亮、音量上调，手机上更清脆可闻
    this._tone(460, 0.09, 'sine', 0.36, 0, 300);
  }

  pick() {
    this._initOnFirstUse();
    this._tone(620, 0.07, 'triangle', 0.30, 0, 800, 0, 0.004);
  }

  ui() {
    this._initOnFirstUse();
    this._tone(820, 0.04, 'square', 0.14);
  }

  shuffleSfx() {
    this._initOnFirstUse();
    this._noise(0.28, 0.26, 300, 2400);
    this._tone(220, 0.18, 'sine', 0.16, 0.02, 330);
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

module.exports = { SoundManager };