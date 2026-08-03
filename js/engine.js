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
         MAX_MULTIPLIER, BAND_BY_ID, BANDS, theoreticalRTP } from './bands.js';
import { weightedPick, randInt, pick, shuffle } from './rng.js';

/**
 * How often a multiplier symbol lands.
 *
 * Rare enough in the base game to be a surprise, common enough inside free
 * spins that a run compounds rather than merely accumulating.
 */
export const MULT_SYMBOL_RATE_BASE = 1 / 200;
export const MULT_SYMBOL_RATE_FEATURE = 1 / 2;

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
export function runFeature(machine, rng, bands, opts = {}) {
  switch (machine.feature) {
    case 'hold_and_spin':    return holdAndSpin(machine, rng, bands);
    case 'free_spins':       return freeSpins(machine, rng, bands, opts.scatterCount ?? 3);
    case 'cascades':         return cascades(machine, rng, bands);
    case 'multiplier_wilds': return multiplierDraws(machine, rng, bands);
    case 'jackpot_ladder':   return jackpotLadder(machine, rng, bands);
    default:                 return freeSpins(machine, rng, bands);
  }
}

/**
 * HOLD & SPIN — the coins ARE the feature, not a label describing one.
 *
 * Six coins land face down on the 5x3 grid, each hiding a multiplier. Three
 * respins; any new coin resets them to three. Fill all fifteen and the grand
 * replaces the sum outright.
 *
 * Every coin's value is drawn here and returned with its cell, so the UI can
 * lock real positions and flip them left to right. The previous version only
 * emitted "LOCK 7" strings with a payout corresponding to nothing on screen,
 * which is exactly why the reels looked like they were inventing numbers.
 */
function holdAndSpin(machine, rng, bands) {
  const CELLS = REELS * ROWS;
  const START_COINS = 6;
  const COIN_HIT_CHANCE = 0.25;
  const respinsAwarded = 3;

  // Coin values, weighted low. `scale` rides the machine's band table so the
  // feature keeps tracking RTP whenever the economy is retuned.
  const scale = theoreticalRTP(bands) / theoreticalRTP(BANDS);
  // The key MUST be `weight`: weightedPick() reads item.weight, and naming it
  // `w` made every lookup NaN, silently handing out the last row — 1000x — on
  // every single coin.
  const COIN_TABLE = [
    { v: 1,   weight: 3200 }, { v: 2,    weight: 2400 }, { v: 3,   weight: 1500 },
    { v: 5,   weight: 1400 }, { v: 10,   weight: 800 },  { v: 20,  weight: 380 },
    { v: 50,  weight: 180 },  { v: 100,  weight: 90 },   { v: 250, weight: 36 },
    { v: 500, weight: 12 },   { v: 1000, weight: 2 },
  ];
  const COIN_TOTAL = COIN_TABLE.reduce((t, c) => t + c.weight, 0);
  const drawCoin = () => Math.max(1, Math.round(weightedPick(rng, COIN_TABLE, COIN_TOTAL).v * scale));

  const free = shuffle(rng, Array.from({ length: CELLS }, (_, i) => i));
  const coins = [];
  const rounds = [];

  const land = n => {
    const added = [];
    for (let i = 0; i < n && free.length; i++) {
      const coin = { cell: free.pop(), value: drawCoin() };
      coins.push(coin);
      added.push(coin);
    }
    return added;
  };

  rounds.push({ kind: 'initial', added: land(START_COINS), respinsLeft: respinsAwarded });

  let respins = respinsAwarded;
  while (respins > 0 && coins.length < CELLS) {
    // Tuned by sweep: 3 respins at 25% fills the grid ~0.68% of features,
    // which with a 1-in-140 trigger makes a full screen roughly 1 in 20,000
    // spins. At the original 34% it filled 15% of the time — a 15,000x
    // jackpot landing one feature in seven, which is not a jackpot.
    if (rng() < COIN_HIT_CHANCE) {
      const added = land(1);
      respins = respinsAwarded;
      rounds.push({ kind: 'hit', added, respinsLeft: respins, coinCount: coins.length });
    } else {
      respins--;
      rounds.push({ kind: 'miss', added: [], respinsLeft: respins, coinCount: coins.length });
    }
  }

  const fullScreen = coins.length >= CELLS;
  const summed = coins.reduce((t, c) => t + c.value, 0);
  // Filling every cell pays the ceiling outright. That is the whole point of
  // chasing the last coin.
  const total = fullScreen ? MAX_MULTIPLIER : summed;

  // Reveal left to right by column, top to bottom inside it, so the flip reads
  // the way the reels do.
  const revealOrder = [...coins].sort((a, b) => {
    const ra = Math.floor(a.cell / ROWS), rb = Math.floor(b.cell / ROWS);
    return ra - rb || (a.cell % ROWS) - (b.cell % ROWS);
  });

  return {
    type: 'hold_and_spin',
    name: machine.featureName,
    coins, rounds, revealOrder, fullScreen,
    cells: CELLS,
    steps: revealOrder.map((c, i) => ({
      label: `COIN ${i + 1}`, multiplier: c.value, cell: c.cell,
    })),
    multiplier: Math.round(total * 100) / 100,
  };
}

