/**
 * Web Audio. No asset files — every sound is synthesised, which keeps the
 * whole game a handful of text files.
 *
 * The win ladder matters: each matching symbol in a line plays one semitone
 * higher than the last. That rising pitch is doing a lot of the dopamine work.
 */

import { getState } from './state.js';

let ctx = null;
let master = null;
let broken = false;

function audio() {
  if (ctx || broken) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { broken = true; return null; }
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch (err) {
    // Autoplay policy, no output device, headless browser — never let sound
    // failing take a caller down with it.
    broken = true;
    ctx = null;
    console.warn('[audio] disabled:', err?.message ?? err);
  }
  return ctx;
}

function enabled() {
  try { return getState().settings.sound; } catch { return true; }
}

function tone(freq, duration = 0.12, type = 'square', gain = 1, delay = 0) {
  if (!enabled()) return;
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume();

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function sweep(from, to, duration, type = 'sawtooth', gain = 0.6, delay = 0) {
  if (!enabled()) return;
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume();

  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(duration = 0.14, gain = 0.35, delay = 0) {
  if (!enabled()) return;
  const c = audio();
  if (!c) return;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buffer;
  g.gain.value = gain;
  src.connect(g);
  g.connect(master);
  src.start(c.currentTime + delay);
}

export const Audio = {
  unlock() { const c = audio(); if (c?.state === 'suspended') c.resume(); },

  click()     { tone(680, 0.05, 'square', 0.5); },
  spinStart() { sweep(220, 460, 0.18, 'sawtooth', 0.35); },
  reelStop(i = 0) { tone(150 + i * 22, 0.07, 'square', 0.65); noise(0.05, 0.16); },

  /** Rising ladder — one note per matching symbol. */
  winLadder(count) {
    for (let i = 0; i < count; i++) {
      tone(392 * Math.pow(2, i / 12) * 1.5, 0.1, 'square', 0.55, i * 0.075);
    }
  },

  dust()   { tone(520, 0.08, 'triangle', 0.4); },
  small()  { Audio.winLadder(3); },
  medium() { Audio.winLadder(4); sweep(400, 1200, 0.4, 'sawtooth', 0.3, 0.25); },

  big() {
    Audio.winLadder(5);
    sweep(300, 1600, 0.7, 'sawtooth', 0.4, 0.3);
    [0, 0.12, 0.24].forEach((d, i) => tone(660 + i * 220, 0.22, 'square', 0.5, 0.55 + d));
  },

  /** Silence, then detonation. The pause is what sells it. */
  mega() {
    noise(0.3, 0.5);
    sweep(80, 60, 0.5, 'sine', 0.7);
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => tone(f, 0.5, 'square', 0.55, 0.55 + i * 0.1));
    sweep(200, 3000, 1.4, 'sawtooth', 0.35, 0.55);
  },

  feature() {
    [523, 587, 659, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.6, i * 0.1));
  },

  coin()  { tone(1050, 0.06, 'square', 0.4); tone(1400, 0.07, 'square', 0.3, 0.03); },
  buy()   { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.5, i * 0.07)); },
  error() { tone(160, 0.2, 'sawtooth', 0.4); },
};
