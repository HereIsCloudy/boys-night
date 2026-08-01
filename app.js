'use strict';

// ── Game state ──────────────────────────────────────────────────────────────
const state = {
  coins: 0,
  totalCoins: 0,
  coinsPerClick: 1,
  coinsPerSec: 0,
  buildings: {},  // key -> count
  boughtUpgrades: new Set(),
};

// ── Data ────────────────────────────────────────────────────────────────────
const BUILDINGS = [
  { key: 'friend',   icon: '👧', name: 'Riley\'s Friend', desc: '+0.1 coins/sec',  baseCost: 15,  cpsEach: 0.1  },
  { key: 'garden',   icon: '🌷', name: 'Flower Garden',   desc: '+0.5 coins/sec',  baseCost: 80,  cpsEach: 0.5  },
  { key: 'bakery',   icon: '🧁', name: 'Cookie Bakery',   desc: '+2 coins/sec',    baseCost: 400, cpsEach: 2    },
  { key: 'castle',   icon: '🏰', name: 'Riley\'s Castle',  desc: '+10 coins/sec',   baseCost: 2000, cpsEach: 10  },
  { key: 'rainbow',  icon: '🌈', name: 'Rainbow Bridge',  desc: '+50 coins/sec',   baseCost: 12000, cpsEach: 50 },
  { key: 'star',     icon: '⭐', name: 'Wishing Star',    desc: '+200 coins/sec',  baseCost: 60000, cpsEach: 200 },
];

const UPGRADES = [
  { key: 'stronger_click', icon: '💪', name: 'Stronger Click',    desc: 'Double click power',     cost: 50,    effect: () => { state.coinsPerClick *= 2; } },
  { key: 'golden_fingers', icon: '✨', name: 'Golden Fingers',    desc: 'Triple click power',     cost: 500,   effect: () => { state.coinsPerClick *= 3; } },
  { key: 'magic_touch',    icon: '🪄', name: 'Magic Touch',       desc: '5× click power',         cost: 5000,  effect: () => { state.coinsPerClick *= 5; } },
  { key: 'friend_boost',   icon: '🤝', name: 'Friendship Bonus', desc: 'Friends produce 2× more', cost: 200,   effect: () => boostBuilding('friend', 2) },
  { key: 'garden_boost',   icon: '🌹', name: 'Blooming Garden',  desc: 'Garden produces 2× more', cost: 1000,  effect: () => boostBuilding('garden', 2) },
  { key: 'bakery_boost',   icon: '🎂', name: 'Master Baker',     desc: 'Bakery produces 2× more', cost: 5000,  effect: () => boostBuilding('bakery', 2) },
];

const MILESTONES = [
  { coins: 100,       msg: '🌸 100 coins! Riley is happy!' },
  { coins: 1000,      msg: '✨ 1,000 coins! You\'re amazing!' },
  { coins: 10000,     msg: '🌈 10,000 coins! Riley\'s World is growing!' },
  { coins: 100000,    msg: '⭐ 100,000 coins! Legendary!' },
  { coins: 1000000,   msg: '👑 1,000,000 coins! You rule Riley\'s World!' },
];

// Per-building multipliers (affected by upgrades)
const buildingMult = {};
BUILDINGS.forEach(b => { buildingMult[b.key] = 1; state.buildings[b.key] = 0; });

function boostBuilding(key, mult) {
  buildingMult[key] = (buildingMult[key] || 1) * mult;
  recalcCPS();
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const scoreEl       = document.getElementById('score');
const totalLabelEl  = document.getElementById('total-label');
const cpsEl         = document.getElementById('cookies-per-sec');
const rileyBtn      = document.getElementById('riley-btn');
const upgradesList  = document.getElementById('upgrades-list');
const buildingsList = document.getElementById('buildings-list');
const floatContainer = document.getElementById('float-container');
const toastEl       = document.getElementById('toast');

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + ' B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + ' M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + ' K';
  return Math.floor(n).toString();
}

function recalcCPS() {
  let cps = 0;
  BUILDINGS.forEach(b => {
    cps += state.buildings[b.key] * b.cpsEach * (buildingMult[b.key] || 1);
  });
  state.coinsPerSec = cps;
  cpsEl.textContent = fmt(cps) + ' coins/sec';
}

