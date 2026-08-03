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

/**
 * The active machine's musical voice.
 *
 * Every win sound is built from a root note, a waveform and a scale, so each
 * cabinet has its own character instead of all five sharing one beep. The
 * default is only used before a machine is opened.
 */
let voice = { root: 392, wave: 'square', scale: [0, 2, 4, 7, 9, 12] };

/** Semitone `n` of the current machine's scale, in Hz. */
function note(step, octave = 0) {
  const scale = voice.scale;
  const semis = scale[step % scale.length] + 12 * (octave + Math.floor(step / scale.length));
  return voice.root * Math.pow(2, semis / 12);
}

export const Audio = {
  unlock() { const c = audio(); if (c?.state === 'suspended') c.resume(); },

  /** Called when a machine opens so its wins sound like that machine. */
  setVoice(profile) {
    if (profile?.root && profile?.scale?.length) voice = profile;
  },

  click()     { tone(680, 0.05, 'square', 0.5); },
  spinStart() { sweep(220, 460, 0.18, 'sawtooth', 0.35); },
  reelStop(i = 0) { tone(150 + i * 22, 0.07, 'square', 0.65); noise(0.05, 0.16); },

  /** Rising run up the machine's own scale — one note per matching symbol. */
  winLadder(count) {
    for (let i = 0; i < count; i++) {
      tone(note(i, 1), 0.1, voice.wave, 0.55, i * 0.075);
    }
  },

  dust()   { tone(note(0, 1), 0.08, 'triangle', 0.4); },
  small()  { Audio.winLadder(3); },
  medium() { Audio.winLadder(4); sweep(note(0, 1), note(0, 2), 0.4, voice.wave, 0.3, 0.25); },

  big() {
    Audio.winLadder(5);
    sweep(note(0), note(0, 2), 0.7, 'sawtooth', 0.4, 0.3);
    [0, 1, 2].forEach(i => tone(note(i + 2, 1), 0.22, voice.wave, 0.5, 0.55 + i * 0.12));
  },

  /** Silence, then detonation. The pause is what sells it. */
  mega() {
    noise(0.3, 0.5);
    sweep(note(0) / 4, note(0) / 5, 0.5, 'sine', 0.7);
    for (let i = 0; i < 6; i++) tone(note(i, 1), 0.5, voice.wave, 0.55, 0.55 + i * 0.1);
    sweep(note(0), note(0, 3), 1.4, 'sawtooth', 0.35, 0.55);
  },

  feature() {
    for (let i = 0; i < 4; i++) tone(note(i), 0.2, voice.wave, 0.6, i * 0.1);
  },

  coin()  { tone(1050, 0.06, 'square', 0.4); tone(1400, 0.07, 'square', 0.3, 0.03); },

  /** A Plinko peg. Pitch climbs as the ball falls, so the drop has an arc. */
  peg(row = 0) {
    tone(700 + row * 26, 0.035, 'square', 0.28);
  },

  /**
   * The build while a reel that could complete a trigger is still spinning.
   * Rises with each reel so the tension escalates rather than just repeating.
   */
  anticipate(reelIndex = 2) {
    const base = note(0, 0) * (1 + reelIndex * 0.12);
    sweep(base, base * 2.2, 1.1, 'sawtooth', 0.28);
    for (let i = 0; i < 5; i++) tone(base * 2, 0.05, 'square', 0.22, i * 0.16);
  },

  /** Two scatters, no third. A deflating fall, so the miss lands as a miss. */
  nearMiss() {
    sweep(note(2, 1), note(0, 0), 0.5, 'sawtooth', 0.3);
    tone(note(0, 0) / 2, 0.3, 'sine', 0.35, 0.18);
  },

  /**
   * One rung of the win rollup. Each upgrade climbs the machine's own scale,
   * so the escalation from WIN to BOYS NIGHT is in that cabinet's key.
   */
  rung(index) {
    const base = note(index, 0);
    tone(base, 0.13, voice.wave, 0.5);
    tone(base * 1.5, 0.16, 'triangle', 0.35, 0.04);
    // The top rungs earn a riser on top of the note.
    if (index >= 5) sweep(base, base * 3, 0.5, 'sawtooth', 0.3, 0.05);
  },
  buy()   { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.5, i * 0.07)); },
  error() { tone(160, 0.2, 'sawtooth', 0.4); },
};
