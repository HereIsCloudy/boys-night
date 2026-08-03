/**
 * Game state and the stat tracker.
 *
 * localStorage is the source of truth for everything. Firestore only ever
 * hears about leaderboard-relevant records (see sync.js) — writing per spin
 * would burn the free-tier quota in about twenty minutes.
 *
 * Saves are debounced because turbo autospin can push ten spins a second and
 * JSON.stringify of the full stat tree on every one of those is not free.
 */

import { MACHINES, STARTING_BALANCE, DEFAULT_BET } from './machines.js';
import { BANDS } from './bands.js';
import { Events } from './events.js';

const KEY = 'boys-night-v1';
const SAVE_DEBOUNCE_MS = 1200;

// ── Pool ─────────────────────────────────────────────────────────────────────
export const POOL_AMOUNT = 500;
export const POOL_INTERVAL_MS = 10 * 60 * 1000;   // one drop per 10 minutes
export const POOL_CAP = 6000;                      // 12 drops, ~2 hours of accrual
export const BROKE_THRESHOLD = 25;                 // below this you are "broke"

function freshMachineStats() {
  return {
    spins: 0, wagered: 0, won: 0, hits: 0,
    biggestWin: 0, biggestMultiplier: 0,
    featureTriggers: 0, featureWinnings: 0,
    currentDrySpell: 0, longestDrySpell: 0,
    currentWinStreak: 0, longestWinStreak: 0,
    timePlayedMs: 0,
    bands: Object.fromEntries(BANDS.map(b => [b.id, 0])),
    symbols: {},   // key -> { landed, inWin, paid }
    lines: {},     // lineIndex -> { hits, won }
  };
}

const DEFAULTS = {
  version: 1,
  name: '',
  onboarded: false,
  balance: STARTING_BALANCE,
  bet: DEFAULT_BET,

  // Pool
  poolAmount: 0,
  poolLastAccrual: 0,
  poolTotalCollected: 0,
  poolCollections: 0,

  // Shop
  turbo: {},              // machineId -> true
  autospin: false,

  // Lifetime aggregates
  totalSpins: 0,
  totalWagered: 0,
  totalWon: 0,
  totalHits: 0,
  peakBalance: STARTING_BALANCE,
  lowestBalance: STARTING_BALANCE,
  timesBroke: 0,
  nearMisses: 0,

  biggestWin: null,       // { amount, multiplier, machineId, bet, grid, at }
  biggestMultiplier: 0,

  currentWinStreak: 0,
  longestWinStreak: 0,
  currentLossStreak: 0,
  longestLossStreak: 0,

  // Session
  sessionsPlayed: 0,
  totalPlaytimeMs: 0,
  firstPlayedAt: 0,

  perMachine: {},
  achievements: [],
  spinsByDay: {},         // 'YYYY-MM-DD' -> count
  balanceHistory: [],     // [ts, balance] sampled, capped

  settings: {
    theme: 'jaxon',
    sound: true,
    reduceMotion: false,
    turboDefault: false,
  },

  // Provably fair
  serverSeed: '',
  clientSeed: '',
  nonce: 0,
};

let _state = null;
let _saveTimer = null;
let _sessionStart = 0;

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source ?? {})) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = deepMerge(target[key] ?? {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function getState() {
  if (_state) return _state;

  try {
    const raw = localStorage.getItem(KEY);
    _state = raw ? deepMerge(structuredClone(DEFAULTS), JSON.parse(raw)) : structuredClone(DEFAULTS);
  } catch {
    _state = structuredClone(DEFAULTS);
  }

  // Backfill machines added after this save was written.
  for (const m of MACHINES) {
    if (!_state.perMachine[m.id]) _state.perMachine[m.id] = freshMachineStats();
    else _state.perMachine[m.id] = deepMerge(freshMachineStats(), _state.perMachine[m.id]);
  }

  if (!_state.firstPlayedAt) _state.firstPlayedAt = Date.now();
  if (!_state.poolLastAccrual) _state.poolLastAccrual = Date.now();

  _state.sessionsPlayed++;
  _sessionStart = Date.now();
  accruePool();
  save(true);
  return _state;
}

export function save(immediate = false) {
  if (immediate) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch {}
    return;
  }
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch {}
  }, SAVE_DEBOUNCE_MS);
}

// ── Pool ─────────────────────────────────────────────────────────────────────

/**
 * Accrue offline earnings. Capped, otherwise the optimal strategy is to not
 * play for two days and come back rich, which quietly makes absence the best
 * move in a game about spinning reels.
 */
export function accruePool() {
  const s = getStateRaw();
  const now = Date.now();
  const elapsed = now - s.poolLastAccrual;
  if (elapsed < POOL_INTERVAL_MS) return s.poolAmount;

  const drops = Math.floor(elapsed / POOL_INTERVAL_MS);
  s.poolAmount = Math.min(POOL_CAP, s.poolAmount + drops * POOL_AMOUNT);
  s.poolLastAccrual = now - (elapsed % POOL_INTERVAL_MS);
  save();
  Events.emit('pool:change', { amount: s.poolAmount });
  return s.poolAmount;
}

