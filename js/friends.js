/**
 * Friend requests.
 *
 * Adding a friend used to be one-sided: you appeared on my list, you never
 * knew. Now it's a request the other player accepts. One Firestore doc per
 * directed pair, id "<fromUid>_<toUid>", so re-sending is an overwrite rather
 * than spam and "already asked" is a simple id check.
 *
 * Acceptance has to reach the sender somehow, and there are no servers here to
 * push it. So the recipient flips the doc to 'accepted' (adding the sender on
 * their side immediately), and the sender picks that up on next boot via
 * reconcileAccepted(), adds them back, and deletes the doc. Both lists
 * converge without either client ever writing the other's player doc.
 */

import { firebase } from './firebase.js';
import { getState, addFriend } from './state.js';

/**
 * Outgoing requests still waiting, kept in memory so profile buttons can show
 * "Request sent" synchronously. Refreshed by loadRequests().
 */
const pendingOut = new Set();

export function hasPendingRequestTo(uid) {
  return pendingOut.has(uid);
}

/** Both directions in one call: requests to me, and mine still unanswered. */
export async function loadRequests() {
  const fb = await firebase();
  if (!fb) return { incoming: [], outgoing: [] };

  const [inSnap, outSnap] = await Promise.all([
    fb.getDocs(fb.query(
      fb.collection(fb.db, 'friend_requests'),
      fb.where('toUid', '==', fb.uid)
    )),
    fb.getDocs(fb.query(
      fb.collection(fb.db, 'friend_requests'),
      fb.where('fromUid', '==', fb.uid)
    )),
  ]);

  const incoming = [];
  inSnap.forEach(d => {
    const r = d.data();
    if (r.status === 'pending') incoming.push({ id: d.id, ...r });
  });

  const outgoing = [];
  pendingOut.clear();
  outSnap.forEach(d => {
    const r = d.data();
    outgoing.push({ id: d.id, ...r });
    if (r.status === 'pending') pendingOut.add(r.toUid);
  });

  return { incoming, outgoing };
}

/**
 * Ask someone to be friends. Refuses yourself — by uid, and by name+tag too,
 * because your own row can arrive from a leaderboard read with a different
 * doc id than the session you're on.
 */
export async function sendRequest(target) {
  const fb = await firebase();
  if (!fb) return { ok: false, reason: 'offline' };

  const me = getState();
  if (target.uid === fb.uid) return { ok: false, reason: 'self' };
  if (target.name === me.name && target.tag === me.tag) return { ok: false, reason: 'self' };
  if (me.friends.some(f => f.uid === target.uid)) return { ok: false, reason: 'already-friends' };
  if (pendingOut.has(target.uid)) return { ok: false, reason: 'already-sent' };

  try {
    await fb.setDoc(fb.doc(fb.db, 'friend_requests', `${fb.uid}_${target.uid}`), {
      fromUid: fb.uid,
      fromName: me.name || 'Anonymous',
      fromTag: me.tag || '0000',
      toUid: target.uid,
      toName: target.name || 'Anonymous',
      toTag: target.tag || '0000',
      status: 'pending',
      at: fb.serverTimestamp(),
    });
    pendingOut.add(target.uid);
    return { ok: true };
  } catch (err) {
    console.warn('[friends] send failed:', err?.message ?? err);
    return { ok: false, reason: err?.code ?? 'error' };
  }
}

/** Recipient side: add them now, flip the doc so the sender finds out. */
export async function acceptRequest(req) {
  const fb = await firebase();
  if (!fb) return false;

  const added = addFriend({ uid: req.fromUid, name: req.fromName, tag: req.fromTag });
  try {
    await fb.updateDoc(fb.doc(fb.db, 'friend_requests', req.id), { status: 'accepted' });
  } catch (err) {
    // The friendship still counts locally; the sender just won't auto-add
    // until something else nudges them. Better lopsided than lost.
    console.warn('[friends] accept flag failed:', err?.message ?? err);
  }
  return added;
}

export async function declineRequest(req) {
  const fb = await firebase();
  if (!fb) return false;
  try {
    await fb.deleteDoc(fb.doc(fb.db, 'friend_requests', req.id));
    return true;
  } catch (err) {
    console.warn('[friends] decline failed:', err?.message ?? err);
    return false;
  }
}

export async function cancelRequest(req) {
  pendingOut.delete(req.toUid);
  return declineRequest(req);   // same delete, different intent
}

/**
 * Sender side of the handshake: collect acceptances that happened while we
 * were away, add those friends, and clean the docs up. Ran once per boot.
 */
export async function reconcileAccepted() {
  const fb = await firebase();
  if (!fb) return 0;

  try {
    const snap = await fb.getDocs(fb.query(
      fb.collection(fb.db, 'friend_requests'),
      fb.where('fromUid', '==', fb.uid)
    ));

    let added = 0;
    const cleanups = [];
    snap.forEach(d => {
      const r = d.data();
      if (r.status !== 'accepted') return;
      if (addFriend({ uid: r.toUid, name: r.toName, tag: r.toTag })) added++;
      cleanups.push(fb.deleteDoc(fb.doc(fb.db, 'friend_requests', d.id)));
    });
    await Promise.allSettled(cleanups);
    return added;
  } catch (err) {
    console.warn('[friends] reconcile failed:', err?.message ?? err);
    return 0;
  }
}
