# Firebase setup

The game runs perfectly without any of this — leaderboards just stay local.
Do this when you want global boards.

Everything below stays on the **free Spark plan**. No card required.

---

## 1. Create the project

1. Go to <https://console.firebase.google.com> → **Add project**
2. Name it something like `boys-night`
3. Google Analytics: **off** (you don't need it)

## 2. Turn on anonymous auth

**Build → Authentication → Get started → Sign-in method → Anonymous → Enable**

Anonymous auth gives every player a stable identity and a leaderboard slot
without anyone having to make an account.

## 3. Create the database

**Build → Firestore Database → Create database**

- Start in **production mode** (the rules in this repo replace the defaults)
- Pick the region closest to you — `australia-southeast1` for AU

## 4. Register the web app and copy the config

**Project settings (gear icon) → Your apps → Web (`</>`)**

Register the app, then copy the `firebaseConfig` object it shows you into
**`js/firebase.js`**, replacing the empty one at the top:

```js
export const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'boys-night.firebaseapp.com',
  projectId: 'boys-night',
  storageBucket: 'boys-night.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};
```

These values are **safe to commit**. A Firebase web config is not a secret —
it identifies the project, it doesn't authorise anything. The Firestore rules
are what actually protect your data.

## 5. Install the CLI and deploy

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project, alias it "default"
firebase deploy
```

That publishes the site, the Firestore rules, and the indexes together.
Your game is live at `https://<project-id>.web.app`.

Deploy pieces individually if you prefer:

```bash
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

---

## What it costs

Nothing, on Spark. The free quota is 20,000 Firestore writes and 50,000 reads
per day, and the game is built to stay far under that:

- **localStorage is the source of truth.** Every spin, every statistic, every
  symbol counter lives on the device. Firestore never sees a spin.
- **Writes only happen when a leaderboard record actually improves**, throttled
  to at most one every 45 seconds. That's roughly 10–50 writes per session
  instead of the several thousand a per-spin sync would cost.
- **Boards are cached for two minutes**, so tab-flipping doesn't burn reads.

One document per player. Every board is that same collection ordered by a
different field, so a single write updates your rank on all of them at once.

## What it does not do

Cloud Functions require the paid Blaze plan, so there is no server-side score
validation. `firestore.rules` does what it can without one:

- you can only ever write your own document
- lifetime counters can never decrease
- values must be numbers inside sane bounds
- names are length-capped

That stops casual tampering and protects the boards from a single bad write.
Someone determined can still edit their own localStorage and push a fake score.
For a leaderboard among friends that's a fine trade. If it ever matters, the
fix is Blaze plus a Cloud Function that validates writes.

## Troubleshooting

**Boards say "Firebase isn't configured"** — `FIREBASE_CONFIG` in
`js/firebase.js` is still blank, or `apiKey`/`projectId` are missing.

**`permission-denied` in the console** — rules aren't deployed. Run
`firebase deploy --only firestore:rules`.

**A board is empty but you have a score** — that board's field is still 0 for
everyone, or your sync hasn't fired yet. Records push within 45 seconds, or
immediately when you close the tab.

**`The query requires an index`** — only happens if a board gets a filter added
later. The error message contains a direct link that creates the index for you;
then add it to `firestore.indexes.json`.
