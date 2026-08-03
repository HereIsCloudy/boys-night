/**
 * Firestore sync.
 *
 * The whole leaderboard system is one document per player. Boards are just
 * queries over that collection ordered by different fields, so a single write
 * updates your rank on every board at once — no fan-out, no per-board
 * documents, no write amplification.
 *
 * Writes are heavily throttled. A slots game does thousands of spins per
 * session and the Firestore free tier allows 20k writes a day, so we only sync
 * when a leaderboard-relevant record actually improves, and never more than
 * once every SYNC_MIN_INTERVAL.
 */

import { firebase } from './firebase.js';
import { getState } from './state.js';
import { MACHINES } from './machines.js';

const SYNC_MIN_INTERVAL = 45_000;

let lastSyncAt = 0;
let pending = false;
let timer = null;
let lastSignature = '';

/** The only values that can move you on a board. Nothing else triggers a write. */
function snapshot() {
  const s = getState();
  return {
    name: s.name || 'Anonymous',
    totalSpins: s.totalSpins,
    totalWagered: s.totalWagered,
    peakBalance: s.peakBalance,
    biggestWinAmount: s.biggestWin?.amount ?? 0,
    biggestMultiplier: s.biggestMultiplier,
    longestWinStreak: s.longestWinStreak,
    megaWins: MACHINES.reduce((t, m) => t + (s.perMachine[m.id]?.bands?.mega ?? 0), 0),
    poolCollected: s.poolTotalCollected,
    achievements: s.achievements.length,
    biggestWin: s.biggestWin
      ? {
          amount: s.biggestWin.amount,
          multiplier: s.biggestWin.multiplier,
          machineId: s.biggestWin.machineId,
          bet: s.biggestWin.bet,
          // Flattened: Firestore rejects nested arrays.
          grid: s.biggestWin.grid.flat(),
          at: s.biggestWin.at,
        }
      : null,
    perMachine: Object.fromEntries(
      MACHINES.map(m => {
        const ms = s.perMachine[m.id];
        return [m.id, { bestWin: ms.biggestWin, bestMulti: ms.biggestMultiplier, spins: ms.spins }];
      })
    ),
  };
}

function signature(snap) {
  return [
    snap.name, snap.biggestWinAmount, snap.biggestMultiplier, snap.peakBalance,
    snap.longestWinStreak, snap.megaWins, snap.achievements,
    Math.floor(snap.totalSpins / 250), Math.floor(snap.totalWagered / 5000),
  ].join('|');
}

/**
 * Ask for a sync. Cheap to call after every spin — it returns immediately
 * unless a record actually changed.
 */
export function queueSync(force = false) {
  const snap = snapshot();
  const sig = signature(snap);
  if (!force && sig === lastSignature) return;

  pending = true;
  if (timer) return;

  const wait = force ? 0 : Math.max(0, SYNC_MIN_INTERVAL - (Date.now() - lastSyncAt));
  timer = setTimeout(async () => {
    timer = null;
    if (!pending) return;
    pending = false;
    await flush();
  }, wait);
}

export async function flush() {
  const fb = await firebase();
  if (!fb) return false;

  const snap = snapshot();
  try {
    await fb.setDoc(
      fb.doc(fb.db, 'players', fb.uid),
      { ...snap, uid: fb.uid, updatedAt: fb.serverTimestamp() },
      { merge: true }
    );
    lastSyncAt = Date.now();
    lastSignature = signature(snap);
    return true;
  } catch (err) {
    console.warn('[sync] write failed:', err?.message ?? err);
    return false;
  }
}

/** Last chance to persist a record before the tab closes. */
export function installUnloadSync() {
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending) flush();
  });
  addEventListener('pagehide', () => { if (pending) flush(); });
}
