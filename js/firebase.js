/**
 * Firebase: hosting is just static files, so this module only handles auth and
 * Firestore for the leaderboards.
 *
 * Everything here is optional. If FIREBASE_CONFIG is left blank, or the network
 * is down, or the SDK fails to load, the game carries on exactly as before with
 * local-only records. Leaderboards are a bonus layer, never a dependency.
 *
 * SETUP — see FIREBASE.md. Paste your web app config below.
 */

export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

let _ready = null;
let _ctx = null;

export function isConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

/**
 * Lazily boot Firebase. Resolves to null when unavailable, and every caller
 * treats null as "run offline" rather than as an error.
 */
export function firebase() {
  if (_ready) return _ready;

  _ready = (async () => {
    if (!isConfigured()) return null;
    try {
      const [{ initializeApp }, authMod, storeMod] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);

      const app = initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      const db = storeMod.getFirestore(app);

      // Anonymous auth: everyone gets a stable identity and a display name,
      // nobody has to make an account to appear on a leaderboard.
      const cred = await authMod.signInAnonymously(auth);

      _ctx = {
        app, auth, db,
        uid: cred.user.uid,
        ...storeMod,
      };
      return _ctx;
    } catch (err) {
      console.warn('[firebase] unavailable, running offline:', err?.message ?? err);
      return null;
    }
  })();

  return _ready;
}

export function ctx() {
  return _ctx;
}
