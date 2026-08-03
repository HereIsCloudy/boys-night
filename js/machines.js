/**
 * The five machines of BOYS NIGHT.
 *
 * Underneath they are siblings: same 5x3 grid, same 20 paylines, same bet
 * range, same win bands. What separates them is the signature feature and a
 * few points of RTP. Nothing is gated — all five are open from the start.
 */

import { scaleBands } from './bands.js';

export const REELS = 5;
export const ROWS = 3;

export const TURBO_PRICE = 67420;
export const AUTOSPIN_PRICE = 420670;

/**
 * Bet range.
 *
 * BET_MAX is far above what the pool can sustain on purpose — the pool pays
 * 500 every 10 minutes, so a single 5,000 bet is ten drops. Betting near the
 * cap is a deliberate act of self-destruction, not a grind. The steps below
 * are what the +/- buttons walk through; any value in [BET_MIN, BET_MAX] can
 * still be typed directly.
 */
export const BET_MIN = 1;
export const BET_MAX = 5000;
export const BET_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
export const DEFAULT_BET = 5;
export const STARTING_BALANCE = 1000;

/** Snap an arbitrary number to something legal to bet. */
export function clampBet(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_BET;
  return Math.min(BET_MAX, Math.max(BET_MIN, n));
}

/** 20 paylines over a 5x3 grid, as row indices per reel. */
export const PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 0, 1, 0, 0], [2, 2, 1, 2, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 2, 0, 2, 0],
];

/**
 * Symbol roles are identical across machines so the engine stays generic;
 * only the glyphs change. `tier` drives which symbol represents which win band.
 */
const ROLES = [
  { key: 'low1',    tier: 'low',  weight: 220 },
  { key: 'low2',    tier: 'low',  weight: 200 },
  { key: 'low3',    tier: 'low',  weight: 185 },
  { key: 'low4',    tier: 'low',  weight: 170 },
  { key: 'mid1',    tier: 'mid',  weight: 120 },
  { key: 'mid2',    tier: 'mid',  weight: 100 },
  { key: 'mid3',    tier: 'mid',  weight:  85 },
  { key: 'high1',   tier: 'high', weight:  45 },
  { key: 'high2',   tier: 'high', weight:  28 },
  { key: 'wild',    tier: 'wild', weight:  22 },
  { key: 'scatter', tier: 'scat', weight:  18 },
];

function symbolSet(glyphs, names) {
  return ROLES.map(r => ({ ...r, glyph: glyphs[r.key], name: names[r.key] }));
}

