import { getState } from './state.js';
import { Events } from './events.js';

export function initHUD() {
  Events.on('balance:update', refresh);
  Events.on('streak:update', refresh);
  Events.on('level:up', refresh);
  Events.on('skills:update', refresh);
  refresh();
}

export function refresh() {
  const s = getState();
  const bal = document.getElementById('hud-balance');
  const streak = document.getElementById('hud-streak');
  const session = document.getElementById('hud-session');
  const level = document.getElementById('hud-level');
  const lobbyBal = document.getElementById('lobby-balance');
  const spBadge = document.getElementById('skill-points-badge');

  if (bal) bal.textContent = fmt(s.balance);
  if (lobbyBal) lobbyBal.textContent = fmt(s.balance);
  if (streak) {
    streak.textContent = s.currentWinStreak > 0 ? `${s.currentWinStreak} 🔥` : '0';
  }
  if (session) {
    const p = s.sessionProfit;
    session.textContent = (p >= 0 ? '+' : '') + fmt(p);
    session.className = 'hud-session ' + (p > 0 ? 'positive' : p < 0 ? 'negative' : 'neutral');
  }
  if (level) level.textContent = s.level;
  if (spBadge) spBadge.textContent = `${s.skillPoints} SP`;

  const passive = document.getElementById('hud-passive');
  if (passive) {
    const amt = 5 + Math.floor(s.level / 5);
    passive.textContent = `+${amt}/10s`;
  }
}

function fmt(n) {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? (abs / 1e9).toFixed(2) + 'B' :
            abs >= 1e6 ? (abs / 1e6).toFixed(2) + 'M' :
            abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'K' :
            Math.floor(abs).toString();
  return n < 0 ? '-' + s : s;
}
