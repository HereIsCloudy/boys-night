/**
 * Badges.
 *
 * Achievements (achievements.js) are the completionist list — dozens of them,
 * all shown at once, and earning one is forever. Badges are the highlight
 * reel: a shorter, flashier set meant to be shown off. Up to MAX_BADGES of
 * the ones you've earned ride along on your leaderboard profile (see the
 * picker in settings.js and state.js's toggleBadge).
 *
 * `earned` takes a state object and is recomputed live rather than stored, so
 * a badge can never be "un-earned" by a save migration that resets a counter
 * underneath it. It also means another player's profile can't fake a badge —
 * we only ever look up the ids they've chosen against this list for the
 * icon/name/desc, never re-derive `earned` from a stranger's partial doc.
 */

import { MACHINES } from './machines.js';

const anyMachine = (s, fn) => MACHINES.some(m => fn(s.perMachine[m.id], m));
const allMachines = (s, fn) => MACHINES.every(m => fn(s.perMachine[m.id], m));
const sumMachines = (s, fn) => MACHINES.reduce((t, m) => t + fn(s.perMachine[m.id], m), 0);

export const BADGES = [
  { id: 'mega_win',        icon: '🔴', name: 'Mega Win',          desc: 'Land a 5,000x+ win',                 earned: s => sumMachines(s, m => m.bands.mega) >= 1 },
  { id: 'win_10k',         icon: '💎', name: 'Five Digits',       desc: 'Win 10,000 in a single spin',        earned: s => (s.biggestWin?.amount ?? 0) >= 10000 },
  { id: 'mult_1000',       icon: '🚀', name: 'Four-Figure Multi', desc: 'Hit a 1,000x multiplier',            earned: s => s.biggestMultiplier >= 1000 },
  { id: 'millionaire',     icon: '🏦', name: 'Millionaire',       desc: 'Reach a peak balance of 1,000,000',  earned: s => s.peakBalance >= 1000000 },
  { id: 'spins_10k',       icon: '💫', name: 'Certified Degen',   desc: '10,000 lifetime spins',              earned: s => s.totalSpins >= 10000 },
  { id: 'wager_1m',        icon: '🐋', name: 'Whale',             desc: 'Wager 1,000,000 total',              earned: s => s.totalWagered >= 1000000 },
  { id: 'all_five',        icon: '🎮', name: 'Met The Boys',      desc: 'Played all five machines',           earned: s => allMachines(s, m => m.spins > 0) },
  { id: 'full_tour',       icon: '🎪', name: 'Full Tour',         desc: 'Triggered every machine\'s feature', earned: s => allMachines(s, m => m.featureTriggers > 0) },
  { id: 'streak_10',       icon: '🔥', name: 'Impossible Run',    desc: 'Won 10 spins in a row',              earned: s => s.longestWinStreak >= 10 },
  { id: 'pool_100',        icon: '🏗️', name: 'Welfare King',      desc: '100 pool collections',               earned: s => s.poolCollections >= 100 },
  { id: 'achievements_20', icon: '🏅', name: 'Decorated',         desc: '20 achievements earned',             earned: s => s.achievements.length >= 20 },
  { id: 'playtime_10h',    icon: '🕙', name: 'Ten Hours Gone',    desc: 'Played for ten hours',                earned: s => s.totalPlaytimeMs >= 36000000 },
  { id: 'loyal',           icon: '❤️', name: 'Ride Or Die',       desc: '5,000 spins on one machine',         earned: s => anyMachine(s, m => m.spins >= 5000) },
  { id: 'squad',           icon: '🤝', name: 'Squad',             desc: '5 friends added',                    earned: s => (s.friends ?? []).length >= 5 },
];