function buildingCost(b) {
  return Math.ceil(b.baseCost * Math.pow(1.15, state.buildings[b.key]));
}

let nextMilestone = 0;
function checkMilestones() {
  while (nextMilestone < MILESTONES.length && state.totalCoins >= MILESTONES[nextMilestone].coins) {
    showToast(MILESTONES[nextMilestone].msg);
    nextMilestone++;
  }
}

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function spawnFloat(x, y, amount) {
  const el = document.createElement('span');
  el.className = 'float-num';
  el.textContent = '+' + fmt(amount);
  el.style.left = (x - 20) + 'px';
  el.style.top  = (y - 30) + 'px';
  floatContainer.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ── Render ────────────────────────────────────────────────────────────────
function updateScore() {
  scoreEl.textContent = fmt(state.coins);
  totalLabelEl.textContent = 'Total earned: ' + fmt(state.totalCoins);
}

function renderUpgrades() {
  upgradesList.innerHTML = '';
  UPGRADES.forEach(u => {
    const bought = state.boughtUpgrades.has(u.key);
    const canAfford = state.coins >= u.cost;
    const card = document.createElement('div');
    card.className = 'upgrade-card' + (bought ? ' bought' : canAfford ? '' : ' locked');
    card.innerHTML = `
      <span class="upgrade-icon">${u.icon}</span>
      <div class="upgrade-info">
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc}</div>
        ${bought
          ? '<div class="upgrade-bought-badge">✓ Purchased</div>'
          : `<div class="upgrade-cost">🪙 ${fmt(u.cost)}</div>`
        }
      </div>`;
    if (!bought) {
      card.addEventListener('click', () => buyUpgrade(u));
    }
    upgradesList.appendChild(card);
  });
}

function renderBuildings() {
  buildingsList.innerHTML = '';
  BUILDINGS.forEach(b => {
    const cost = buildingCost(b);
    const canAfford = state.coins >= cost;
    const count = state.buildings[b.key];
    const card = document.createElement('div');
    card.className = 'building-card' + (canAfford ? '' : ' locked');
    card.innerHTML = `
      <span class="building-icon">${b.icon}</span>
      <div class="building-info">
        <div class="building-name">${b.name}</div>
        <div class="building-desc">${b.desc}</div>
        <div class="building-cost">🪙 ${fmt(cost)}</div>
      </div>
      <span class="building-count">${count}</span>`;
    card.addEventListener('click', () => buyBuilding(b));
    buildingsList.appendChild(card);
  });
}

function render() {
  updateScore();
  renderUpgrades();
  renderBuildings();
}

// ── Actions ───────────────────────────────────────────────────────────────
function addCoins(n) {
  state.coins += n;
  state.totalCoins += n;
  checkMilestones();
}

function buyUpgrade(u) {
  if (state.boughtUpgrades.has(u.key) || state.coins < u.cost) return;
  state.coins -= u.cost;
  state.boughtUpgrades.add(u.key);
  u.effect();
  render();
}

function buyBuilding(b) {
  const cost = buildingCost(b);
  if (state.coins < cost) return;
  state.coins -= cost;
  state.buildings[b.key]++;
  recalcCPS();
  render();
}

// ── Click handler ─────────────────────────────────────────────────────────
rileyBtn.addEventListener('click', (e) => {
  addCoins(state.coinsPerClick);
  spawnFloat(e.clientX, e.clientY, state.coinsPerClick);
  updateScore();
  renderUpgrades();
  renderBuildings();
});

// ── Tick (coins per second) ───────────────────────────────────────────────
let lastTick = performance.now();
function tick(now) {
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (state.coinsPerSec > 0) {
    addCoins(state.coinsPerSec * dt);
    updateScore();
    // re-render panels every ~2s to update affordability
  }
  requestAnimationFrame(tick);
}

let panelRefreshCounter = 0;
function panelRefreshTick() {
  renderUpgrades();
  renderBuildings();
}
setInterval(panelRefreshTick, 1000);

// ── Init ──────────────────────────────────────────────────────────────────
recalcCPS();
render();
requestAnimationFrame(tick);
