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
import { getState, exportSave, importSave, hasPendingTag, setTag } from './state.js';
import { MACHINES } from './machines.js';
import { isSignedIn } from './auth.js';

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
    tag: s.tag,
    totalSpins: s.totalSpins,
    totalWagered: s.totalWagered,
    peakBalance: s.peakBalance,
    biggestWinAmount: s.biggestWin?.amount ?? 0,
    biggestMultiplier: s.biggestMultiplier,
    longestWinStreak: s.longestWinStreak,
    megaWins: MACHINES.reduce((t, m) => t + (s.perMachine[m.id]?.bands?.mega ?? 0), 0),
    poolCollected: s.poolTotalCollected,
    achievements: s.achievements.length,
    // Shown on the profile modal (leaderboard.js) for anyone who looks you up.
    badges: s.badges,
    // Not rendered anywhere yet, but riding along here means a signed-in
    // player's friend list survives a cloud restore on a fresh device even
    // before the full save blob below is pulled.
    friends: s.friends,
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

/**
 * Claim the next sequential tag for this player's name.
 *
 * The first Jaxon is #0001, the second #0002. Working that out means asking
 * who else already holds the name, so it can only happen online — which is why
 * a new player starts on the #0000 placeholder and gets upgraded here.
 *
 * Two people claiming the same name at the same instant could collide on a
 * number. For a game played among friends that's an acceptable trade against
 * the alternative, which is a transaction on every single sign-up.
 */
export async function claimTag() {
  const fb = await firebase();
  if (!fb || !hasPendingTag()) return null;

  const name = getState().name || 'Anonymous';
  try {
    const q = fb.query(fb.collection(fb.db, 'players'), fb.where('name', '==', name));
    const docs = await fb.getDocs(q);

    let highest = 0;
    docs.forEach(d => {
      if (d.id === fb.uid) return;           // don't count ourselves
      const t = parseInt(d.data()?.tag ?? '0', 10);
      if (Number.isFinite(t) && t > highest) highest = t;
    });

    return setTag(String(Math.min(9999, highest + 1)));
  } catch (err) {
    console.warn('[sync] tag claim failed:', err?.message ?? err);
    return null;
  }
}

export async function flush() {
  const fb = await firebase();
  if (!fb) return false;

  // Make sure the tag is real before it goes anywhere public.
  if (hasPendingTag()) await claimTag();

  const snap = snapshot();
  try {
    const payload = { ...snap, uid: fb.uid, updatedAt: fb.serverTimestamp() };

    // Cloud saves are for real accounts only. A guest uid dies with the
    // browser that made it, so storing a full save against one would burn
    // quota on something nobody can ever restore.
    if (isSignedIn()) {
      payload.save = exportSave();
      payload.saveVersion = snap.totalSpins;
    }

    await fb.setDoc(fb.doc(fb.db, 'players', fb.uid), payload, { merge: true });
    lastSyncAt = Date.now();
    lastSignature = signature(snap);
    return true;
  } catch (err) {
    console.warn('[sync] write failed:', err?.message ?? err);
    return false;
  }
}

/**
 * Pull a cloud save after signing in.
 *
 * Only overwrites local when the cloud copy is genuinely further along. A new
 * device starts at zero spins, so "cloud has more" is the signal that this is
 * a restore rather than a fresh save about to be uploaded. Without that guard,
 * signing in on a second device would happily wipe the account it just loaded.
 */
export async function pullCloudSave({ force = false } = {}) {
  const fb = await firebase();
  if (!fb || !isSignedIn()) return { restored: false, reason: 'not-signed-in' };

  try {
    const snap = await fb.getDoc(fb.doc(fb.db, 'players', fb.uid));
    if (!snap.exists()) return { restored: false, reason: 'no-cloud-save' };

    const data = snap.data();
    if (!data.save) return { restored: false, reason: 'no-cloud-save' };

    const cloudSpins = data.saveVersion ?? 0;
    const localSpins = getState().totalSpins;
    if (!force && cloudSpins <= localSpins) {
      return { restored: false, reason: 'local-is-newer', cloudSpins, localSpins };
    }

    // importSave refuses saves from another schema, which is the correct
    // behaviour but is worth naming so it isn't mistaken for a network fault.
    const ok = importSave(data.save);
    return { restored: ok, reason: ok ? undefined : 'schema-mismatch', cloudSpins, localSpins };
  } catch (err) {
    console.warn('[sync] cloud restore failed:', err?.message ?? err);
    return { restored: false, reason: err?.code ?? 'error' };
  }
}

/**
 * Delete the signed-in player's leaderboard document.
 *
 * Called just before an account switch. When linking fails because the Google
 * account already exists, we abandon the current uid and adopt the other one —
 * and the doc we leave behind keeps showing on every board forever as a ghost
 * player nobody can remove, because the rules (correctly) only let you delete
 * your own document. So it has to go while we are still that user.
 */
export async function deleteMyPlayerDoc() {
  const fb = await firebase();
  if (!fb) return false;
  try {
    await fb.deleteDoc(fb.doc(fb.db, 'players', fb.uid));
    return true;
  } catch (err) {
    console.warn('[sync] could not remove old player doc:', err?.message ?? err);
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
