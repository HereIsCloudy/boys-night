import { getState, getEquippedBonus } from './state.js';
import { Events } from './events.js';

let _prevBal = null;

export function initHUD() {
  Events.on('balance:update', refresh);
  Events.on('streak:update', refresh);
  Events.on('level:up', refresh);
  Events.on('skills:update', refresh);
  refresh();
}

export function refresh() {
  const s = getState();

  // ── Balance (animated countup + flash) ──────────────────────────────────────
  const newBal = s.balance;
  const balEls = [
    document.getElementById('hud-balance'),
    document.getElementById('lobby-balance'),
  ].filter(Boolean);

  if (_prevBal !== null && _prevBal !== newBal) {
    const isUp = newBal > _prevBal;
    balEls.forEach(el => flashEl(el, isUp));
    balEls.forEach(el => animateNum(el, _prevBal, newBal));
  } else {
    balEls.forEach(el => { el.textContent = fmt(newBal); });
  }
  _prevBal = newBal;

  // ── Session profit under lobby balance ───────────────────────────────────────
  const sessionProfit = document.getElementById('lobby-profit');
  if (sessionProfit) {
    const p = s.sessionProfit;
    sessionProfit.textContent = (p >= 0 ? '+' : '') + fmt(p) + ' this session';
    sessionProfit.className = 'balance-hero-profit ' + (p > 0 ? 'pos' : p < 0 ? 'neg' : 'neu');
  }

  // ── HUD elements ─────────────────────────────────────────────────────────────
  const streak  = document.getElementById('hud-streak');
  const session = document.getElementById('hud-session');
  const level   = document.getElementById('hud-level');
  const spBadge = document.getElementById('skill-points-badge');
  const passive = document.getElementById('hud-passive');

  if (streak) streak.textContent = s.currentWinStreak > 0 ? `${s.currentWinStreak} 🔥` : '0';
  if (session) {
    const p = s.sessionProfit;
    session.textContent = (p >= 0 ? '+' : '') + fmt(p);
    session.className = 'hud-session ' + (p > 0 ? 'positive' : p < 0 ? 'negative' : 'neutral');
  }
  if (level)   level.textContent   = s.level;
  if (spBadge) spBadge.textContent = `${s.skillPoints} SP`;
  if (passive) {
    const amt = Math.round((5 + Math.floor(s.level / 5)) * (1 + getEquippedBonus('passive_income') / 100));
    passive.textContent = `+${amt}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flashEl(el, positive) {
  const cls = positive ? 'bal-flash-up' : 'bal-flash-down';
  el.classList.remove('bal-flash-up', 'bal-flash-down');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

function animateNum(el, from, to) {
  const dur = Math.min(800, 150 + Math.abs(to - from) * 0.25);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(from + (to - from) * ease));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fmt(n) {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? (abs / 1e9).toFixed(2) + 'B' :
            abs >= 1e6 ? (abs / 1e6).toFixed(2) + 'M' :
            abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'K' :
            Math.floor(abs).toString();
  return n < 0 ? '-' + s : s;
}