export function msUntilNextDrop() {
  const s = getStateRaw();
  if (s.poolAmount >= POOL_CAP) return 0;
  return Math.max(0, POOL_INTERVAL_MS - (Date.now() - s.poolLastAccrual));
}

export function collectPool() {
  const s = getStateRaw();
  const amount = s.poolAmount;
  if (amount <= 0) return 0;
  s.poolAmount = 0;
  s.poolTotalCollected += amount;
  s.poolCollections++;
  addBalance(amount, 'pool');
  save(true);
  Events.emit('pool:change', { amount: 0 });
  return amount;
}

/**
 * Nobody should sit at zero watching a ten minute timer. When broke, the next
 * drop lands almost immediately.
 */
export function checkBrokeRelief() {
  const s = getStateRaw();
  if (s.balance > BROKE_THRESHOLD || s.poolAmount > 0) return false;
  s.poolAmount = POOL_AMOUNT;
  s.poolLastAccrual = Date.now();
  s.timesBroke++;
  save(true);
  Events.emit('pool:change', { amount: s.poolAmount });
  Events.emit('broke:relief', { amount: POOL_AMOUNT });
  return true;
}

// ── Balance ──────────────────────────────────────────────────────────────────

function getStateRaw() {
  return _state ?? getState();
}

export function addBalance(delta, reason = 'spin') {
  const s = getStateRaw();
  s.balance = Math.max(0, s.balance + delta);
  if (s.balance > s.peakBalance) s.peakBalance = s.balance;
  if (s.balance < s.lowestBalance) s.lowestBalance = s.balance;
  save();
  Events.emit('balance:change', { balance: s.balance, delta, reason });
  return s.balance;
}

export function setBet(bet) {
  const s = getStateRaw();
  s.bet = bet;
  save();
  Events.emit('bet:change', { bet });
}

// ── Shop ─────────────────────────────────────────────────────────────────────

export function hasTurbo(machineId) {
  return !!getStateRaw().turbo[machineId];
}

export function hasAutospin() {
  return !!getStateRaw().autospin;
}

export function buyTurbo(machineId, price) {
  const s = getStateRaw();
  if (s.turbo[machineId] || s.balance < price) return false;
  s.balance -= price;
  s.turbo[machineId] = true;
  save(true);
  Events.emit('balance:change', { balance: s.balance, delta: -price, reason: 'shop' });
  Events.emit('shop:change', {});
  return true;
}

export function buyAutospin(price) {
  const s = getStateRaw();
  if (s.autospin || s.balance < price) return false;
  s.balance -= price;
  s.autospin = true;
  save(true);
  Events.emit('balance:change', { balance: s.balance, delta: -price, reason: 'shop' });
  Events.emit('shop:change', {});
  return true;
}

// ── Recording a spin ─────────────────────────────────────────────────────────

const dayKey = ts => new Date(ts).toISOString().slice(0, 10);

/**
 * Fold one spin result into every counter it touches. Called on the hot path,
 * so it mutates in place and leans on the debounced save.
 */
