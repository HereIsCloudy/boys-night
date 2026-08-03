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

export const BET_STEPS = [1, 2, 5, 10, 15, 20, 25];
export const DEFAULT_BET = 5;
export const STARTING_BALANCE = 1000;

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
    tagline: 'Wilds bloom to fill the reel',
    feature: 'expanding_wilds',
    featureName: 'Expanding Wilds',
    featureDesc: 'A wild landing anywhere blooms to cover its entire reel.',
    rtp: 0.60,
    featureRate: 0.010,      // 1 in 100 spins
    featureSpins: 3,         // respins granted by the bloom
    featureEV: 7.81,   // measured by tools/calibrate.js
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
    rtp: 0.60,
    featureRate: 0.005,      // 1 in 200 spins
    featureSpins: 10,
    featureEV: 14.84,   // measured by tools/calibrate.js
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
    tagline: 'Wilds carry x2 to x10',
    feature: 'multiplier_wilds',
    featureName: 'Multiplier Wilds',
    featureDesc: 'Every wild carries a random x2-x10. Multiple wilds multiply together.',
    rtp: 0.62,
    featureRate: 0.006,
    featureSpins: 1,         // the multiplier applies to the spin itself
    featureEV: 35.30,   // measured by tools/calibrate.js
    accent: '#39FF14',
    symbols: symbolSet(
      { low1: '🔥', low2: '❄️', low3: '🌊', low4: '🍀', mid1: '⚔️', mid2: '🛡️', mid3: '🗝️',
        high1: '💰', high2: '🐉', wild: '✖️', scatter: '💥' },
      { low1: 'Fire', low2: 'Frost', low3: 'Wave', low4: 'Clover', mid1: 'Blade', mid2: 'Shield',
        mid3: 'Key', high1: 'Vault', high2: 'Dragon', wild: 'Multiplier', scatter: 'Blast' }
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
    rtp: 0.61,
    featureRate: 0.020,      // cascades kick in often, they are the texture
    featureSpins: 4,         // average chain length when it triggers
    featureEV: 15.70,   // measured by tools/calibrate.js
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
    rtp: 0.58,
    featureRate: 0.006,
    featureSpins: 3,
    featureEV: 10.16,   // measured by tools/calibrate.js
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
