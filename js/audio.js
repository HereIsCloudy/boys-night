import { getState } from './state.js';

let _ctx = null;
let _master = null;

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 0.35;
    _master.connect(_ctx.destination);
  }
  return _ctx;
}

function resume() { try { if (ctx().state === 'suspended') ctx().resume(); } catch {} }

function tone(freq, type, dur, vol = 0.3, delay = 0, freqEnd = null) {
  try {
    resume();
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(_master);
    osc.type = type; osc.frequency.value = freq;
    if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, c.currentTime + delay + dur);
    gain.gain.setValueAtTime(vol, c.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + dur + 0.01);
  } catch {}
}

function noise(dur, vol = 0.15, delay = 0) {
  try {
    resume();
    const c = ctx();
    const bufLen = c.sampleRate * dur;
    const buf = c.createBuffer(1, bufLen, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    src.connect(gain); gain.connect(_master);
    gain.gain.setValueAtTime(vol, c.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    src.start(c.currentTime + delay);
  } catch {}
}

export const Audio = {
  enabled() { return getState().settings.sound; },

  click()    { if (!this.enabled()) return; tone(600, 'sine', 0.06, 0.15); },
  hover()    { if (!this.enabled()) return; tone(800, 'sine', 0.03, 0.08); },

  win() {
    if (!this.enabled()) return;
    [523, 659, 784].forEach((f, i) => tone(f, 'sine', 0.18, 0.3, i * 0.09));
  },

  bigWin() {
    if (!this.enabled()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.25, 0.4, i * 0.07));
    tone(1568, 'sine', 0.35, 0.5, 0.32);
  },

  jackpot() {
    if (!this.enabled()) return;
    const freqs = [523, 659, 784, 1047, 1319, 1568, 2093];
    freqs.forEach((f, i) => tone(f, 'sine', 0.4, 0.45, i * 0.06));
    setTimeout(() => freqs.forEach((f, i) => tone(f * 1.5, 'triangle', 0.3, 0.4, i * 0.05)), 600);
    noise(0.3, 0.08);
  },

  lose() {
    if (!this.enabled()) return;
    tone(250, 'sawtooth', 0.12, 0.2);
    tone(180, 'sawtooth', 0.18, 0.25, 0.12);
  },

  spin() {
    if (!this.enabled()) return;
    tone(150, 'sine', 0.5, 0.12, 0, 500);
  },

  reelStop() {
    if (!this.enabled()) return;
    tone(350, 'square', 0.08, 0.12);
    noise(0.06, 0.08);
  },

  coin() {
    if (!this.enabled()) return;
    tone(1200, 'sine', 0.06, 0.2);
    tone(900, 'sine', 0.08, 0.15, 0.05);
  },

  flip() {
    if (!this.enabled()) return;
    tone(300, 'triangle', 0.15, 0.25, 0, 800);
    noise(0.15, 0.06);
  },

  crash() {
    if (!this.enabled()) return;
    tone(200, 'sawtooth', 0.08, 0.3, 0, 50);
    noise(0.4, 0.25, 0.05);
  },

  cashout() {
    if (!this.enabled()) return;
    [400, 600, 900, 1200].forEach((f, i) => tone(f, 'sine', 0.15, 0.35, i * 0.06));
  },

  tick() {
    if (!this.enabled()) return;
    tone(1000, 'square', 0.03, 0.08);
  },

  wheelTick() {
    if (!this.enabled()) return;
    tone(600, 'triangle', 0.03, 0.07);
  },

  wheelStop() {
    if (!this.enabled()) return;
    [440, 660, 880].forEach((f, i) => tone(f, 'sine', 0.2, 0.35, i * 0.08));
  },

  rollDice() {
    if (!this.enabled()) return;
    for (let i = 0; i < 5; i++) noise(0.04, 0.12, i * 0.05);
  },

  levelUp() {
    if (!this.enabled()) return;
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 'triangle', 0.3, 0.45, i * 0.09));
  },

  itemDrop(rarity) {
    if (!this.enabled()) return;
    const freqMap = { common: 440, uncommon: 550, rare: 660, epic: 800, legendary: 1050, divine: 1320, chaosDivine: 1760 };
    const f = freqMap[rarity] ?? 440;
    tone(f, 'sine', 0.5, 0.5);
    tone(f * 1.5, 'sine', 0.35, 0.4, 0.25);
    if (rarity === 'legendary' || rarity === 'divine' || rarity === 'chaosDivine') {
      noise(0.2, 0.1, 0.1);
    }
  },

  setVolume(v) { try { if (_master) _master.gain.value = v; } catch {} },
};
