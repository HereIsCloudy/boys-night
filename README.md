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

| Machine | Feature | RTP |
|---|---|---|
| **Garry Slots** | Expanding Wilds — a wild blooms to fill its reel | 60% |
| **Josh Slots** | Free Spins — 3 scatters, 10 spins, retriggerable | 60% |
| **Jaxon Slots** | Multiplier Wilds — wilds carry ×2 to ×10 | 62% |
| **Mint Slots** | Cascades — wins vanish, symbols drop, chains climb | 61% |
| **Hayden Slots** | Hold & Spin — lock coins, 3 respins, fill the grid | 58% |

## The odds

A spin doesn't look up a fixed paytable. It rolls a **band**, then rolls a
random multiplier inside that band, skewed hard toward the bottom. Nobody ever
wins the same amount twice, and a 14,000× is a genuine legend rather than the
same number everyone else got.

| Band | Range | Roughly |
|---|---|---|
| Dust | 0.2× – 1.5× | 1 in 8 spins |
| Small | 2× – 10× | 1 in 32 |
| Medium | 20× – 100× | 1 in 250 |
| Big | 500× – 2,000× | 1 in 5,800 |
| **Mega** | **5,000× – 15,000×** | **1 in 94,000** |

About 84% of spins pay nothing. Of the ones that do, most pay less than you
staked — that's the dust band, and it's what makes 60% RTP playable instead of
just punishing.

Worth knowing: Big and Mega together are roughly **40% of all returned value**,
locked in outcomes most players will never see. The RTP a typical player
*experiences* is closer to 45%. That's the design, not an accident.

Hard ceiling of 15,000× per spin, enforced in the engine.

## The economy

The slots are the sink; the **pool** is the income. 500 coins accrue every 10
minutes, capped at 6,000, collect whenever you want. Hit zero and the next drop
lands immediately rather than leaving you staring at a dead machine.

Because the pool is the income, the bet range is deliberately small (1–25).
Bet size and pool rate are one knob, not two.

## Unlocks

- **2× Speed** — 67,420 per machine. It makes you lose money twice as fast and
  reach the 1-in-94,000 tail twice as fast. A variance amplifier, not an edge.
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
return but fires once in 94,000 spins). **Phase 2** audits constructed grids:
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
css/     theme.css (5 themes) · app.css · game.css · stats.css
js/
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
```

The engine is **outcome-first**: roll the band, roll the multiplier, then build
a grid that justifies the result. That's what makes RTP exactly tunable instead
of an emergent property of symbol weights you'd chase with a simulator forever.
The grid is still audited for consistency, so the reels never lie about what
they paid.

Everything visual sits behind the CSS custom properties in `theme.css`, so a
new theme is one block and touches nothing else.

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
