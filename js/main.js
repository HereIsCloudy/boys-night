import { getState, updateBalance, getSkillLevel } from './state.js';
import { Events } from './events.js';
import { initHUD, refresh as hudRefresh } from './hud.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import {
  registerView, showView, openModal, closeModal,
  renderLobby, toast, showLevelUp,
} from './ui.js';
import { renderInventory, renderShop } from './items.js';
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

// ── Modal close (X button + backdrop) ─────────────────────────────────────────
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.dataset.close));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['inventory', 'skills', 'stats', 'shop'].forEach(m => closeModal(m));
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
