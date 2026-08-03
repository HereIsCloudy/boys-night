/** Boot, routing, and the persistent HUD. */

import { getState, accruePool, collectPool, msUntilNextDrop, checkBrokeRelief,
         endSession, tickPlaytime, save } from './state.js';
import { applyTheme, applyMotion, ensureSeeds, renderSettings } from './settings.js';
import { renderLobby } from './lobby.js';
import { renderGame, teardownGame } from './game.js';
import { renderStats } from './stats.js';
import { renderShop } from './shop.js';
import { renderLogin } from './login.js';
import { initAuth, hasOnboarded, isSignedIn, currentUser } from './auth.js';
import { renderLeaderboards, invalidateBoards } from './leaderboard.js';
import { checkAchievements, achievementProgress } from './achievements.js';
import { queueSync, installUnloadSync, flush, pullCloudSave, claimTag } from './sync.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { fmt, fmtFull, fmtClock, toast } from './ui.js';
import { Events } from './events.js';

const app = () => document.getElementById('app');

let currentView = 'menu';
let currentMachine = null;
let playtimeTimer = null;

// ── Routing ──────────────────────────────────────────────────────────────────

const VIEWS = {
  login:       (root) => renderLogin(root, () => showView('menu')),
  menu:        renderMenu,
  lobby:       root => renderLobby(root, id => showView('game', id)),
  game:        (root, id) => renderGame(root, id),
  stats:       renderStats,
  leaderboard: renderLeaderboards,
  shop:        renderShop,
  settings:    renderSettings,
};

export function showView(name, arg) {
  if (currentView === 'game' && name !== 'game') teardownGame();

  currentView = name;
  currentMachine = name === 'game' ? arg : null;

  const root = app();
  root.innerHTML = '';
  const view = document.createElement('div');
  view.className = name === 'login' ? '' : 'view';
  root.appendChild(view);

  renderHud();
  VIEWS[name]?.(view, arg);

  if (name === 'leaderboard') invalidateBoards();
  location.hash = name === 'game' ? `#game/${arg}` : `#${name}`;
  scrollTo({ top: 0 });
}

function routeFromHash() {
  // The login screen is the front door: until it is done, nothing else routes.
  if (!hasOnboarded()) return showView('login');

  const raw = location.hash.slice(1);
  if (!raw || raw === 'login') return showView('menu');
  const [name, arg] = raw.split('/');
  if (VIEWS[name] && name !== 'login') showView(name, arg);
  else showView('menu');
}

// ── HUD ──────────────────────────────────────────────────────────────────────

function renderHud() {
  let hud = document.getElementById('hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'hud';
    document.body.insertBefore(hud, document.getElementById('app'));
  }

  if (currentView === 'menu' || currentView === 'login') { hud.classList.add('hidden'); return; }
  hud.classList.remove('hidden');

  const s = getState();
  hud.innerHTML = `
    <button class="hud-back" id="hud-back">← ${currentView === 'game' ? 'Machines' : 'Menu'}</button>
    <span class="hud-spacer"></span>
    <span class="hud-chip pool" id="hud-pool" title="Collect the pool">
      <span class="label">Pool</span>
      <span class="num" id="pool-value">0</span>
    </span>
    <span class="hud-chip">
      <span class="label">Coins</span>
      <span class="num" id="balance-value">${fmtFull(s.balance)}</span>
    </span>`;

  document.getElementById('hud-back').onclick = () => {
    Audio.click();
    showView(currentView === 'game' ? 'lobby' : 'menu');
  };
  document.getElementById('hud-pool').onclick = onCollectPool;
  updatePoolChip();
}

function updateBalanceChip(balance) {
  const el = document.getElementById('balance-value');
  if (el) el.textContent = fmtFull(balance);
}

/** Little pop on the counter whenever money lands. */
function bumpBalanceChip() {
  const chip = document.getElementById('balance-value')?.parentElement;
  if (!chip) return;
  chip.classList.remove('bumped');
  void chip.offsetWidth;   // restart the animation
  chip.classList.add('bumped');
}

function updatePoolChip() {
  const chip = document.getElementById('hud-pool');
  const value = document.getElementById('pool-value');
  if (!chip || !value) return;

  const s = getState();
  const ready = s.poolAmount > 0;
  value.textContent = ready
    ? fmt(s.poolAmount)
    : fmtClock(msUntilNextDrop());
  chip.classList.toggle('ready', ready);
  chip.title = ready ? 'Collect the pool' : 'Next drop';
}

function onCollectPool() {
  const amount = collectPool();
  if (amount <= 0) {
    toast(`Next drop in ${fmtClock(msUntilNextDrop())}`);
    return;
  }
  Audio.coin();
  Particles.rain(Math.min(70, 20 + amount / 100));
  toast(`+${fmtFull(amount)} collected`, 'win');
  updatePoolChip();
  checkAchievements();
  queueSync();
}

// ── Main menu ────────────────────────────────────────────────────────────────