export const MACHINES = [
  {
    id: 'garry',
    name: 'GARRY SLOTS',
    owner: 'Garry',
    tagline: 'Climb the ladder, or fall off it',
    feature: 'jackpot_ladder',
    featureName: 'Jackpot Ladder',
    featureDesc: 'Climb the ladder. Every rung multiplies higher than the last, and one bad step ends the run.',
    rtp: 0.56,
    featureRate: 0.01314,   // 1 in 76 — rate = 1.3 / featureEV, so payout sets frequency
    featureSpins: 8,
    featureEV: 98.94,   // measured by tools/calibrate.js
    sound: { root: 392, wave: 'square',   scale: [0, 2, 4, 7, 9, 12] },      // bright major — the climb
    accent: '#FF7A18',
    symbols: symbolSet(
      { low1: '🍒', low2: '🍋', low3: '🍇', low4: '🔔', mid1: '💠', mid2: '🎯', mid3: '🧿',
        high1: '💎', high2: '👑', wild: '🌻', scatter: '⚡' },
      { low1: 'Cherry', low2: 'Lemon', low3: 'Grape', low4: 'Bell', mid1: 'Gem', mid2: 'Target',
        mid3: 'Eye', high1: 'Diamond', high2: 'Crown', wild: 'Bloom', scatter: 'Bolt' }
    ),
  },
  {
    id: 'josh',
    name: 'JOSH SLOTS',
    owner: 'Josh',
    tagline: 'Three scatters, ten free spins',
    feature: 'free_spins',
    featureName: 'Free Spins',
    featureDesc: '3+ scatters award 10 free spins. Retriggerable.',
    rtp: 0.56,
    featureRate: 0.00474,   // 1 in 211 — rate = 1.3 / featureEV, so payout sets frequency
    featureSpins: 12,
    featureEV: 274.03,   // measured by tools/calibrate.js
    sound: { root: 330, wave: 'triangle', scale: [0, 2, 4, 5, 7, 12] },      // warm and open
    accent: '#4FC3F7',
    symbols: symbolSet(
      { low1: '🍏', low2: '🍊', low3: '🫐', low4: '🎲', mid1: '🎸', mid2: '🏆', mid3: '🎺',
        high1: '💫', high2: '🔱', wild: '🃏', scatter: '🌟' },
      { low1: 'Apple', low2: 'Orange', low3: 'Berry', low4: 'Dice', mid1: 'Guitar', mid2: 'Trophy',
        mid3: 'Horn', high1: 'Comet', high2: 'Trident', wild: 'Joker', scatter: 'Star' }
    ),
  },
  {
    id: 'jaxon',
    name: 'JAXON SLOTS',
    owner: 'Jaxon',
    tagline: 'Three draws, each multiplied',
    feature: 'multiplier_wilds',
    featureName: 'Multiplier Draws',
    featureDesc: 'Three draws, each multiplied by a random x2-x10. Wilds themselves are ordinary substitutes.',
    rtp: 0.58,
    featureRate: 0.00715,   // 1 in 140 — rate = 1.3 / featureEV, so payout sets frequency
    featureSpins: 3,
    featureEV: 181.94,   // measured by tools/calibrate.js
    sound: { root: 440, wave: 'sawtooth', scale: [0, 2, 4, 6, 7, 11] },      // sharp lydian bite
    accent: '#39FF14',
    symbols: symbolSet(
      { low1: '🔥', low2: '❄️', low3: '🌊', low4: '🍀', mid1: '⚔️', mid2: '🛡️', mid3: '🗝️',
        high1: '💰', high2: '🐉', wild: '🃏', scatter: '💥' },
      { low1: 'Fire', low2: 'Frost', low3: 'Wave', low4: 'Clover', mid1: 'Blade', mid2: 'Shield',
        mid3: 'Key', high1: 'Vault', high2: 'Dragon', wild: 'Wild', scatter: 'Blast' }
    ),
  },
  {
    id: 'mint',
    name: 'MINT SLOTS',
    owner: 'Mint',
    tagline: 'Wins vanish, symbols drop, chains climb',
    feature: 'cascades',
    featureName: 'Cascades',
    featureDesc: 'Winning symbols vanish and new ones fall. Each chain step raises the multiplier.',
    rtp: 0.57,
    featureRate: 0.0029,   // 1 in 345 — rate = 1.3 / featureEV, so payout sets frequency
    featureSpins: 8,
    featureEV: 448.25,   // measured by tools/calibrate.js
    sound: { root: 523, wave: 'triangle', scale: [0, 3, 5, 7, 10, 12] },     // bubbly pentatonic
    accent: '#3EFFA8',
    symbols: symbolSet(
      { low1: '🌿', low2: '🍃', low3: '🥝', low4: '🧊', mid1: '🪩', mid2: '🎐', mid3: '🫧',
        high1: '💚', high2: '🦚', wild: '🍬', scatter: '🌀' },
      { low1: 'Sprig', low2: 'Leaf', low3: 'Kiwi', low4: 'Ice', mid1: 'Disco', mid2: 'Chime',
        mid3: 'Bubble', high1: 'Heart', high2: 'Peacock', wild: 'Mint', scatter: 'Spiral' }
    ),
  },
  {
    id: 'hayden',
    name: 'HAYDEN SLOTS',
    owner: 'Hayden',
    tagline: 'Lock the coins. Three respins. Fill the grid.',
    feature: 'hold_and_spin',
    featureName: 'Hold & Spin',
    featureDesc: '6+ coins lock in place and grant 3 respins. Every new coin resets the count.',
    rtp: 0.55,
    featureRate: 0.0037,   // 1 in 270 — rate = 1.3 / featureEV, so payout sets frequency
    featureSpins: 3,
    featureEV: 351.00,   // measured by tools/calibrate.js
    sound: { root: 262, wave: 'square',   scale: [0, 3, 5, 7, 10, 15] },     // low and ominous
    accent: '#A855F7',
    symbols: symbolSet(
      { low1: '🕯️', low2: '🗿', low3: '🦇', low4: '🕸️', mid1: '⚰️', mid2: '🔮', mid3: '🪬',
        high1: '💜', high2: '☠️', wild: '🌙', scatter: '🪙' },
      { low1: 'Candle', low2: 'Idol', low3: 'Bat', low4: 'Web', mid1: 'Casket', mid2: 'Orb',
        mid3: 'Charm', high1: 'Amethyst', high2: 'Skull', wild: 'Moon', scatter: 'Coin' }
    ),
  },
];

export const MACHINE_BY_ID = Object.fromEntries(MACHINES.map(m => [m.id, m]));

/**
 * Features hand out extra band rolls for free, which is real RTP. Budget for
 * it here so the advertised number is the number the simulator measures.
 *
 * Every feature payout is drawn from the same scaled band table, so its value
 * scales linearly with that table's RTP. That makes the algebra exact:
 *
 *   total = B + featureRate * featureEV * B  =>  B = rtp / (1 + rate * EV)
 *
 * `featureEV` is the feature's expected payout in units of the base table's
 * RTP, measured by tools/calibrate.js. Do not hand-estimate it from
 * `featureSpins` — multiplier wilds multiply, cascade chains die early, and
 * hold-and-spin resets its own respin counter. Re-run calibrate.js after
 * touching any feature's logic.
 */
export function machineBandTable(machine) {
  const target = machine.rtp / (1 + machine.featureRate * machine.featureEV);
  return scaleBands(Math.max(0.05, target));
}

/** Precomputed so the hot spin path never rebuilds a weight table. */
export const BAND_TABLES = Object.fromEntries(
  MACHINES.map(m => [m.id, machineBandTable(m)])
);

export const SYMBOL_TOTAL_WEIGHT = ROLES.reduce((s, r) => s + r.weight, 0);
