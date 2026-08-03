/**
 * Auth.
 *
 * Two doors, and the difference matters:
 *
 *   guest  — anonymous Firebase user. Works instantly, no sign-in, but the
 *            identity lives in this browser only. Clear your data and it is
 *            gone, along with the leaderboard entry attached to it.
 *   google — a real account. The uid is stable across devices and browsers,
 *            which is what makes cloud saves possible at all.
 *
 * A guest can upgrade to Google later WITHOUT losing anything: linkWithPopup
 * keeps the same uid, so the leaderboard row and cloud save carry straight
 * over. That is why upgrading is a link, never a fresh sign-in.
 */

import { firebase, isConfigured } from './firebase.js';
import { getState, setName, save } from './state.js';
import { Events } from './events.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

let _auth = null;
let _user = null;

export function currentUser() {
  return _user;
}

export function isSignedIn() {
  return !!_user && !_user.isAnonymous;
}

export function isGuest() {
  return !!_user && _user.isAnonymous;
}

export function hasOnboarded() {
  return !!getState().onboarded;
}

async function authMod() {
  return import(`${SDK}/firebase-auth.js`);
}

/** Resolve the live user, waiting out Firebase's initial state restore. */
export async function initAuth() {
  const fb = await firebase();
  if (!fb) return null;
  _auth = fb.auth;

  const mod = await authMod();
  _user = await new Promise(resolve => {
    const stop = mod.onAuthStateChanged(_auth, u => { stop(); resolve(u); });
  });

  if (_user) Events.emit('auth:change', { user: _user });
  return _user;
}

export async function signInAsGuest() {
  const fb = await firebase();
  if (!fb) return null;
  const mod = await authMod();
  if (_auth.currentUser) {
    _user = _auth.currentUser;
  } else {
    const cred = await mod.signInAnonymously(_auth);
    _user = cred.user;
  }
  Events.emit('auth:change', { user: _user });
  return _user;
}

/**
 * Sign in with Google.
 *
 * If the player is currently an anonymous guest we LINK rather than sign in,
 * so their uid survives and their progress and leaderboard entry come with
 * them. If that account is already linked to another Google user, Firebase
 * throws credential-already-in-use and we fall back to signing into the
 * existing account.
 */
export async function signInWithGoogle() {
  const fb = await firebase();
  if (!fb) throw new Error('Firebase unavailable');
  const mod = await authMod();
  const provider = new mod.GoogleAuthProvider();

  try {
    if (_auth.currentUser?.isAnonymous) {
      const cred = await mod.linkWithPopup(_auth.currentUser, provider);
      _user = cred.user;
    } else {
      const cred = await mod.signInWithPopup(_auth, provider);
      _user = cred.user;
    }
  } catch (err) {
    if (err?.code === 'auth/credential-already-in-use' ||
        err?.code === 'auth/email-already-in-use') {
      // This Google account already has its own save. Use that one.
      const cred = await mod.signInWithPopup(_auth, provider);
      _user = cred.user;
    } else {
      throw err;
    }
  }

  if (_user?.displayName && !getState().name) {
    setName(_user.displayName.split(' ')[0]);
  }
  Events.emit('auth:change', { user: _user });
  return _user;
}

export async function signOut() {
  const fb = await firebase();
  if (!fb) return;
  const mod = await authMod();
  await mod.signOut(_auth);
  _user = null;
  Events.emit('auth:change', { user: null });
}

/** Human-readable label for the settings screen. */
export function accountLabel() {
  if (!isConfigured()) return 'Offline — local only';
  if (!_user) return 'Not signed in';
  if (_user.isAnonymous) return 'Guest (this browser only)';
  return _user.email || _user.displayName || 'Signed in';
}

export function markOnboarded() {
  const s = getState();
  s.onboarded = true;
  save(true);
}
