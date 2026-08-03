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

/**
 * Always prefer the SDK's live user over our cached copy.
 *
 * _user used to be a snapshot taken once during boot, and every caller —
 * Settings, the login door, sync — read that stale copy. Anything Firebase did
 * after that instant (finishing a link, swapping accounts, hydrating the
 * session late) was invisible, which is how Settings could claim "link Google"
 * while the session was in fact signed in.
 */
export function currentUser() {
  return _auth?.currentUser ?? _user;
}

export function isSignedIn() {
  const u = currentUser();
  return !!u && !u.isAnonymous;
}

export function isGuest() {
  const u = currentUser();
  return !!u && u.isAnonymous;
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

  // Survive a refresh. Firebase defaults to local persistence, but it silently
  // falls back to in-memory when IndexedDB is unavailable — private windows,
  // some embedded browsers — and an in-memory session means a brand new
  // anonymous uid on every reload, which reads as "it logged me out again".
  // Asking explicitly makes the failure visible instead of silent.
  try {
    await mod.setPersistence(_auth, mod.browserLocalPersistence);
  } catch (err) {
    console.warn('[auth] local persistence unavailable, session will not survive reload:', err?.message ?? err);
  }

  // Finish a sign-in that was started as a redirect. This has to happen
  // before we read the session, or the returning user looks signed out.
  try {
    const res = await mod.getRedirectResult(_auth);
    if (res?.user) _user = res.user;
  } catch (err) {
    console.warn('[auth] redirect result failed:', err?.code ?? err?.message ?? err);
  }

  // authStateReady() resolves once Firebase has finished restoring the
  // persisted session. onAuthStateChanged can fire an initial null BEFORE that
  // restore completes, and taking that first callback made a signed-in player
  // look signed out on every reload.
  if (typeof _auth.authStateReady === 'function') {
    await _auth.authStateReady();
    _user = _auth.currentUser;
  } else {
    _user = await new Promise(resolve => {
      let settled = false;
      const stop = mod.onAuthStateChanged(_auth, u => {
        // Ignore a null that arrives before the restore has had a chance.
        if (!settled && u === null && !_auth.currentUser) return;
        settled = true;
        stop();
        resolve(u ?? _auth.currentUser ?? null);
      });
      // Never hang the boot on a restore that isn't coming.
      setTimeout(() => {
        if (settled) return;
        settled = true;
        stop();
        resolve(_auth.currentUser ?? null);
      }, 4000);
    });
  }

  // From here on, track every auth transition for the app's lifetime — not
  // just the boot snapshot. Each change updates the cache and asks the UI to
  // redraw, so a link completing or an account swap can never leave a screen
  // describing the previous state.
  mod.onAuthStateChanged(_auth, u => {
    _user = u;
    Events.emit('auth:change', { user: u });
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
 * If somebody is already signed in — guest OR name+password — we LINK rather
 * than sign in fresh, so their uid survives and their progress and leaderboard
 * row come with them. Linking Google onto an email/password account is
 * perfectly valid; an earlier version only linked for anonymous users and sent
 * everyone else through signInWithPopup, which silently swapped them into a
 * different account instead of attaching Google to the one they were using.
 *
 * When the Google account already belongs to someone else, we recover using
 * the credential carried on the error rather than opening a second popup.
 * That second popup is no longer inside the original click, so browsers block
 * it — which is what surfaced as "linking just errors".
 */
export async function signInWithGoogle() {
  const fb = await firebase();
  if (!fb) throw new Error('Firebase unavailable');
  const mod = await authMod();
  const provider = new mod.GoogleAuthProvider();

  try {
    if (_auth.currentUser) {
      const cred = await mod.linkWithPopup(_auth.currentUser, provider);
      _user = cred.user;
    } else {
      const cred = await mod.signInWithPopup(_auth, provider);
      _user = cred.user;
    }
  } catch (err) {
    // Popups are fragile in ways we cannot fix from the page. Firebase polls
    // popup.closed to detect cancellation, and a Cross-Origin-Opener-Policy
    // header blocks that read — GitHub Pages sets one and we cannot override
    // it on a static host. Blockers and mobile browsers break popups too.
    // Redirect works everywhere; getRedirectResult() above completes it.
    if (isPopupUnusable(err)) {
      console.warn('[auth] popup unusable, switching to redirect:', err?.code);
      if (_auth.currentUser) await mod.linkWithRedirect(_auth.currentUser, provider);
      else await mod.signInWithRedirect(_auth, provider);
      // The page navigates away here; nothing after this runs.
      return null;
    }

    const taken = err?.code === 'auth/credential-already-in-use'
      || err?.code === 'auth/email-already-in-use'
      || err?.code === 'auth/account-exists-with-different-credential';
    if (!taken) throw err;

    // That Google account already has its own save, so we're about to abandon
    // this uid and adopt theirs. Clean up the doc we're leaving behind FIRST —
    // once we've switched we're no longer its owner and the rules will refuse
    // the delete, stranding a duplicate player on every leaderboard forever.
    const credential = mod.GoogleAuthProvider.credentialFromError(err);
    if (!credential) throw err;

    const abandoning = _auth.currentUser;
    if (abandoning) {
      const { deleteMyPlayerDoc } = await import('./sync.js');
      await deleteMyPlayerDoc().catch(() => {});
      // An anonymous account with nothing left pointing at it is pure litter.
      if (abandoning.isAnonymous) await abandoning.delete().catch(() => {});
    }

    const cred = await mod.signInWithCredential(_auth, credential);
    _user = cred.user;
  }

  if (_user?.displayName && !getState().name) {
    setName(_user.displayName.split(' ')[0]);
  }
  Events.emit('auth:change', { user: _user });
  return _user;
}

/**
 * True when the failure is the popup mechanism itself rather than the sign-in.
 *
 * These are all "the browser would not let us drive a popup", not "the user
 * declined" — so retrying via redirect is the right move rather than showing
 * an error.
 */
function isPopupUnusable(err) {
  return [
    'auth/popup-blocked',
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported',
    'auth/internal-error',
  ].includes(err?.code);
}

/**
 * Sign out and return to the login screen.
 *
 * A guest signing out is destructive in a way a real sign-out isn't: the
 * anonymous uid IS the account, so there's nothing to sign back into. The
 * caller is expected to warn before calling this for a guest.
 */
export async function signOut({ clearOnboarding = true } = {}) {
  const fb = await firebase();
  const mod = fb ? await authMod() : null;

  if (mod) await mod.signOut(_auth).catch(() => {});
  _user = null;

  if (clearOnboarding) {
    const s = getState();
    s.onboarded = false;
    save(true);
  }
  Events.emit('auth:change', { user: null });
}

// ── Name + password accounts ────────────────────────────────────────────────
//
// Firebase's email/password provider needs an email, but nobody wants to type
// one to play slots with their mates. So a name is turned into a synthetic
// address: "Jaxon" becomes "jaxon@boysnight.local". Players only ever see a
// name and a password.
//
// Two consequences worth knowing:
//   - names become globally unique, which is arguably right for a leaderboard
//   - there is NO password reset, because there is no real inbox behind it.
//     Forget the password and that name is gone.

const NAME_DOMAIN = 'boysnight.local';
export const MIN_PASSWORD = 6;

export function nameToEmail(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]/g, '') || 'player';
  return `${slug}@${NAME_DOMAIN}`;
}

/** True for a synthetic name-account rather than a real email/Google login. */
export function isNameAccount(user = _user) {
  return !!user?.email?.endsWith('@' + NAME_DOMAIN);
}

/**
 * Claim a name with a password, or sign back into one already claimed.
 *
 * Creation is attempted FIRST on purpose. Firebase's email-enumeration
 * protection collapses "no such user" and "wrong password" into the same
 * `auth/invalid-credential` error, so probing with sign-in first cannot tell
 * a free name from a wrong password. Create-then-fallback can: an
 * `email-already-in-use` failure proves the name is taken, and only then does a
 * sign-in failure unambiguously mean the password was wrong.
 */
export async function signInWithName(name, password) {
  const fb = await firebase();
  if (!fb) throw new Error('Firebase unavailable');
  const mod = await authMod();
  const email = nameToEmail(name);

  const credential = mod.EmailAuthProvider.credential(email, password);
  const anon = _auth.currentUser?.isAnonymous ? _auth.currentUser : null;

  try {
    // Linking keeps the anonymous uid, so guest progress and any leaderboard
    // row survive the upgrade instead of starting over.
    const cred = anon
      ? await mod.linkWithCredential(anon, credential)
      : await mod.createUserWithEmailAndPassword(_auth, email, password);
    _user = cred.user;
    await mod.updateProfile(_user, { displayName: name }).catch(() => {});
  } catch (err) {
    const taken = err?.code === 'auth/email-already-in-use'
      || err?.code === 'auth/credential-already-in-use';
    if (!taken) throw err;

    // Name exists — this is a returning player, so sign in properly. Same
    // cleanup as the Google path: shed the uid we're leaving before we lose
    // the right to delete its document.
    const abandoning = _auth.currentUser;
    if (abandoning?.isAnonymous) {
      const { deleteMyPlayerDoc } = await import('./sync.js');
      await deleteMyPlayerDoc().catch(() => {});
      await abandoning.delete().catch(() => {});
    }

    const cred = await mod.signInWithEmailAndPassword(_auth, email, password);
    _user = cred.user;
  }

  Events.emit('auth:change', { user: _user });
  return _user;
}

/** Turn a human error code into something a player can act on. */
export function describeAuthError(code) {
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled in Firebase yet';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'That name is taken and the password does not match';
    case 'auth/weak-password':
      return `Password must be at least ${MIN_PASSWORD} characters`;
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup — allow popups and retry';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase Authentication settings';
    case 'auth/provider-already-linked':
      return 'Google is already linked to this account';
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a moment and try again';
    case 'auth/network-request-failed':
      return 'Network problem — check your connection';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return '';
    default:
      return code ? `Sign-in failed: ${code}` : 'Sign-in failed';
  }
}

/** Human-readable label for the settings screen. */
export function accountLabel() {
  if (!isConfigured()) return 'Offline — local only';
  if (!_user) return 'Not signed in';
  if (_user.isAnonymous) return 'Guest (this browser only)';
  if (isNameAccount(_user)) return `${_user.displayName || _user.email.split('@')[0]} · name + password`;
  return _user.email || _user.displayName || 'Signed in';
}

export function markOnboarded() {
  const s = getState();
  s.onboarded = true;
  save(true);
}
