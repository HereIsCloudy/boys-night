/**
 * The spin engine. Pure: no DOM, no state, no globals. Give it a machine, an
 * RNG and a bet, and it hands back everything needed to render and to record.
 *
 * It works outcome-first. The band is rolled, the multiplier is rolled inside
 * it, and only then is a grid constructed that justifies the result. That is
 * what makes RTP exact and tunable instead of an emergent property of symbol
 * weights that we would have to chase with a simulator forever.
 *
 * The grid is still checked for consistency: a losing spin never renders a
 * visible winning line, and a winning spin always shows the line it paid for.
 */

import { REELS, ROWS, PAYLINES, BAND_TABLES } from './machines.js';
import { rollBand, rollPayingBand, rollMultiplier, bandForMultiplier,
         MAX_MULTIPLIER, BAND_BY_ID } from './bands.js';
import { weightedPick, randInt, pick } from './rng.js';

/** Which symbol tier and match count sells a given band as a real win. */
const BAND_PRESENTATION = {
  dust:   { tiers: ['low'],  counts: [3] },
  small:  { tiers: ['mid'],  counts: [3, 4] },
  medium: { tiers: ['high'], counts: [4] },
  big:    { tiers: ['high'], counts: [5] },
  mega:   { tiers: ['high'], counts: [5], topOnly: true, wilds: true },
};

function symbolsOfTier(machine, tier) {
  return machine.symbols.filter(s => s.tier === tier);
}

function fillerSymbols(machine) {
  return machine.symbols.filter(s => s.tier !== 'wild' && s.tier !== 'scat');
}

function wildSymbol(machine) {
  return machine.symbols.find(s => s.tier === 'wild');
}

function scatterSymbol(machine) {
  return machine.symbols.find(s => s.tier === 'scat');
}

/**
 * Length of the leading run on a payline, treating wilds as substitutes.
 * Returns null when the line has no run of 3 or more.
 */
export function lineRun(grid, line) {
  const cells = line.map((row, reel) => grid[reel][row]);
  const base = cells.find(c => c.tier !== 'wild' && c.tier !== 'scat');
  if (!base) return null;

  let count = 0;
  for (let i = 0; i < REELS; i++) {
    const c = cells[i];
    if (c.key === base.key || c.tier === 'wild') count++;
    else break;
  }
  return count >= 3 ? { symbol: base, count } : null;
}

/** Every winning line currently visible on a grid. Drives the highlighting. */
export function evaluateGrid(grid) {
  const wins = [];
  PAYLINES.forEach((line, index) => {
    const run = lineRun(grid, line);
    if (!run) return;
    wins.push({
      lineIndex: index,
      symbol: run.symbol,
      count: run.count,
      positions: line.slice(0, run.count).map((row, reel) => ({ reel, row })),
    });
  });
  return wins;
}

export function countScatters(grid) {
  let n = 0;
  const positions = [];
  for (let r = 0; r < REELS; r++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[r][row].tier === 'scat') { n++; positions.push({ reel: r, row }); }
    }
  }
  return { count: n, positions };
}

function randomGrid(machine, rng, allowScatter = false) {
  const pool = allowScatter
    ? machine.symbols.filter(s => s.tier !== 'wild')
    : fillerSymbols(machine);
  const total = pool.reduce((s, x) => s + x.weight, 0);
  return Array.from({ length: REELS }, () =>
    Array.from({ length: ROWS }, () => weightedPick(rng, pool, total))
  );
}

/**
 * Scrub any winning line that we did not deliberately place, plus any
 * accidental scatter trigger. Without this a "no win" spin could render three
 * cherries in a row and look broken.
 */
function scrubAccidentalWins(machine, grid, rng, protectedLine = -1, maxScatters = 2) {
  const filler = fillerSymbols(machine);
  const total = filler.reduce((s, x) => s + x.weight, 0);

  for (let pass = 0; pass < 40; pass++) {
    let dirty = false;

    PAYLINES.forEach((line, index) => {
      if (index === protectedLine) return;
      const run = lineRun(grid, line);
      if (!run) return;
      // Break the run at its last cell, avoiding the protected line's cells.
      const breakAt = run.count - 1;
      const row = line[breakAt];
      const current = grid[breakAt][row];
      let replacement = current;
      for (let tries = 0; tries < 20 && replacement.key === current.key; tries++) {
        replacement = weightedPick(rng, filler, total);
      }
      grid[breakAt][row] = replacement;
      dirty = true;
    });

    const { count, positions } = countScatters(grid);
    if (count > maxScatters) {
      for (const p of positions.slice(maxScatters)) {
        grid[p.reel][p.row] = weightedPick(rng, filler, total);
      }
      dirty = true;
    }

    if (!dirty) break;
  }
  return grid;
}

