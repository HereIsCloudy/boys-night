import { getState } from './state.js';

const canvas = document.getElementById('particles-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let particles = [];
let raf = null;

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function loop() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  if (!particles.length) { raf = null; return; }  // stop when idle — no wasted frames
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
    p.life -= p.decay; p.vx *= 0.99;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    if (p.type === 'circle') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'coin') {
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * 0.5, p.rot, 0, Math.PI * 2); ctx.fill();
      p.rot += 0.15;
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }
  raf = requestAnimationFrame(loop);
}

function ensureLoop() { if (!raf) loop(); }

function rnd(min, max) { return min + Math.random() * (max - min); }

export const Particles = {
  coinShower(x, y, count = 25) {
    if (!getState().settings.particles) return;
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y, vx: rnd(-6, 6), vy: rnd(-12, -2), gravity: 0.4,
        life: 1, decay: rnd(0.015, 0.03), size: rnd(6, 12),
        color: `hsl(${rnd(40, 55)}, 90%, ${rnd(55, 75)}%)`,
        type: 'coin', rot: rnd(0, Math.PI),
      });
    }
    ensureLoop();
  },

  sparkle(x, y, color = '#a855f7', count = 15) {
    if (!getState().settings.particles) return;
    for (let i = 0; i < count; i++) {
      const angle = rnd(0, Math.PI * 2);
      const speed = rnd(2, 8);
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 0.1, life: 1, decay: rnd(0.02, 0.04), size: rnd(3, 7),
        color, type: 'circle',
      });
    }
    ensureLoop();
  },

  fireworks(count = 8) {
    if (!getState().settings.particles) return;
    const colors = ['#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#10b981', '#ef4444'];
    for (let b = 0; b < count; b++) {
      const cx = rnd(100, canvas.width - 100);
      const cy = rnd(60, canvas.height * 0.5);
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const speed = rnd(4, 12);
        particles.push({
          x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          gravity: 0.15, life: 1, decay: rnd(0.012, 0.025), size: rnd(3, 6),
          color, type: 'circle',
        });
      }
    }
    ensureLoop();
  },

  screenFlash(color = '#f59e0b') {
    if (!getState().settings.particles) return;
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;inset:0;background:${color};opacity:0.18;pointer-events:none;z-index:250;animation:screen-flash .4s ease forwards`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
  },

  rarityBurst(rarity, x, y) {
    const colorMap = {
      common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6',
      epic: '#a855f7', legendary: '#f59e0b', divine: '#fb923c', chaosDivine: '#ff00ff',
    };
    const color = colorMap[rarity] ?? '#a855f7';
    const count = { common: 10, uncommon: 15, rare: 20, epic: 30, legendary: 45, divine: 60, chaosDivine: 80 }[rarity] ?? 20;
    this.sparkle(x, y, color, count);
    if (rarity === 'legendary' || rarity === 'divine' || rarity === 'chaosDivine') this.fireworks(3);
    if (rarity === 'chaosDivine') this.fireworks(6);
  },

  floatNumber(x, y, text, color = '#f59e0b') {
    const el = document.createElement('span');
    el.className = 'float-num';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  },
};
