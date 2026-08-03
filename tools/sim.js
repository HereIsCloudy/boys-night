/**
 * RTP verifier.
 *
 * Phase 1 rolls bands only, millions of times, to measure RTP and band
 * frequencies against what machines.js advertises.
 *
 * Phase 2 runs full spins with grid construction and audits every grid: a
 * losing spin must never render a visible winning line, and a winning spin
 * must render the line it paid for. This is the check that catches the reels
 * lying about the result.
 *
 *   node tools/sim.js
 *   node tools/sim.js --spins 20000000 --grids 500000
 */

import { MACHINES, BAND_TABLES } from '../js/machines.js';
import { rollBand, rollMultiplier, theoreticalRTP, BANDS, MAX_MULTIPLIER } from '../js/bands.js';
import { spin, evaluateGrid, countScatters, runFeature } from '../js/engine.js';
import { mulberry32 } from '../js/rng.js';

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};

const SPINS = argOf('--spins', 5_000_000);
const GRIDS = argOf('--grids', 100_000);

const fmtPct = n => (n * 100).toFixed(2) + '%';
const fmtNum = n =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' :
  n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
const oneIn = p => (p <= 0 ? '—' : '1 in ' + fmtNum(Math.round(1 / p)));

console.log('\n\x1b[1mBOYS NIGHT — RTP verification\x1b[0m');
console.log(`base band table: ${fmtPct(theoreticalRTP(BANDS))} RTP before feature budget\n`);

// ── Phase 1: RTP and band frequencies ────────────────────────────────────────
console.log(`\x1b[1mPhase 1 — ${fmtNum(SPINS)} spins per machine (math only)\x1b[0m`);
console.log(
  'machine'.padEnd(10) + 'target'.padStart(8) + 'analytic'.padStart(10) +
  'measured'.padStart(19) + 'hits'.padStart(9) + 'feat'.padStart(8) + 'max win'.padStart(10)
);
console.log('─'.repeat(64));

const bandTotals = {};

for (const machine of MACHINES) {
  const bands = BAND_TABLES[machine.id];
  const rng = mulberry32(0xC0FFEE ^ machine.id.length * 7919);

  // Exact expected RTP of this machine's table, free of sampling noise.
  const analytic = theoreticalRTP(bands) * (1 + machine.featureRate * machine.featureEV);

  let staked = 0, returned = 0, hits = 0, features = 0, maxWin = 0;
  const counts = Object.fromEntries(BANDS.map(b => [b.id, 0]));

  for (let i = 0; i < SPINS; i++) {
    staked += 1;
    let total = 0;

    const band = rollBand(rng, bands);
    total += rollMultiplier(rng, band);
    counts[band.id]++;

    // Calls the real runFeature so this measurement can never drift from the
    // game the way a hand-mirrored copy would.
    if (rng() < machine.featureRate) {
      features++;
      total += runFeature(machine, rng, bands).multiplier;
    }

    // spin() clamps the combined base+feature payout, so measure the clamped
    // value or this loop reports winnings the game will never actually pay.
    total = Math.min(MAX_MULTIPLIER, total);
    returned += total;
    if (total > 0) hits++;
    if (total > maxWin) maxWin = total;
  }

  bandTotals[machine.id] = { counts, spins: SPINS };

  const rtp = returned / staked;
  // The Mega band is ~12% of RTP but fires 1-in-80K, so measured RTP carries
  // real sampling noise. Judge correctness against the analytic figure.
  const drift = Math.abs(analytic - machine.rtp);
  const colour = drift < 0.002 ? '\x1b[32m' : drift < 0.01 ? '\x1b[33m' : '\x1b[31m';

  console.log(
    machine.id.padEnd(10) +
    fmtPct(machine.rtp).padStart(8) +
    (colour + fmtPct(analytic) + '\x1b[0m').padStart(20) +
    fmtPct(rtp).padStart(9) +
    fmtPct(hits / SPINS).padStart(9) +
    fmtPct(features / SPINS).padStart(8) +
    (fmtNum(Math.round(maxWin)) + 'x').padStart(10)
  );
}

// ── Band frequency detail ────────────────────────────────────────────────────
console.log(`\n\x1b[1mBand frequencies\x1b[0m (${MACHINES[0].id}, base spin only)`);
console.log('band'.padEnd(9) + 'range'.padEnd(18) + 'freq'.padStart(9) + 'odds'.padStart(14));
console.log('─'.repeat(50));
{
  const { counts, spins } = bandTotals[MACHINES[0].id];
  for (const b of BANDS) {
    const p = counts[b.id] / spins;
    const range = b.max === 0 ? '—' : `${b.min}x – ${b.max}x`;
    console.log(b.id.padEnd(9) + range.padEnd(18) + fmtPct(p).padStart(9) + oneIn(p).padStart(14));
  }
}

// ── Phase 2: grid integrity ──────────────────────────────────────────────────
console.log(`\n\x1b[1mPhase 2 — ${fmtNum(GRIDS)} full spins per machine (grid audit)\x1b[0m`);
console.log(
  'machine'.padEnd(10) + 'ghost wins'.padStart(12) + 'missing'.padStart(10) +
  'bad scatter'.padStart(13) + 'over cap'.padStart(10) + 'verdict'.padStart(10)
);
console.log('─'.repeat(65));

let anyFailure = false;

for (const machine of MACHINES) {
  const rng = mulberry32(0xBADA55 ^ machine.id.length * 104729);
  let ghostWins = 0;    // lost the spin but the reels show a winning line
  let missingWins = 0;  // paid out but the reels show nothing
  let badScatter = 0;   // scatters visible without a feature, or feature without scatters
  let overCap = 0;      // paid more than MAX_MULTIPLIER — must never happen

  for (let i = 0; i < GRIDS; i++) {
    const r = spin(machine, rng, 10);
    const visible = evaluateGrid(r.grid);
    const scat = countScatters(r.grid);

    if (r.baseMultiplier === 0 && visible.length > 0) ghostWins++;
    if (r.baseMultiplier > 0 && visible.length === 0) missingWins++;
    if (!r.feature && scat.count >= 3) badScatter++;
    if (r.feature && scat.count < 3) badScatter++;
    if (r.multiplier > MAX_MULTIPLIER) overCap++;
  }

  const ok = ghostWins === 0 && missingWins === 0 && badScatter === 0 && overCap === 0;
  if (!ok) anyFailure = true;

  console.log(
    machine.id.padEnd(10) +
    String(ghostWins).padStart(12) +
    String(missingWins).padStart(10) +
    String(badScatter).padStart(13) +
    String(overCap).padStart(10) +
    ((ok ? '\x1b[32mPASS' : '\x1b[31mFAIL') + '\x1b[0m').padStart(19)
  );
}

console.log(
  anyFailure
    ? '\n\x1b[31mGrid audit failed — reels are not telling the truth about results.\x1b[0m\n'
    : '\n\x1b[32mGrid audit passed — every rendered grid matches its payout.\x1b[0m\n'
);

process.exit(anyFailure ? 1 : 0);