/** Place `count` matching symbols along a payline, then fill and scrub. */
function buildWinningGrid(machine, rng, bandId, useWilds) {
  const pres = BAND_PRESENTATION[bandId];
  const tier = pick(rng, pres.tiers);
  const candidates = symbolsOfTier(machine, tier);
  const symbol = pres.topOnly
    ? candidates[candidates.length - 1]
    : pick(rng, candidates);
  const count = pick(rng, pres.counts);
  const lineIndex = randInt(rng, 0, PAYLINES.length - 1);
  const line = PAYLINES[lineIndex];

  const grid = randomGrid(machine, rng, false);
  const wild = wildSymbol(machine);

  for (let reel = 0; reel < count; reel++) {
    // A wild or two inside a big line makes it read as spectacular.
    const asWild = useWilds && reel > 0 && reel < count - 1 && rng() < 0.45;
    grid[reel][line[reel]] = asWild ? wild : symbol;
  }

  // Guarantee the run actually stops where we intended.
  if (count < REELS) {
    const row = line[count];
    const others = fillerSymbols(machine).filter(s => s.key !== symbol.key);
    grid[count][row] = pick(rng, others);
  }

  scrubAccidentalWins(machine, grid, rng, lineIndex);

  // Re-assert the intended line in case scrubbing clipped it.
  for (let reel = 0; reel < count; reel++) {
    if (grid[reel][line[reel]].key !== symbol.key && grid[reel][line[reel]].tier !== 'wild') {
      grid[reel][line[reel]] = symbol;
    }
  }

  // Cells the scatter stamp must not touch, or the win becomes invisible.
  const protectedCells = line.slice(0, count).map((row, reel) => ({ reel, row }));
  return { grid, protectedCells };
}

function buildLosingGrid(machine, rng) {
  const grid = randomGrid(machine, rng, false);
  scrubAccidentalWins(machine, grid, rng, -1);
  return { grid, protectedCells: [] };
}

/**
 * Force a visible scatter trigger for feature spins, without landing on any
 * cell that a winning line depends on. Each reel keeps at most one scatter so
 * the trigger reads cleanly left to right.
 */
function stampScatters(machine, grid, rng, howMany, protectedCells = []) {
  const scatter = scatterSymbol(machine);
  const blocked = new Set(protectedCells.map(c => `${c.reel}:${c.row}`));

  const reels = [];
  while (reels.length < howMany && reels.length < REELS) {
    const r = randInt(rng, 0, REELS - 1);
    if (!reels.includes(r)) reels.push(r);
  }

  for (const reel of reels) {
    const free = [];
    for (let row = 0; row < ROWS; row++) {
      if (!blocked.has(`${reel}:${row}`)) free.push(row);
    }
    if (free.length === 0) continue;  // fully protected reel, skip it
    grid[reel][pick(rng, free)] = scatter;
  }
  return grid;
}

/**
 * Features are extra band rolls wrapped in presentation. Modelling them this
 * way means a feature never distorts RTP — machines.js budgets for the free
 * rolls when it scales the band table.
 *
 * The first roll of every feature is drawn from the paying bands only. A
 * feature that triggers and pays nothing is the worst thing this game can do:
 * the scatters land, the reels crawl, the overlay opens, and the player gets
 * zero. Guaranteeing the first roll costs a little RTP (which the band table
 * then absorbs) and removes the dud entirely.
 *
 * Exported so tools/sim.js and tools/calibrate.js measure the real thing
 * instead of a hand-copied approximation that can silently drift out of sync.
 */