function renderMenu(root) {
  const s = getState();
  const ach = achievementProgress();

  root.innerHTML = `
    <div class="menu">
      <h1 class="menu-title display">
        <span class="rainbow-text glow">Boys</span>
        <span class="line-2">Night</span>
      </h1>
      <p class="menu-sub">Five machines. Terrible odds. One leaderboard.</p>

      <div class="menu-buttons">
        <button class="menu-btn" data-go="lobby">
          <span class="icon">🎰</span> Play
          <span class="sub">5 machines</span>
        </button>
        <button class="menu-btn" data-go="leaderboard">
          <span class="icon">🏆</span> Leaderboards
          <span class="sub">${s.biggestWin ? fmt(s.biggestWin.amount) + ' best' : 'unranked'}</span>
        </button>
        <button class="menu-btn" data-go="stats">
          <span class="icon">📊</span> Stats
          <span class="sub">${fmtFull(s.totalSpins)} spins · ${ach.earned}/${ach.total}</span>
        </button>
        <button class="menu-btn" data-go="shop">
          <span class="icon">🛒</span> Shop
          <span class="sub">${s.autospin ? 'autospin owned' : 'autospin locked'}</span>
        </button>
        <button class="menu-btn" data-go="settings">
          <span class="icon">⚙️</span> Settings
          <span class="sub">theme &amp; sound</span>
        </button>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <span class="hud-chip">
          <span class="label">Coins</span>
          <span class="num" id="menu-balance">${fmtFull(s.balance)}</span>
        </span>
        <span class="hud-chip pool ${s.poolAmount > 0 ? 'ready' : ''}" id="menu-pool">
          <span class="label">Pool</span>
          <span class="num" id="menu-pool-value">
            ${s.poolAmount > 0 ? fmt(s.poolAmount) : fmtClock(msUntilNextDrop())}
          </span>
        </span>
      </div>
    </div>`;

  root.querySelectorAll('[data-go]').forEach(btn => {
    btn.onclick = () => { Audio.unlock(); Audio.click(); showView(btn.dataset.go); };
  });

  document.getElementById('menu-pool').onclick = () => {
    const amount = collectPool();
    if (amount <= 0) { toast(`Next drop in ${fmtClock(msUntilNextDrop())}`); return; }
    Audio.coin();
    Particles.rain(40);
    toast(`+${fmtFull(amount)} collected`, 'win');
    document.getElementById('menu-balance').textContent = fmtFull(getState().balance);
    checkAchievements();
    queueSync();
  };
}

// ── Timers ───────────────────────────────────────────────────────────────────

function startTimers() {
  // One second tick drives the pool countdown and playtime. Cheap: it only
  // touches two text nodes.
  setInterval(() => {
    accruePool();
    if (currentView === 'menu') {
      const s = getState();
      const el = document.getElementById('menu-pool-value');
      const chip = document.getElementById('menu-pool');
      if (el) el.textContent = s.poolAmount > 0 ? fmt(s.poolAmount) : fmtClock(msUntilNextDrop());
      if (chip) chip.classList.toggle('ready', s.poolAmount > 0);
    } else {
      updatePoolChip();
    }
  }, 1000);

  // Playtime accrues only while the tab is visible.
  playtimeTimer = setInterval(() => {
    if (document.visibilityState === 'visible') tickPlaytime(currentMachine, 5000);
  }, 5000);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

function boot() {
  const s = getState();
  ensureSeeds();
  applyTheme(s.settings.theme);
  applyMotion(s.settings.reduceMotion);

  Events.on('balance:change', ({ balance, delta, reason }) => {
    updateBalanceChip(balance);
    const menuBal = document.getElementById('menu-balance');
    if (menuBal) menuBal.textContent = fmtFull(balance);
    // Only celebrate money coming in, never the stake going out.
    if (delta > 0 && reason !== 'spin') bumpBalanceChip();
  });

  Events.on('pool:change', updatePoolChip);

  Events.on('broke:relief', ({ amount }) => {
    toast(`Broke — ${fmtFull(amount)} dropped early`, 'win', 3400);
  });

  addEventListener('hashchange', routeFromHash);
  addEventListener('beforeunload', () => { endSession(); save(true); });

  // First interaction unlocks the audio context.
  addEventListener('pointerdown', () => Audio.unlock(), { once: true });

  installUnloadSync();
  startTimers();
  checkAchievements();
  routeFromHash();

  // Auth and cloud restore run after first paint so the login screen appears
  // instantly rather than waiting on the network.
  initAuth()
    .then(async () => {
      if (!isSignedIn()) return;
      // Restore BEFORE the first sync, or a fresh device would upload its
      // empty save over the real one.
      const res = await pullCloudSave();
      if (res.restored) {
        toast(`Welcome back — save restored`, 'win', 3200);
        if (currentView === 'menu') showView('menu');
      }
    })
    .catch(() => {})
    .finally(() => {
      if (hasOnboarded()) {
        checkBrokeRelief();
        // Grab a real #NNNN before the first sync publishes the placeholder.
        claimTag().finally(() => queueSync(true));
      }
    });
}

boot();
