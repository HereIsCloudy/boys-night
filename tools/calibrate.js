/**
 * Feature calibration.
 *
 * machines.js budgets for the RTP that features hand out for free. Guessing
 * that budget from `featureSpins` is wrong for anything but plain free spins:
 * multiplier wilds multiply, cascade chains die early, hold-and-spin resets,
 * and every feature's first roll is drawn from the paying bands only.
 *
 * This measures each feature's true expected payout in units of the base band
 * table's RTP, so the budget can be exact. It calls the real runFeature() from
 * engine.js rather than a copy — a hand-mirrored version drifts the moment
 * anyone touches a feature, and then the advertised RTP quietly becomes a lie.
 *
 * Run it, paste the numbers into machines.js as `featureEV`, re-run sim.js.
 *
 *   node tools/calibrate.js
 */

import { MACHINES } from '../js/machines.js';
import { theoreticalRTP, BANDS } from '../js/bands.js';
import { runFeature } from '../js/engine.js';
import { mulberry32 } from '../js/rng.js';

const N = 3_000_000;

const baseRTP = theoreticalRTP(BANDS);
console.log(`\nbase band table RTP (mu) = ${(baseRTP * 100).toFixed(3)}%\n`);
console.log('machine'.padEnd(10) + 'feature'.padEnd(20) + 'E[payout]'.padStart(11) + 'featureEV'.padStart(12) + 'duds'.padStart(8));
console.log('─'.repeat(61));

const results = {};
for (const machine of MACHINES) {
  const rng = mulberry32(0x5EED ^ machine.id.length * 31337);
  let total = 0;
  let duds = 0;
  for (let i = 0; i < N; i++) {
    const f = runFeature(machine, rng, BANDS);
    total += f.multiplier;
    if (f.multiplier === 0) duds++;
  }
  const mean = total / N;
  const ev = mean / baseRTP;
  results[machine.id] = ev;
  console.log(
    machine.id.padEnd(10) + machine.feature.padEnd(20) +
    mean.toFixed(4).padStart(11) + ev.toFixed(3).padStart(12) +
    ((duds / N * 100).toFixed(2) + '%').padStart(8)
  );
}

console.log('\nPaste into machines.js:\n');
for (const m of MACHINES) {
  console.log(`  ${m.id.padEnd(8)} featureEV: ${results[m.id].toFixed(2)},`);
}
console.log('\nA nonzero dud rate means a feature can still trigger and pay nothing.\n');