export function runFeature(machine, rng, bands) {
  const steps = [];
  let total = 0;

  switch (machine.feature) {
    case 'multiplier_wilds': {
      // Three wild-boosted draws instead of one, so the flagship feature is
      // worth the 1-in-N wait.
      let running = 1;
      for (let i = 0; i < machine.featureSpins; i++) {
        const wildMult = randInt(rng, 2, 10);
        const m = rollMultiplier(rng, rollPayingBand(rng, bands)) * wildMult;
        total += m;
        running = wildMult;
        steps.push({ label: `WILD x${wildMult}`, multiplier: m, wildMult });
      }
      break;
    }
    case 'cascades': {
      let chain = 0;
      let chainMult = 1;
      // Every step of the chain pays; `featureSpins` sets how long the chain
      // runs, and the multiplier climbs the whole way. Ending the chain on a
      // losing roll made this the weakest feature in the game by a wide
      // margin — it carried 19% of returns where the others carried 40-54%.
      const length = Math.max(2, machine.featureSpins);
      while (chain < length) {
        const m = rollMultiplier(rng, rollPayingBand(rng, bands));
        chain++;
        chainMult = Math.min(10, chain + 1);
        const stepValue = m * chainMult;
        total += stepValue;
        steps.push({ label: `CHAIN x${chainMult}`, multiplier: stepValue, chain });
      }
      break;
    }
    case 'hold_and_spin': {
      let respins = machine.featureSpins;
      let coins = 6;
      let first = true;
      while (respins > 0) {
        // Every locked coin pays; the respins decide how many you get.
        const band = rollPayingBand(rng, bands);
        first = false;
        const m = rollMultiplier(rng, band);
        if (m > 0) { coins++; respins = machine.featureSpins; total += m; }
        else respins--;
        steps.push({ label: `LOCK ${coins}`, multiplier: m, coins });
        if (coins >= REELS * ROWS) break;
      }
      break;
    }
    case 'free_spins':
    case 'expanding_wilds':
    default: {
      // One spin in the batch is guaranteed; which one is chosen at random so
      // it doesn't always land first and become predictable.
      // Every free spin pays something. The variance lives in HOW much.
      for (let i = 0; i < machine.featureSpins; i++) {
        const m = rollMultiplier(rng, rollPayingBand(rng, bands));
        total += m;
        steps.push({ label: `${i + 1}/${machine.featureSpins}`, multiplier: m });
      }
      break;
    }
  }

  return {
    type: machine.feature,
    name: machine.featureName,
    steps,
    multiplier: Math.round(total * 100) / 100,
  };
}

/**
 * One spin.
 * @returns {{grid, lines, multiplier, payout, band, feature, scatters}}
 */
export function spin(machine, rng, bet) {
  const bands = BAND_TABLES[machine.id];
  const featureTriggered = rng() < machine.featureRate;

  const baseBand = rollBand(rng, bands);
  const baseMultiplier = rollMultiplier(rng, baseBand);

  const { grid, protectedCells } = baseMultiplier > 0
    ? buildWinningGrid(machine, rng, baseBand.id, baseBand.id === 'mega' || baseBand.id === 'big')
    : buildLosingGrid(machine, rng);

  let feature = null;
  if (featureTriggered) {
    stampScatters(machine, grid, rng, randInt(rng, 3, 4), protectedCells);
    feature = runFeature(machine, rng, bands);
  }

  const rawMultiplier = baseMultiplier + (feature?.multiplier ?? 0);
  const totalMultiplier = Math.round(Math.min(MAX_MULTIPLIER, rawMultiplier) * 100) / 100;
  const payout = Math.round(bet * totalMultiplier);

  return {
    machineId: machine.id,
    bet,
    grid,
    lines: evaluateGrid(grid),
    scatters: countScatters(grid),
    baseBand: baseBand.id,
    baseMultiplier,
    feature,
    multiplier: totalMultiplier,
    /** True when the ceiling actually bit — worth shouting about. */
    capped: rawMultiplier > MAX_MULTIPLIER,
    band: bandForMultiplier(totalMultiplier).id,
    payout,
    net: payout - bet,
    isWin: totalMultiplier > 0,
    /** True when the win exceeds what the player staked, not merely > 0. */
    isRealWin: totalMultiplier > 1,
  };
}

export { BAND_BY_ID };
