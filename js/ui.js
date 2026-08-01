import { getState } from './state.js';
import { Events } from './events.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { refresh as hudRefresh } from './hud.js';

// ── Navigation ───────────────────────────────────────────────────────────────
const views = {};
export function registerView(id, el) { views[id] = el; }

export function showView(id) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  if (views[id]) views[id].classList.add('active');
}

// ── Modals ───────────────────────────────────────────────────────────────────
export function openModal(name) {
  const el = document.getElementById(`modal-${name}`);
  if (el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
}

export function closeModal(name) {
  const el = document.getElementById(`modal-${name}`);
  if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 2800) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration + 400);
}

// ── Jackpot overlay ───────────────────────────────────────────────────────────
export function showJackpot(amount) {
  const overlay = document.getElementById('jackpot-overlay');
  const amtEl = document.getElementById('jpo-amount');
  if (!overlay || !amtEl) return;
  amtEl.textContent = '+' + fmtNum(amount);
  overlay.classList.remove('hidden');
  Audio.jackpot();
  Particles.fireworks(10);
  Particles.screenFlash('#f59e0b');
  const btn = document.getElementById('jpo-collect');
  btn.onclick = () => { overlay.classList.add('hidden'); };
}

// ── Item drop overlay ─────────────────────────────────────────────────────────
export function showItemDrop(item, onCollect) {
  const overlay  = document.getElementById('item-overlay');
  const card     = document.getElementById('ito-card');
  const rarityEl = document.getElementById('ito-rarity');
  const iconEl   = document.getElementById('ito-icon');
  const nameEl   = document.getElementById('ito-name');
  const slotEl   = document.getElementById('ito-slot');
  const statsEl  = document.getElementById('ito-stats');
  const btn      = document.getElementById('ito-collect');
  if (!overlay) return;

  rarityEl.textContent = item.rarity.replace('chaosDivine', 'CHAOS DIVINE').toUpperCase();
  rarityEl.className = `ito-rarity rarity-${item.rarity}`;
  iconEl.textContent = item.icon;
  nameEl.textContent = item.name;
  slotEl.textContent = item.slot.charAt(0).toUpperCase() + item.slot.slice(1).replace(/\d/,'');
  statsEl.innerHTML = '';
  card.className = `ito-card border-${item.rarity}`;

  item.stats.forEach((st, i) => {
    const line = document.createElement('div');
    line.className = 'ito-stat-line';
    line.textContent = st.label;
    line.style.animationDelay = `${0.2 + i * 0.12}s`;
    statsEl.appendChild(line);
  });

  overlay.classList.remove('hidden');
  Audio.itemDrop(item.rarity);
  Particles.rarityBurst(item.rarity, window.innerWidth / 2, window.innerHeight / 2);

  btn.onclick = () => {
    overlay.classList.add('hidden');
    if (onCollect) onCollect();
  };
}

// ── Level up overlay ──────────────────────────────────────────────────────────
export function showLevelUp(level) {
  const el = document.getElementById('levelup-overlay');
  const lv = document.getElementById('lu-level');
  if (!el) return;
  if (lv) lv.textContent = `Level ${level}`;
  el.classList.remove('hidden');
  Audio.levelUp();
  Particles.fireworks(4);
  setTimeout(() => el.classList.add('hidden'), 2400);
}

// ── Game lobby ────────────────────────────────────────────────────────────────
const GAME_DEFS = [
  { id: 'slots',    icon: '🎰', name: 'Slots',          desc: '5-reel madness. Wilds, multipliers, jackpots.',   badge: 'Most addictive' },
  { id: 'crash',    icon: '📈', name: 'Crash',          desc: 'Watch the multiplier climb. Cash out before it explodes.', badge: 'High variance' },
  { id: 'coinflip', icon: '🪙', name: 'Coin Flip Gauntlet', desc: 'Chain wins for insane streak multipliers.', badge: 'Pure RNG' },
  { id: 'wheel',    icon: '🌀', name: 'Chaos Wheel',    desc: 'Spin the 24-segment wheel. Jackpot: 25× your bet.', badge: '25× max' },
  { id: 'dice',     icon: '🎲', name: 'Dice Den',        desc: 'Roll 2–6 dice. Bet on sums, faces, even/odd.', badge: 'Strategic' },
];

