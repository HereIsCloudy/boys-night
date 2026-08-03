/**
 * Canvas particles.
 *
 * The loop only runs while particles are alive and stops dead when the array
 * empties. An always-on RAF is exactly the constant-repaint problem this repo
 * has already had to fix once.
 */

import { getState } from './state.js';

let canvas = null;
let ctx = null;
let running = false;
const parts = [];

function ensure() {
  if (canvas) return true;
  canvas = document.getElementById('particles');
  if (!canvas) return false;
  ctx = canvas.getContext('2d');
  resize();
  addEventListener('resize', resize, { passive: true });
  return true;
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function motionOK() {
  try { return !getState().settings.reduceMotion; } catch { return true; }
}

function start() {
  if (running) return;
  running = true;
  requestAnimationFrame(tick);
}

function tick() {
  if (!parts.length) {
    running = false;
    ctx?.clearRect(0, 0, innerWidth, innerHeight);
    return;   // loop stops entirely — no idle repaint
  }

  ctx.clearRect(0, 0, innerWidth, innerHeight);

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += p.gravity;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    p.rot += p.spin;

    if (p.life <= 0 || p.y > innerHeight + 60) { parts.splice(i, 1); continue; }

    const alpha = Math.min(1, p.life / p.fade);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    }
    ctx.restore();
  }

  requestAnimationFrame(tick);
}

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return ['--main', '--trim', '--accent', '--win-big', '--win-mega']
    .map(v => cs.getPropertyValue(v).trim())
    .filter(Boolean);
}

function emit(x, y, count, opts = {}) {
  if (!ensure() || !motionOK()) return;
  const colors = opts.colors ?? themeColors();
  const spread = opts.spread ?? Math.PI * 2;
  const baseAngle = opts.angle ?? -Math.PI / 2;

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    const speed = (opts.speed ?? 6) * (0.4 + Math.random() * 0.9);
    parts.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: opts.gravity ?? 0.22,
      drag: opts.drag ?? 0.985,
      size: (opts.size ?? 8) * (0.5 + Math.random()),
      color: colors[(Math.random() * colors.length) | 0],
      life: (opts.life ?? 70) * (0.6 + Math.random() * 0.7),
      fade: opts.life ?? 70,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.4 ? 'circle' : 'rect',
    });
  }
  // Hard cap so a long autospin session can't accumulate thousands.
  while (parts.length > 900) parts.shift();
  start();
}

export const Particles = {
  /** Celebration scaled to the win tier — same principle as everything else. */
  burst(tier, origin) {
    const rect = origin?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;

    switch (tier) {
      case 'dust':   emit(x, y, 6,   { speed: 3, size: 5, life: 40 }); break;
      case 'small':  emit(x, y, 22,  { speed: 5, size: 7, life: 55 }); break;
      case 'medium': emit(x, y, 60,  { speed: 8, size: 9, life: 75 }); break;
      case 'big':    emit(x, y, 150, { speed: 12, size: 11, life: 95 }); break;
      case 'mega':   Particles.fireworks(6); break;
    }
  },

  fireworks(bursts = 4) {
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        emit(
          innerWidth * (0.15 + Math.random() * 0.7),
          innerHeight * (0.15 + Math.random() * 0.45),
          90,
          { speed: 11, size: 10, life: 95, gravity: 0.15 }
        );
      }, i * 190);
    }
  },

  /** Coins raining from the top edge — used for pool collection. */
  rain(count = 40) {
    if (!ensure() || !motionOK()) return;
    for (let i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * 160,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 3 + Math.random() * 4,
        gravity: 0.14,
        drag: 0.998,
        size: 9 + Math.random() * 7,
        color: '#f5c518',
        life: 150,
        fade: 150,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.35,
        shape: 'circle',
      });
    }
    start();
  },

  clear() { parts.length = 0; },
};
