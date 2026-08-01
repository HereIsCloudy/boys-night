import { Events } from './events.js';

const DEFAULTS = {
  balance: 2500,
  sessionStart: 0,
  sessionProfit: 0,
  totalWon: 0,
  totalLost: 0,
  totalWagered: 0,
  biggestWin: 0,
  jackpotsHit: 0,
  stats: {
    slots:    { spins: 0, won: 0, lost: 0, wagered: 0, biggestWin: 0, jackpots: 0 },
    crash:    { plays: 0, won: 0, lost: 0, wagered: 0, biggestMulti: 0, highestCashout: 0 },
    coinflip: { flips: 0, wins: 0, losses: 0, wagered: 0, bestStreak: 0, currentStreak: 0 },
    wheel:    { spins: 0, won: 0, lost: 0, wagered: 0, jackpots: 0, biggestMulti: 0 },
    dice:     { rolls: 0, won: 0, lost: 0, wagered: 0, biggestWin: 0, exactHits: 0 },
  },
  inventory: [],
  equipped: { hat: null, outfit: null, gloves: null, shoes: null, charm: null, ring1: null, ring2: null },
  skills: {},
  skillPoints: 3,
  level: 1,
  xp: 0,
  pityCounter: 0,
  pullsTotal: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  hotStreakCount: 0,
  achievements: [],
  rarestrPull: null,
  settings: { sound: true, particles: true },
};

let _state = null;
const KEY = 'riley-world-v2';

export function getState() {
  if (!_state) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        _state = deepMerge({ ...DEFAULTS }, saved);
        _state.sessionProfit = 0;
        _state.sessionStart = Date.now();
      } else {
        _state = { ...DEFAULTS, sessionStart: Date.now() };
      }
    } catch {
      _state = { ...DEFAULTS, sessionStart: Date.now() };
    }
  }
  return _state;
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

export function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch {}
}

export function updateBalance(delta) {
  const s = getState();
  s.balance = Math.max(0, s.balance + delta);
  s.sessionProfit += delta;
  if (delta > 0) { s.totalWon += delta; if (delta > s.biggestWin) s.biggestWin = delta; }
  else s.totalLost += Math.abs(delta);
  saveState();
  Events.emit('balance:update', { balance: s.balance, delta });
}

export function addWager(amount) {
  const s = getState();
  s.totalWagered += amount;
  saveState();
}

export function recordStat(game, key, value) {
  const s = getState();
  if (!s.stats[game]) return;
  const MAX_KEYS = new Set(['biggestWin','highestCashout','biggestMulti','bestStreak']);
  if (MAX_KEYS.has(key)) {
    s.stats[game][key] = Math.max(s.stats[game][key] ?? 0, value);
  } else {
    s.stats[game][key] = (s.stats[game][key] ?? 0) + value;
  }
  saveState();
}

export function addXP(amount) {
  const s = getState();
  s.xp += amount;
  const needed = s.level * 120;
  if (s.xp >= needed) {
    s.xp -= needed;
    s.level++;
    s.skillPoints = (s.skillPoints || 0) + 1;
    saveState();
    Events.emit('level:up', { level: s.level });
    return true;
  }
  saveState();
  return false;
}

export function updateStreak(won) {
  const s = getState();
  if (won) {
    s.currentWinStreak++;
    s.hotStreakCount++;
    if (s.currentWinStreak > s.bestWinStreak) s.bestWinStreak = s.currentWinStreak;
    if (s.stats.coinflip && s.currentWinStreak > s.stats.coinflip.bestStreak) {
      s.stats.coinflip.bestStreak = s.currentWinStreak;
    }
  } else {
    s.currentWinStreak = 0;
    s.hotStreakCount = 0;
  }
  saveState();
  Events.emit('streak:update', { streak: s.currentWinStreak });
  return s.currentWinStreak;
}

export function getEquippedBonus(key) {
  const s = getState();
  let total = 0;
  Object.values(s.equipped).forEach(item => {
    if (!item) return;
    (item.stats || []).forEach(st => { if (st.key === key) total += st.value; });
  });
  return total;
}

export function getSkillLevel(id) {
  return getState().skills[id] ?? 0;
}

export function spendSkillPoint(id) {
  const s = getState();
  if (s.skillPoints <= 0) return false;
  s.skills[id] = (s.skills[id] ?? 0) + 1;
  s.skillPoints--;
  saveState();
  Events.emit('skills:update', {});
  return true;
}

export function addToInventory(item) {
  const s = getState();
  s.inventory.push(item);
  if (!s.rarestrPull) {
    s.rarestrPull = item;
  } else {
    const ORDER = ['common','uncommon','rare','epic','legendary','divine','chaosDivine'];
    if (ORDER.indexOf(item.rarity) > ORDER.indexOf(s.rarestrPull.rarity)) s.rarestrPull = item;
  }
  saveState();
}

export function equipItem(item) {
  const s = getState();
  const prev = s.equipped[item.slot];
  if (prev) s.inventory.push(prev);
  s.equipped[item.slot] = item;
  s.inventory = s.inventory.filter(i => i.id !== item.id);
  saveState();
}

export function unequipSlot(slot) {
  const s = getState();
  const item = s.equipped[slot];
  if (!item) return;
  s.inventory.push(item);
  s.equipped[slot] = null;
  saveState();
}

export function removeFromInventory(id) {
  const s = getState();
  s.inventory = s.inventory.filter(i => i.id !== id);
  saveState();
}

export function earnAchievement(id) {
  const s = getState();
  if (s.achievements.includes(id)) return false;
  s.achievements.push(id);
  saveState();
  return true;
}
