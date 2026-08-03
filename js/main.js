/** Boot, routing, and the persistent HUD. */

import { getState, accruePool, collectPool, msUntilNextDrop, checkBrokeRelief,
         endSession, tickPlaytime, save, adoptIdentity } from './state.js';
import { applyTheme, applyMotion, ensureSeeds, renderSettings } from './settings.js';
import { renderLobby } from './lobby.js';
import { renderGame, teardownGame } from './game.js';
import { renderStats } from './stats.js';
import { renderShop } from './shop.js';
import { renderLogin } from './login.js';
import { renderProfile } from './profile.js';
import { renderPlinko, teardownPlinko } from './plinko.js';
import { initAuth, hasOnboarded, isSignedIn, currentUser } from './auth.js';
import { renderLeaderboards, invalidateBoards } from './leaderboard.js';
import { checkAchievements, achievementProgress } from './achievements.js';
import { queueSync, installUnloadSync, flush, pullCloudSave, claimTag } from './sync.js';
import { reconcileAccepted } from './friends.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { fmt, fmtFull, fmtClock, toast, escapeHtml } from './ui.js';
import { Events } from './events.js';

const app = () => document.getElementById('app');

let currentView = 'menu';
let currentMachine = null;
let playtimeTimer = null;

/**
 * The login screen is always the first thing you see, even when already
 * signed in — it just becomes a "Continue as ..." card instead of a form.
 * Deep links still work; they're honoured once you're through the door.
 */
let launched = false;
let pendingRoute = null;

/** The hash that matches whatever is on screen right now. */
function currentHash() {
  return currentView === 'game' ? `game/${currentMachine}` : currentView;
}

// ── Routing ──────────────────────────────────────────────────────────────────

const VIEWS = {
  login:       (root) => renderLogin(root, enterGame),
  menu:        renderMenu,
  lobby:       root => renderLobby(root, id => showView(id === '__plinko' ? 'plinko' : 'game', id === '__plinko' ? undefined : id)),
  game:        (root, id) => renderGame(root, id),
  stats:       renderStats,
  plinko:      renderPlinko,
  profile:     renderProfile,
  leaderboard: renderLeaderboards,
  shop:        renderShop,
  settings:    renderSettings,
};

export function showView(name, arg) {
  if (currentView === 'game' && name !== 'game') teardownGame();
  if (currentView === 'plinko' && name !== 'plinko') teardownPlinko();

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

  const nextHash = name === 'game' ? `#game/${arg}` : `#${name}`;
  if (location.hash !== nextHash) location.hash = nextHash;
  scrollTo({ top: 0 });
}

function routeFromHash() {
  const raw = location.hash.slice(1);

  // Every launch lands on the front door. Whatever was deep-linked is
  // remembered and honoured the moment the player comes through it.
  if (!launched) {
    launched = true;
    pendingRoute = raw && raw !== 'login' ? raw : null;
    return showView('login');
  }

  // Ignore a hashchange that merely echoes the view already on screen.
  //
  // showView() writes location.hash, which fires hashchange, which lands back
  // here. A timer-based guard was not enough: hashchange can fire AFTER a
  // setTimeout(0) clears it, and then routeFromHash would see #login, decide
  // the door was already done with, and bounce to #menu. Comparing against
  // what is actually rendered has no timing to lose.
  if (raw === currentHash()) return;

  if (!hasOnboarded()) return showView('login');
  if (!raw || raw === 'login') return showView('menu');

  const [name, arg] = raw.split('/');
  if (VIEWS[name] && name !== 'login') showView(name, arg);
  else showView('menu');
}

/** Where to land once the login screen is dismissed. */
function enterGame() {
  const target = pendingRoute;
  pendingRoute = null;
  if (!target) return showView('menu');
  const [name, arg] = target.split('/');
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
    <button class="hud-back" id="hud-back">← ${['game', 'plinko'].includes(currentView) ? 'Games' : 'Menu'}</button>
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
    showView(['game', 'plinko'].includes(currentView) ? 'lobby' : 'menu');
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
        <button class="menu-btn" data-go="profile">
          <span class="icon">👤</span> Profile
          <span class="sub">${escapeHtml(s.name || 'you')} #${escapeHtml(s.tag || '----')} · ${(s.friends ?? []).length} friend${(s.friends ?? []).length === 1 ? '' : 's'}</span>
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

  addEventListener('hashchange', routeFromHash);
  addEventListener('beforeunload', () => { endSession(); save(true); });

  // First interaction unlocks the audio context.
  addEventListener('pointerdown', () => Audio.unlock(), { once: true });

  installUnloadSync();
  startTimers();
  checkAchievements();

  // Any view that reports who you are must redraw when auth resolves. Without
  // this, the login door and Settings keep showing the signed-out state they
  // were rendered with a moment before Firebase restored the session — which
  // is exactly what made a signed-in player look logged out after a refresh.
  Events.on('auth:change', () => {
    if (['login', 'settings', 'profile'].includes(currentView)) showView(currentView);
  });

  // Paint immediately so the app never sits on a blank screen...
  routeFromHash();

  // ...then settle auth and redraw once we actually know who's here.
  initAuth()
    .then(async () => {
      if (!isSignedIn()) return;

      // Restore BEFORE the first sync, or a fresh device would upload its
      // empty save over the real one.
      const res = await pullCloudSave();
      if (res.restored) toast('Welcome back — save restored', 'win', 3200);

      // Authenticated but no local name means the save was reset out from
      // under a real account. Take the name off the auth profile so they get
      // the Continue card instead of being asked to sign up again.
      const u = currentUser();
      adoptIdentity({
        name: u?.displayName?.split(' ')[0] || u?.email?.split('@')[0],
      });
    })
    .catch(err => console.warn('[boot] auth failed:', err?.message ?? err))
    .finally(() => {
      // Redraw regardless of outcome — offline should settle on a definite
      // state too, not the half-rendered one from before auth was attempted.
      if (currentView === 'login' || currentView === 'settings') showView(currentView);
      if (hasOnboarded()) {
        checkBrokeRelief();
        reconcileAccepted()
          .then(added => { if (added > 0) toast(`${added} friend request${added === 1 ? '' : 's'} accepted while you were away`, 'win', 3600); })
          .catch(() => {})
          .finally(() => claimTag().finally(() => queueSync(true)));
      }
    });
}

boot();
