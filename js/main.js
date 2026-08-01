import { getState, updateBalance, getSkillLevel, getEquippedBonus } from './state.js';
import { Events } from './events.js';
import { initHUD, refresh as hudRefresh } from './hud.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import {
  registerView, showView, openModal, closeModal,
  renderLobby, toast, showLevelUp,
} from './ui.js';
import { renderInventory, renderShop } from './items.js';
import { renderCards } from './cards.js';
import { renderSkillTree } from './skills.js';
import { renderStats, checkAchievements } from './stats.js';
import { initSlots }    from './slots.js';
import { initCrash }    from './crash.js';
import { initCoinFlip } from './coinflip.js';
import { initWheel }    from './wheel.js';
import { initDice }     from './dice.js';

// ── Register views ─────────────────────────────────────────────────────────────
['lobby', 'slots', 'crash', 'coinflip', 'wheel', 'dice'].forEach(id => {
  const el = document.getElementById(`view-${id}`);
  if (el) registerView(id, el);
});

// ── Init core systems ──────────────────────────────────────────────────────────
initHUD();
Particles.init?.();

// ── Init all games ─────────────────────────────────────────────────────────────
initSlots();
initCrash();
initCoinFlip();
initWheel();
initDice();

// ── HUD buttons ────────────────────────────────────────────────────────────────
function wireBtn(id, modal, renderFn) {
  document.getElementById(id)?.addEventListener('click', () => {
    Audio.click();
    renderFn();
    openModal(modal);
  });
}

wireBtn('btn-inventory', 'inventory', renderInventory);
wireBtn('btn-skills',    'skills',    renderSkillTree);
wireBtn('btn-stats',     'stats',     renderStats);
wireBtn('btn-shop',      'shop',      renderShop);

// Cards open via the lobby tile (no HUD button)
Events.on('cards:open', () => {
  renderCards();
  openModal('cards');
});

// ── Modal close (X button + backdrop) ─────────────────────────────────────────
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.dataset.close));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['inventory', 'cards', 'skills', 'stats', 'shop'].forEach(m => closeModal(m));
  }
});

// ── Global events ──────────────────────────────────────────────────────────────
Events.on('level:up', ({ level }) => {
  showLevelUp(level);
  hudRefresh();
  checkAchievements();
});

Events.on('balance:update', () => {
  hudRefresh();
  checkAchievements();
  // Free pull every 5k wagered (Money Talks skill h5)
  const s = getState();
  const h5 = getSkillLevel('h5');
  if (h5 > 0) {
    const threshold = 5000 * (4 - h5); // Lv1=15k? simplified: per 5k/h5
    const lastCheck = s.skills._moneyTalksWagered || 0;
    if (s.totalWagered - lastCheck >= 5000) {
      s.skills._moneyTalksWagered = s.totalWagered;
      // Trigger free standard pull notification
      toast('Money Talks: Free pull unlocked! Head to the Shop.', 'jackpot');
    }
  }
});

// ── Session start bonus (Fortune f6) ──────────────────────────────────────────
const f6 = getSkillLevel('f6');
if (f6 > 0) {
  const bonus = f6 * 50;
  updateBalance(bonus);
  toast(`Session Bonus: +${bonus} coins (Fortune's Luck Lv${f6})`, 'win');
}

// ── Render lobby + show ────────────────────────────────────────────────────────
renderLobby();
showView('lobby');

// ── Unlock AudioContext on first interaction ───────────────────────────────────
document.addEventListener('click', () => Audio.click?.(), { once: true });

// ── Passive income: 1s tick drives ring + countdown; 10s fires income ─────────
let _passiveCountdown = 10;
const PASSIVE_CIRC = 99.9;

setInterval(() => {
  _passiveCountdown--;

  const s = getState();
  const amount = Math.round((5 + Math.floor(s.level / 5)) * (1 + getEquippedBonus('passive_income') / 100));

  if (_passiveCountdown <= 0) {
    _passiveCountdown = 10;
    updateBalance(amount);

    // Coin shower near lobby balance (when on lobby view)
    const lobbyBal = document.getElementById('lobby-balance');
    if (lobbyBal) {
      const r = lobbyBal.getBoundingClientRect();
      Particles.coinShower(r.left + r.width / 2, r.top + r.height / 2, 10);
      Particles.floatNumber(r.left + r.width / 2, r.top - 20, `+${amount}`, '#fbbf24');
    }

    // Float number near HUD balance too
    const hudBal = document.getElementById('hud-balance');
    if (hudBal) {
      const r = hudBal.getBoundingClientRect();
      Particles.floatNumber(r.left + r.width / 2, r.top, `+${amount}`, '#fbbf24');
    }
  }

  // Update passive widget
  const fill = document.getElementById('pr-fill');
  const cnt  = document.getElementById('pw-countdown');
  const amt  = document.getElementById('pw-amount');
  const pct  = _passiveCountdown / 10;
  if (fill) fill.style.strokeDashoffset = String(PASSIVE_CIRC * (1 - pct));
  if (cnt)  cnt.textContent  = _passiveCountdown + 's';
  if (amt)  amt.textContent  = `+${amount}`;
}, 1000);
