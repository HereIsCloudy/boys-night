/**
 * Session simulator — answers "what does a real play session actually feel
 * like", which is a very different question from "what is the RTP".
 *
 * RTP is a MEAN, and this game's mean is dominated by outcomes almost nobody
 * sees: Big and Mega together are ~40% of all returned value but fire once in
 * 5,800 and once in 94,000 spins. So the TYPICAL session returns far less than
 * the advertised RTP, and the median is the number a player actually
 * experiences.
 *
 *   node tools/session.js
 *   node tools/session.js --bet 5 --spins 100 --start 500 --runs 200000
 */

import { MACHINES, BAND_TABLES } from '../js/machines.js';
import { rollBand, rollMultiplier, MAX_MULTIPLIER } from '../js/bands.js';
import { runFeature } from '../js/engine.js';
import { mulberry32 } from '../js/rng.js';

const argv = process.argv.slice(2);
const arg = (flag, d) => { const i = argv.indexOf(flag); return i >= 0 ? Number(argv[i + 1]) : d; };

const BET = arg('--bet', 5);
const SPINS = arg('--spins', 100);
const START = arg('--start', 500);
const RUNS = arg('--runs', 200_000);
const LO = arg('--lo', 0);
const HI = arg('--hi', 120);

function playSession(machine, rng) {
  const bands = BAND_TABLES[machine.id];
  let balance = START;
  for (let i = 0; i < SPINS; i++) {
    if (balance < BET) break;
    balance -= BET;
    let mult = rollMultiplier(rng, rollBand(rng, bands));
    if (rng() < machine.featureRate) mult += runFeature(machine, rng, bands).multiplier;
    balance += Math.round(BET * Math.min(MAX_MULTIPLIER, mult));
  }
  return balance;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const fmt = n => Math.round(n).toLocaleString();

console.log(`\n\x1b[1mSession simulation\x1b[0m`);
console.log(`start $${START}, ${SPINS} spins at $${BET}, ${fmt(RUNS)} sessions per machine`);
console.log(`target window: end with $${LO}-$${HI}\n`);

console.log(
  'machine'.padEnd(9) + 'RTP'.padStart(6) + 'median'.padStart(9) + 'p25'.padStart(8) +
  'p75'.padStart(8) + 'p95'.padStart(9) + 'mean'.padStart(9) + 'in window'.padStart(11) + 'broke'.padStart(8)
);
console.log('─'.repeat(77));

for (const machine of MACHINES) {
  const rng = mulberry32(0x51E5D ^ machine.id.length * 2654435761);
  const finals = new Float64Array(RUNS);
  let inWindow = 0, broke = 0, sum = 0;

  for (let r = 0; r < RUNS; r++) {
    const end = playSession(machine, rng);
    finals[r] = end;
    sum += end;
    if (end >= LO && end <= HI) inWindow++;
    if (end < BET) broke++;
  }

  const sorted = Array.from(finals).sort((a, b) => a - b);
  console.log(
    machine.id.padEnd(9) +
    (machine.rtp * 100).toFixed(0).padStart(5) + '%' +
    ('$' + fmt(pct(sorted, 0.50))).padStart(9) +
    ('$' + fmt(pct(sorted, 0.25))).padStart(8) +
    ('$' + fmt(pct(sorted, 0.75))).padStart(8) +
    ('$' + fmt(pct(sorted, 0.95))).padStart(9) +
    ('$' + fmt(sum / RUNS)).padStart(9) +
    ((inWindow / RUNS * 100).toFixed(1) + '%').padStart(11) +
    ((broke / RUNS * 100).toFixed(1) + '%').padStart(8)
  );
}

console.log(`\n\x1b[2mmedian = what a typical session ends on. mean = pulled up by the rare tail.\x1b[0m\n`);
