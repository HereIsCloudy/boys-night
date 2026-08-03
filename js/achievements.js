/** Achievements. Checked after every spin, so `check` must stay cheap. */

import { getState, earnAchievement, actualRTP, hitRate, gamblingNet } from './state.js';
import { MACHINES } from './machines.js';
import { TURBO_PRICE, AUTOSPIN_PRICE } from './machines.js';
import { toast } from './ui.js';
import { Audio } from './audio.js';

const anyMachine = (s, fn) => MACHINES.some(m => fn(s.perMachine[m.id], m));
const allMachines = (s, fn) => MACHINES.every(m => fn(s.perMachine[m.id], m));
const sumMachines = (s, fn) => MACHINES.reduce((t, m) => t + fn(s.perMachine[m.id], m), 0);

export const ACHIEVEMENTS = [
  // First steps
  { id: 'first_spin',  icon: '🎰', name: 'First Blood',      desc: 'Spin once',                    check: s => s.totalSpins >= 1 },
  { id: 'first_win',   icon: '✨', name: 'Beginner\'s Luck',  desc: 'Win anything at all',          check: s => s.totalHits >= 1 },
  { id: 'all_five',    icon: '🎮', name: 'Met The Boys',      desc: 'Play all five machines',       check: s => allMachines(s, m => m.spins > 0) },

  // Volume
  { id: 'spins_100',   icon: '🔄', name: 'Warming Up',        desc: '100 spins',                    check: s => s.totalSpins >= 100 },
  { id: 'spins_1k',    icon: '🌀', name: 'Regular',           desc: '1,000 spins',                  check: s => s.totalSpins >= 1000 },
  { id: 'spins_10k',   icon: '💫', name: 'Certified Degen',   desc: '10,000 spins',                 check: s => s.totalSpins >= 10000 },
  { id: 'spins_100k',  icon: '🛸', name: 'Touch Grass',       desc: '100,000 spins',                check: s => s.totalSpins >= 100000 },

  // Wagering
  { id: 'wager_10k',   icon: '💸', name: 'Small Fry',         desc: 'Wager 10,000 total',           check: s => s.totalWagered >= 10000 },
  { id: 'wager_100k',  icon: '🐟', name: 'Big Fish',          desc: 'Wager 100,000 total',          check: s => s.totalWagered >= 100000 },
  { id: 'wager_1m',    icon: '🐋', name: 'Whale',             desc: 'Wager 1,000,000 total',        check: s => s.totalWagered >= 1000000 },
  { id: 'wager_10m',   icon: '🌊', name: 'Leviathan',         desc: 'Wager 10,000,000 total',       check: s => s.totalWagered >= 10000000 },

  // Win tiers
  { id: 'band_small',  icon: '🟢', name: 'Actual Profit',     desc: 'Land a Small win (2x-10x)',    check: s => sumMachines(s, m => m.bands.small) >= 1 },
  { id: 'band_medium', icon: '🔵', name: 'Now We\'re Talking', desc: 'Land a Medium win (20x-100x)', check: s => sumMachines(s, m => m.bands.medium) >= 1 },
  { id: 'band_big',    icon: '🟠', name: 'Screenshot This',   desc: 'Land a Big win (500x-2000x)',  check: s => sumMachines(s, m => m.bands.big) >= 1 },
  { id: 'band_mega',   icon: '🔴', name: 'ONE IN A HUNDRED K', desc: 'Land a Mega win (5000x+)',    check: s => sumMachines(s, m => m.bands.mega) >= 1 },
  { id: 'mega_twice',  icon: '☄️', name: 'Statistically Absurd', desc: 'Land two Mega wins',        check: s => sumMachines(s, m => m.bands.mega) >= 2 },
  { id: 'mult_10k',    icon: '👑', name: 'Five Figures',      desc: 'Hit a 10,000x multiplier',     check: s => s.biggestMultiplier >= 10000 },

  // Records
  { id: 'win_1k',      icon: '🏆', name: 'Four Digits',       desc: 'Win 1,000 in one spin',        check: s => (s.biggestWin?.amount ?? 0) >= 1000 },
  { id: 'win_10k',     icon: '💎', name: 'Five Digits',       desc: 'Win 10,000 in one spin',       check: s => (s.biggestWin?.amount ?? 0) >= 10000 },
  { id: 'win_100k',    icon: '🌟', name: 'Six Digits',        desc: 'Win 100,000 in one spin',      check: s => (s.biggestWin?.amount ?? 0) >= 100000 },
  { id: 'peak_100k',   icon: '📈', name: 'Briefly Wealthy',   desc: 'Reach a balance of 100,000',   check: s => s.peakBalance >= 100000 },
  { id: 'peak_1m',     icon: '🏦', name: 'Millionaire',       desc: 'Reach a balance of 1,000,000', check: s => s.peakBalance >= 1000000 },

  // Streaks and suffering
  { id: 'dry_50',      icon: '🏜️', name: 'Drought',           desc: '50 spins without a win',       check: s => anyMachine(s, m => m.longestDrySpell >= 50) },
  { id: 'dry_100',     icon: '💀', name: 'The Void',          desc: '100 spins without a win',      check: s => anyMachine(s, m => m.longestDrySpell >= 100) },
  { id: 'streak_5',    icon: '🔥', name: 'Heating Up',        desc: 'Win 5 spins in a row',         check: s => s.longestWinStreak >= 5 },
  { id: 'streak_10',   icon: '⚡', name: 'Impossible Run',     desc: 'Win 10 spins in a row',        check: s => s.longestWinStreak >= 10 },
  { id: 'broke_1',     icon: '🪫', name: 'Tapped Out',        desc: 'Go broke once',                check: s => s.timesBroke >= 1 },
  { id: 'broke_10',    icon: '⚰️', name: 'Serial Offender',   desc: 'Go broke ten times',           check: s => s.timesBroke >= 10 },
  { id: 'near_100',    icon: '😤', name: 'So Close',          desc: '100 two-scatter near misses',  check: s => s.nearMisses >= 100 },

  // Features
  { id: 'feat_1',      icon: '🎁', name: 'Bonus Round',       desc: 'Trigger any feature',          check: s => sumMachines(s, m => m.featureTriggers) >= 1 },
  { id: 'feat_all',    icon: '🎪', name: 'Full Tour',         desc: 'Trigger all five features',    check: s => allMachines(s, m => m.featureTriggers > 0) },
  { id: 'feat_50',     icon: '🎡', name: 'Feature Creep',     desc: 'Trigger 50 features',          check: s => sumMachines(s, m => m.featureTriggers) >= 50 },

  // Pool
  { id: 'pool_1',      icon: '📦', name: 'Handout',           desc: 'Collect the pool once',        check: s => s.poolCollections >= 1 },
  { id: 'pool_50',     icon: '🏗️', name: 'Living Off Welfare', desc: 'Collect the pool 50 times',   check: s => s.poolCollections >= 50 },
  { id: 'pool_100k',   icon: '🏛️', name: 'Institutionalised', desc: 'Collect 100,000 from the pool', check: s => s.poolTotalCollected >= 100000 },
  { id: 'pool_full',   icon: '🫗', name: 'Left It Brewing',    desc: 'Collect a completely full pool', check: s => s.poolTotalCollected >= 6000 && s.poolCollections >= 1 },

  // Shop
  { id: 'turbo_1',     icon: '⏩', name: 'Need For Speed',     desc: 'Buy 2× speed on any machine',  check: s => Object.keys(s.turbo).length >= 1 },
  { id: 'turbo_all',   icon: '🚀', name: 'Fully Loaded',      desc: 'Buy 2× speed on all five',     check: s => Object.keys(s.turbo).length >= MACHINES.length },
  { id: 'autospin',    icon: '🤖', name: 'Hands Free',        desc: `Unlock autospin (${AUTOSPIN_PRICE.toLocaleString()})`, check: s => s.autospin },

  // Long tail
  { id: 'rtp_lucky',   icon: '🍀', name: 'Above The Curve',   desc: 'Actual RTP over 100% after 1,000 spins', check: s => s.totalSpins >= 1000 && actualRTP() > 1 },
  { id: 'rtp_cursed',  icon: '🐈‍⬛', name: 'Cursed',            desc: 'Actual RTP under 40% after 1,000 spins', check: s => s.totalSpins >= 1000 && actualRTP() < 0.4 },
  { id: 'loyal',       icon: '❤️', name: 'Ride Or Die',       desc: '5,000 spins on one machine',   check: s => anyMachine(s, m => m.spins >= 5000) },
  { id: 'playtime_1h', icon: '🕐', name: 'An Hour Gone',      desc: 'Play for one hour',            check: s => s.totalPlaytimeMs >= 3600000 },
  { id: 'playtime_10h',icon: '🕙', name: 'Ten Hours Gone',    desc: 'Play for ten hours',           check: s => s.totalPlaytimeMs >= 36000000 },
];

/**
 * Award anything newly earned.
 *
 * Both the predicate and the celebration are isolated: a throw from either one
 * used to abort the whole loop, so a single failing sound call meant every
 * achievement after it in the list stayed locked forever.
 */
export function checkAchievements() {
  const s = getState();
  for (const a of ACHIEVEMENTS) {
    if (s.achievements.includes(a.id)) continue;

    let hit = false;
    try { hit = a.check(s); } catch { hit = false; }
    if (!hit || !earnAchievement(a.id)) continue;

    try {
      toast(`${a.icon}  ${a.name}`, 'mega', 3200);
      Audio.coin();
    } catch (err) {
      console.warn('[achievements] celebration failed for', a.id, err);
    }
  }
}

export function achievementProgress() {
  const s = getState();
  return { earned: s.achievements.length, total: ACHIEVEMENTS.length };
}