/**
 * FREE SPINS — a real counter, with retriggers and collectable multipliers.
 *
 * 3 scatters award 10 spins; landing 3 more during the feature adds 3.
 * Multiplier symbols land roughly every other spin and MULTIPLY that spin's
 * win, so a good run compounds instead of merely accumulating.
 */
function freeSpins(machine, rng, bands, scatterCount = 3) {
  // More scatters, more spins: 3 -> 10, 4 -> 13, 5 -> 16.
  const AWARD = 10 + Math.max(0, Math.min(2, scatterCount - 3)) * 3;
  // A full retrigger (3 scatters again) is worth a whole new batch; a single
  // stray scatter during the feature is worth 3.
  const RETRIGGER_FULL = 10;
  const RETRIGGER_ONE = 3;
  const spins = [];

  let remaining = AWARD;
  let awarded = AWARD;
  let total = 0;
  let index = 0;

  while (remaining > 0 && index < 60) {   // ceiling guards a runaway retrigger
    remaining--;
    index++;

    const base = rollMultiplier(rng, rollPayingBand(rng, bands));
    const hasMult = rng() < MULT_SYMBOL_RATE_FEATURE;
    const symbolMult = hasMult ? randInt(rng, 2, 5) : 1;
    const won = base * symbolMult;
    total += won;

    // Retriggering is what makes a genuinely long run possible. Three
    // scatters lands the full batch; one stray scatter is a smaller top-up.
    // Every awarded spin can itself retrigger, so these rates compound. At
    // 3.5%/7.5% a 10-spin award averaged 22 spins and could reach 111 — the
    // feature stopped being a bonus and became the game. These land it near
    // 15 average with a long tail still possible.
    const roll = rng();
    const fullRetrigger = roll < 0.02;
    const singleScatter = !fullRetrigger && roll < 0.065;
    const bonusSpins = fullRetrigger ? RETRIGGER_FULL : singleScatter ? RETRIGGER_ONE : 0;
    if (bonusSpins) { remaining += bonusSpins; awarded += bonusSpins; }

    spins.push({
      label: `${index}/${awarded}`,
      multiplier: won,
      base, symbolMult, hasMult,
      retrigger: fullRetrigger, singleScatter, bonusSpins, remaining,
    });
  }

  return {
    type: 'free_spins',
    name: machine.featureName,
    spins, awarded, scatterCount,
    steps: spins,
    multiplier: Math.round(total * 100) / 100,
  };
}

/** CASCADES — each step clears and the chain multiplier climbs with it. */
function cascades(machine, rng, bands) {
  const length = Math.max(2, machine.featureSpins);
  const steps = [];
  let total = 0;

  for (let chain = 1; chain <= length; chain++) {
    const base = rollMultiplier(rng, rollPayingBand(rng, bands));
    const chainMult = Math.min(10, chain + 1);
    const won = base * chainMult;
    total += won;
    steps.push({ label: `CHAIN x${chainMult}`, multiplier: won, base, chainMult, chain });
  }

  return {
    type: 'cascades',
    name: machine.featureName,
    steps,
    multiplier: Math.round(total * 100) / 100,
  };
}

/** MULTIPLIER DRAWS — three draws, each multiplied by its own x2 to x10. */
function multiplierDraws(machine, rng, bands) {
  const steps = [];
  let total = 0;

  for (let i = 0; i < machine.featureSpins; i++) {
    const base = rollMultiplier(rng, rollPayingBand(rng, bands));
    const drawMult = randInt(rng, 2, 10);
    const won = base * drawMult;
    total += won;
    steps.push({ label: `DRAW x${drawMult}`, multiplier: won, base, drawMult });
  }

  return {
    type: 'multiplier_wilds',
    name: machine.featureName,
    steps,
    multiplier: Math.round(total * 100) / 100,
  };
}

/** JACKPOT LADDER — climb for more each rung; one bad step ends the run. */
function jackpotLadder(machine, rng, bands) {
  const steps = [];
  let total = 0;
  let rung = 0;

  while (rung < machine.featureSpins) {
    // The first rung is free: a feature that pays nothing after the scatters
    // land and the overlay opens reads as broken, not unlucky.
    const survives = rung === 0 || rng() < 0.72;
    if (!survives) {
      steps.push({ label: `RUNG ${rung + 1}`, multiplier: 0, fell: true });
      break;
    }
    rung++;
    const base = rollMultiplier(rng, rollPayingBand(rng, bands));
    const won = base * rung;
    total += won;
    steps.push({ label: `RUNG ${rung}`, multiplier: won, base, rung });
  }

  return {
    type: 'jackpot_ladder',
    name: machine.featureName,
    steps, rungs: rung,
    multiplier: Math.round(total * 100) / 100,
  };
}

export function gridForMultiplier(machine, rng, multiplier) {
  if (multiplier <= 0) return buildLosingGrid(machine, rng).grid;
  const band = bandForMultiplier(multiplier);
  const pres = BAND_PRESENTATION[band.id] ? band.id : 'small';
  return buildWinningGrid(machine, rng, pres, band.id === 'mega' || band.id === 'big').grid;
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
    // How many scatters actually landed decides the award, so it is rolled
    // once and both the reels and the feature read the same number.
    const roll = rng();
    const scatterCount = roll < 0.72 ? 3 : roll < 0.94 ? 4 : 5;
    stampScatters(machine, grid, rng, scatterCount, protectedCells);
    feature = runFeature(machine, rng, bands, { scatterCount });
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