export function recordSpin(result, machine) {
  const s = getStateRaw();
  const ms = s.perMachine[machine.id];
  const now = Date.now();

  // Aggregates
  s.totalSpins++;
  s.totalWagered += result.bet;
  s.totalWon += result.payout;
  ms.spins++;
  ms.wagered += result.bet;
  ms.won += result.payout;
  ms.bands[result.band] = (ms.bands[result.band] ?? 0) + 1;

  // Hit / dry-spell bookkeeping. A "hit" is any payout at all, even the
  // sub-1x dust that is really a loss wearing a win costume.
  if (result.isWin) {
    s.totalHits++;
    ms.hits++;
    ms.currentDrySpell = 0;
    ms.currentWinStreak++;
    if (ms.currentWinStreak > ms.longestWinStreak) ms.longestWinStreak = ms.currentWinStreak;
    s.currentWinStreak++;
    s.currentLossStreak = 0;
    if (s.currentWinStreak > s.longestWinStreak) s.longestWinStreak = s.currentWinStreak;
  } else {
    ms.currentDrySpell++;
    if (ms.currentDrySpell > ms.longestDrySpell) ms.longestDrySpell = ms.currentDrySpell;
    ms.currentWinStreak = 0;
    s.currentWinStreak = 0;
    s.currentLossStreak++;
    if (s.currentLossStreak > s.longestLossStreak) s.longestLossStreak = s.currentLossStreak;
  }

  // Records
  if (result.payout > (s.biggestWin?.amount ?? 0)) {
    s.biggestWin = {
      amount: result.payout,
      multiplier: result.multiplier,
      machineId: machine.id,
      bet: result.bet,
      // Stored so a leaderboard row can render the exact reels that hit.
      grid: result.grid.map(reel => reel.map(sym => sym.key)),
      at: now,
    };
  }
  if (result.multiplier > s.biggestMultiplier) s.biggestMultiplier = result.multiplier;
  if (result.payout > ms.biggestWin) ms.biggestWin = result.payout;
  if (result.multiplier > ms.biggestMultiplier) ms.biggestMultiplier = result.multiplier;

  // Feature
  if (result.feature) {
    ms.featureTriggers++;
    ms.featureWinnings += Math.round(result.bet * result.feature.multiplier);
  }

  // Near miss: two scatters is the tease that never pays.
  if (!result.feature && result.scatters.count === 2) s.nearMisses++;

  // Per-symbol frequency, for the heat grid on the stats page.
  for (const reel of result.grid) {
    for (const sym of reel) {
      const rec = ms.symbols[sym.key] ?? (ms.symbols[sym.key] = { landed: 0, inWin: 0, paid: 0 });
      rec.landed++;
    }
  }
  for (const line of result.lines) {
    const rec = ms.symbols[line.symbol.key] ?? (ms.symbols[line.symbol.key] = { landed: 0, inWin: 0, paid: 0 });
    rec.inWin++;
    rec.paid += result.payout;
    const lrec = ms.lines[line.lineIndex] ?? (ms.lines[line.lineIndex] = { hits: 0, won: 0 });
    lrec.hits++;
    lrec.won += result.payout;
  }

  // Time series
  const day = dayKey(now);
  s.spinsByDay[day] = (s.spinsByDay[day] ?? 0) + 1;
  if (s.totalSpins % 25 === 0) {
    s.balanceHistory.push([now, s.balance]);
    if (s.balanceHistory.length > 400) s.balanceHistory.shift();
  }

  save();
}

export function tickPlaytime(machineId, ms) {
  const s = getStateRaw();
  s.totalPlaytimeMs += ms;
  if (machineId && s.perMachine[machineId]) s.perMachine[machineId].timePlayedMs += ms;
}

export function endSession() {
  const s = getStateRaw();
  if (_sessionStart) s.totalPlaytimeMs += Date.now() - _sessionStart;
  _sessionStart = Date.now();
  save(true);
}

// ── Derived ──────────────────────────────────────────────────────────────────

export function actualRTP(machineId = null) {
  const s = getStateRaw();
  const wagered = machineId ? s.perMachine[machineId].wagered : s.totalWagered;
  const won = machineId ? s.perMachine[machineId].won : s.totalWon;
  return wagered > 0 ? won / wagered : 0;
}

export function hitRate(machineId = null) {
  const s = getStateRaw();
  const spins = machineId ? s.perMachine[machineId].spins : s.totalSpins;
  const hits = machineId ? s.perMachine[machineId].hits : s.totalHits;
  return spins > 0 ? hits / spins : 0;
}

/** Gambling net excludes pool income — that separation is the whole point. */
export function gamblingNet() {
  const s = getStateRaw();
  return s.totalWon - s.totalWagered;
}

export function earnAchievement(id) {
  const s = getStateRaw();
  if (s.achievements.includes(id)) return false;
  s.achievements.push(id);
  save(true);
  return true;
}

export function updateSettings(patch) {
  const s = getStateRaw();
  Object.assign(s.settings, patch);
  save(true);
  Events.emit('settings:change', s.settings);
}

export function setName(name) {
  const s = getStateRaw();
  s.name = String(name).slice(0, 18);
  save(true);
  Events.emit('name:change', { name: s.name });
}

export function resetAll() {
  _state = structuredClone(DEFAULTS);
  for (const m of MACHINES) _state.perMachine[m.id] = freshMachineStats();
  _state.firstPlayedAt = Date.now();
  _state.poolLastAccrual = Date.now();
  save(true);
  Events.emit('state:reset', {});
}

/** Serialise the whole save for cloud storage. */
export function exportSave() {
  return JSON.stringify(getStateRaw());
}

/**
 * Replace local state with a cloud save. Used when signing in on a new device.
 * Merged onto DEFAULTS so a save written by an older version still loads.
 */
export function importSave(json) {
  try {
    const incoming = typeof json === 'string' ? JSON.parse(json) : json;
    if (!incoming || typeof incoming !== 'object') return false;
    _state = deepMerge(structuredClone(DEFAULTS), incoming);
    for (const m of MACHINES) {
      _state.perMachine[m.id] = deepMerge(freshMachineStats(), _state.perMachine[m.id] ?? {});
    }
    // The pool should not pay out for time spent on another device.
    _state.poolLastAccrual = Date.now();
    save(true);
    Events.emit('state:loaded', {});
    Events.emit('balance:change', { balance: _state.balance, delta: 0, reason: 'cloud' });
    return true;
  } catch {
    return false;
  }
}
