# BOYS NIGHT

Five slot machines named after the boys. Terrible odds on purpose. A pool that
drips coins so you can keep losing them, global leaderboards, and a stat
tracker that records more than is strictly reasonable.

Static site — vanilla ES modules, no build step, no framework, no dependencies.
Open `index.html` and it runs.

---

## The machines

All five are siblings: same 5×3 grid, same 20 paylines, same bet range, same
odds table, all unlocked from the start. What separates them is the signature
feature and a couple of points of RTP.

| Machine | Feature | RTP | Feature fires |
|---|---|---|---|
| **Garry Slots** | Expanding Wilds — a wild blooms to fill its reel | 48% | 1 in 100 |
| **Josh Slots** | Free Spins — 3 scatters, 10 spins, retriggerable | 48% | 1 in 300 |
| **Jaxon Slots** | Multiplier Wilds — wilds carry ×2 to ×10 | 50% | 1 in 500 |
| **Mint Slots** | Cascades — wins vanish, symbols drop, chains climb | 49% | 1 in 150 |
| **Hayden Slots** | Hold & Spin — lock coins, 3 respins, fill the grid | 46% | 1 in 400 |

Feature frequency trades against feature payout: Garry's fires six times as
often as Jaxon's and pays a fraction as much.

## The odds

A spin doesn't look up a fixed paytable. It rolls a **band**, then rolls a
random multiplier inside that band, skewed hard toward the bottom. Nobody ever
wins the same amount twice, and a 14,000× is a genuine legend rather than the
same number everyone else got.

| Band | Range | Roughly |
|---|---|---|
| Dust | 0.2× – 2× | 1 in 13 spins |
| Small | 2× – 20× | 1 in 66 |
| Medium | 20× – 200× | 1 in 540 |
| Big | 200× – 2,000× | 1 in 6,100 |
| **Mega** | **2,000× – 15,000×** | **1 in 78,000** |

The ranges are **contiguous**, so every multiplier between 0.2× and 15,000× is
reachable — payouts are genuinely random rather than snapping to a handful of
tiers. The bands only shape how often each magnitude turns up.

About 90% of spins pay nothing. Of the ones that do, most pay less than you
staked — that's the dust band, and it's what keeps a sub-50% machine playable
instead of just silent.

**RTP is a mean, and the mean lies.** Big and Mega carry a large share of the
payback but fire 1-in-6,100 and 1-in-78,000, so a normal session never touches
them. What a player actually experiences is the median — see below.

## What a session actually feels like

`node tools/session.js` simulates real play. Starting with $500 and spinning
100 times at $5:

| | median | p25 | p75 | mean |
|---|---|---|---|---|
| Typical machine | **~$88** | ~$45 | ~$165 | ~$240 |

Roughly **63% of sessions end between $0 and $120**. The mean is nearly three
times the median, and that gap is the entire design: almost everyone bleeds,
occasionally somebody moons.

Hard ceiling of 15,000× per spin, enforced in the engine.

## The economy

The slots are the sink; the **pool** is the income. 500 coins accrue every 10
minutes, capped at 6,000, collect whenever you want. Hit zero and the next drop
lands immediately rather than leaving you staring at a dead machine.

Because the pool is the income, the bet range is deliberately small (1–25).
Bet size and pool rate are one knob, not two.

## Unlocks

- **2× Speed** — 67,420 per machine. It makes you lose money twice as fast and
  reach the 1-in-78,000 tail twice as fast. A variance amplifier, not an edge.
- **Autospin** — 420,670, once, all machines. Counts of 10/25/50/100/∞. Stops
  automatically on a bonus trigger or any win of 10× or more; ordinary dust and
  small wins tick past without interrupting.

---

## Running it

```bash
python -m http.server 8000      # or: npx serve .
```

Open <http://localhost:8000>. There is no build step.

### Verifying the maths

```bash
npm run sim          # 5M spins per machine + a grid integrity audit
npm run sim:deep     # 20M spins
node tools/calibrate.js
```

`sim.js` checks two things. **Phase 1** compares each machine's analytic RTP
against its advertised number (the analytic figure is the one to trust —
measured RTP carries real sampling noise because the Mega band is ~12% of the
return but fires once in 78,000 spins). **Phase 2** audits constructed grids:
a losing spin must never render a visible winning line, a winning spin must
render the line it paid for, scatters must match feature triggers, and nothing
may exceed the 15,000× cap.

`calibrate.js` measures what each feature is actually worth. Run it after
changing any feature's logic and paste the `featureEV` numbers into
`machines.js` — the RTP budget depends on them, and guessing from `featureSpins`
is wrong for every feature except plain free spins.

---

## How it fits together

```
index.html
css/     theme.css (5 themes) · app.css · game.css · stats.css · login.css
js/
  login.js        animated entry screen, guest + Google
  auth.js         anonymous / Google sign-in, guest upgrade via linking
  engine.js       pure spin logic — no DOM, no state, no globals
  bands.js        win bands, skewed rolls, the 15,000x ceiling
  machines.js     the five configs and the RTP budget algebra
  rng.js          seeded, provably fair
  state.js        localStorage, every statistic, the pool
  game.js         reels, autospin, tier-scaled celebration
  lobby.js  stats.js  leaderboard.js  shop.js  settings.js  main.js
  sync.js         throttled Firestore writes
  firebase.js     optional — blank config means local-only
tools/
  sim.js          RTP verifier + grid audit
  calibrate.js    feature EV measurement
  session.js      what a real 100-spin session ends on
```

The engine is **outcome-first**: roll the band, roll the multiplier, then build
a grid that justifies the result. That's what makes RTP exactly tunable instead
of an emergent property of symbol weights you'd chase with a simulator forever.
The grid is still audited for consistency, so the reels never lie about what
they paid.

Everything visual sits behind the CSS custom properties in `theme.css`, so a
new theme is one block and touches nothing else.

## Accounts and cloud saves

The login screen offers two doors:

- **Guest** — anonymous Firebase user, instant, no sign-in. The identity lives
  in that browser only, so clearing site data loses it.
- **Google** — a real account. The uid is stable across devices, which is what
  makes cloud saves work.

A guest can upgrade later without losing anything: signing in **links** the
Google credential to the existing anonymous uid, so the leaderboard row and
save carry straight over rather than starting fresh.

For signed-in players the whole save is stored in Firestore and restored on a
new device. The restore only overwrites local when the cloud copy is further
along, so signing in on a second device can't wipe the account it just loaded.
Guests don't get cloud saves — a guest uid dies with its browser, so storing a
save against one would burn quota on something nobody could ever restore.

Google sign-in needs the provider enabled in the Firebase console
(**Authentication → Sign-in method → Google**). Until then the button reports
`operation-not-allowed` and guest play still works.

## Leaderboards

Eight global boards plus one per machine. Optional — see **[FIREBASE.md](FIREBASE.md)**.
Without it the game is fully playable and records stay local.

Click a row on the Biggest Win or Biggest Multi board to replay the exact reels
that paid.

## Themes

Jaxon (default), Riley, Josh, Talon, Hayden. Josh's is a deliberate light theme
that drops the neon bloom for hard edges — glow needs something dark behind it
or it turns to mud. Settings also has a **reduce motion** toggle, since the
default presentation goes hard.