export function renderLobby() {
  const grid = document.getElementById('game-grid');
  if (!grid) return;
  grid.innerHTML = '';
  GAME_DEFS.forEach(g => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.game = g.id;
    card.innerHTML = `
      <div class="gc-icon">${g.icon}</div>
      <div class="gc-name">${g.name}</div>
      <div class="gc-desc">${g.desc}</div>
      <div class="gc-badge">${g.badge}</div>`;
    card.addEventListener('click', () => { Audio.click(); showView(g.id); });
    grid.appendChild(card);
  });
  // Riley Cards tile — opens the collection (reuses the wired HUD button)
  const cardsTile = document.createElement('div');
  cardsTile.className = 'game-card';
  cardsTile.dataset.game = 'cards';
  cardsTile.innerHTML = `
    <div class="gc-icon">🃏</div>
    <div class="gc-name">Riley Cards</div>
    <div class="gc-desc">Collect all 105 Riley cards. Packs, boosts, insanely rare pulls.</div>
    <div class="gc-badge">★ COLLECT ★</div>`;
  cardsTile.addEventListener('click', () => {
    Audio.click();
    document.getElementById('btn-cards')?.click();
  });
  grid.appendChild(cardsTile);
  renderQuickStats();
}

function renderQuickStats() {
  const s = getState();
  const el = document.getElementById('quick-stats');
  if (!el) return;
  const items = [
    { label: 'Net Profit',    value: (s.totalWon - s.totalLost).toFixed(0), color: s.totalWon >= s.totalLost ? '#10b981' : '#ef4444' },
    { label: 'Total Wagered', value: fmtNum(s.totalWagered), color: '#f59e0b' },
    { label: 'Best Streak',   value: s.bestWinStreak,        color: '#ec4899' },
    { label: 'Jackpots Hit',  value: s.jackpotsHit,          color: '#a855f7' },
    { label: 'Level',         value: s.level,                color: '#06b6d4' },
    { label: 'Items Owned',   value: s.inventory.length + Object.values(s.equipped).filter(Boolean).length, color: '#fb923c' },
  ];
  el.innerHTML = items.map(i => `
    <div class="qs-card">
      <div class="qs-label">${i.label}</div>
      <div class="qs-value" style="color:${i.color}">${i.value}</div>
    </div>`).join('');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export function fmtNum(n) {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? (abs / 1e9).toFixed(2) + 'B' :
            abs >= 1e6 ? (abs / 1e6).toFixed(2) + 'M' :
            abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'K' :
            Math.round(abs).toString();
  return n < 0 ? '-' + s : s;
}

export function makeBetRow(defaultBet, onBetChange) {
  const row = document.createElement('div');
  row.className = 'bet-row';
  row.innerHTML = `
    <span class="bet-label">Bet:</span>
    <input type="number" class="bet-input" id="bet-input" min="1" value="${defaultBet}" />
    <div class="bet-quick">
      <button class="bet-qbtn" data-mult="0.5">½</button>
      <button class="bet-qbtn" data-mult="2">2×</button>
      <button class="bet-qbtn" data-val="100">100</button>
      <button class="bet-qbtn" data-val="500">500</button>
      <button class="bet-qbtn" data-max="1">Max</button>
    </div>`;
  const input = row.querySelector('#bet-input');
  input.addEventListener('input', () => { if (onBetChange) onBetChange(parseInt(input.value) || 1); });
  row.querySelectorAll('.bet-qbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      Audio.click();
      const s = getState();
      if (btn.dataset.mult) input.value = Math.max(1, Math.floor((parseInt(input.value) || 1) * parseFloat(btn.dataset.mult)));
      else if (btn.dataset.val) input.value = btn.dataset.val;
      else if (btn.dataset.max) input.value = Math.max(1, s.balance);
      input.value = Math.min(parseInt(input.value), s.balance);
      if (onBetChange) onBetChange(parseInt(input.value));
    });
  });
  return { row, getbet: () => Math.max(1, Math.min(parseInt(input.value) || 1, getState().balance)) };
}
