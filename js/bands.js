/**
 * Win bands — the heart of the economy.
 *
 * A spin does not look up a fixed paytable. It rolls a BAND, then rolls a
 * random multiplier inside that band. Nobody ever wins the same amount twice.
 *
 * The roll inside a band is skewed hard toward the bottom (u^skew). That is
 * deliberate: with a flat roll every Mega would land near 10,000x and the
 * leaderboard would be a coin flip between people who all got the same thing.
 * Skewed, most Megas come in near 5,500x and a 14,000x is a genuine legend.
 *
 * Mean multiplier of a band = min + (max - min) / (skew + 1)
 */

export const BANDS = [
  { id: 'none',   name: 'No Win',  min: 0,    max: 0,     skew: 1, weight: 8276000 },
  { id: 'dust',   name: 'Dust',    min: 0.2,  max: 1.5,   skew: 3, weight: 1350000 },
  { id: 'small',  name: 'Small',   min: 2,    max: 10,    skew: 3, weight:  330000 },
  { id: 'medium', name: 'Medium',  min: 20,   max: 100,   skew: 3, weight:   42000 },
  { id: 'big',    name: 'Big',     min: 500,  max: 2000,  skew: 3, weight:    1900 },
  { id: 'mega',   name: 'Mega',    min: 5000, max: 15000, skew: 3, weight:     100 },
];

export const BAND_BY_ID = Object.fromEntries(BANDS.map(b => [b.id, b]));
export const PAYING_BANDS = BANDS.filter(b => b.id !== 'none');
export const TOTAL_BAND_WEIGHT = BANDS.reduce((s, b) => s + b.weight, 0);

/** Tier at which autospin halts and the screen goes loud. */
export const AUTOSPIN_STOP_MULTIPLIER = 10;

/**
 * Hard ceiling on what a single spin can pay, in multiples of the bet.
 *
 * The Mega band tops out at 15,000x on its own, but features stack on top:
 * Jaxon's multiplier wilds can take a 15,000x roll and multiply it by 10, and
 * Mint's cascades sum several boosted steps. Left unclamped the simulator saw
 * Jaxon reach 56,500x.
 *
 * This also keeps the game inside what firestore.rules will accept — the
 * biggestMultiplier bound there is 15,000, so an unclamped win would have its
 * leaderboard write rejected and the record would vanish silently.
 */
export const MAX_MULTIPLIER = 15000;

/** Analytical mean payout of a band, used by the RTP planner. */
export function bandMean(band) {
  if (band.max === 0) return 0;
  return band.min + (band.max - band.min) / (band.skew + 1);
}

/** Theoretical RTP of a weight table, without simulating anything. */
export function theoreticalRTP(bands = BANDS) {
  const total = bands.reduce((s, b) => s + b.weight, 0);
  return bands.reduce((s, b) => s + (b.weight / total) * bandMean(b), 0);
}

export function theoreticalHitRate(bands = BANDS) {
  const total = bands.reduce((s, b) => s + b.weight, 0);
  return bands.filter(b => b.id !== 'none').reduce((s, b) => s + b.weight / total, 0);
}

/**
 * Scale the paying bands so a machine lands on its own RTP target while
 * keeping the shape of the distribution identical. This is what lets all five
 * machines feel the same but pay 58-62%.
 */
export function scaleBands(targetRTP) {
  const base = theoreticalRTP(BANDS);
  const factor = targetRTP / base;
  const scaled = BANDS.map(b =>
    b.id === 'none' ? { ...b } : { ...b, weight: b.weight * factor }
  );
  // 'none' absorbs the difference so the weights still sum to the same total.
  const payingWeight = scaled.filter(b => b.id !== 'none').reduce((s, b) => s + b.weight, 0);
  scaled.find(b => b.id === 'none').weight = TOTAL_BAND_WEIGHT - payingWeight;
  return scaled;
}

/** Roll a band, then roll a multiplier inside it. */
/** Roll a band, then roll a multiplier inside it. */
export function rollBand(rng, bands = BANDS) {
  const total = bands.reduce((s, b) => s + b.weight, 0);
  let r = rng() * total;
  for (const b of bands) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return bands[0];
}

/**
 * Roll a band that is guaranteed to pay, keeping the relative weights of the
 * paying bands intact.
 *
 * Features use this for their first roll. Without it, a feature draws from the
 * full table where ~83% of the weight sits on "no win", so landing three
 * scatters would pay nothing four times out of five — the reels do the whole
 * anticipation build-up and then hand back zero, which reads as a broken game
 * rather than an unlucky one.
 */
export function rollPayingBand(rng, bands = BANDS) {
  const paying = bands.filter(b => b.id !== 'none');
  const total = paying.reduce((s, b) => s + b.weight, 0);
  let r = rng() * total;
  for (const b of paying) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return paying[0];
}

export function rollMultiplier(rng, band) {
  if (band.max === 0) return 0;
  const u = Math.pow(rng(), band.skew);
  const raw = band.min + u * (band.max - band.min);
  // Dust keeps two decimals so sub-1x wins read honestly; everything else is whole.
  return band.max <= 2 ? Math.round(raw * 100) / 100 : Math.round(raw);
}

/**
 * Which band does an already-known multiplier belong to? Used by stats,
 * leaderboards and the celebration tier.
 *
 * The bands leave deliberate gaps (1.5-2, 10-20, 100-500, 2000-5000) so the
 * tiers feel distinct, but a total can easily land inside one: feature payouts
 * sum several rolls, so 12x or 300x are ordinary results. A gap value is
 * classified as the highest band it has cleared — 12x is a Small, 300x is a
 * Medium. Falling through to Mega instead would hand out 1-in-100,000
 * celebrations, achievements and leaderboard entries for routine wins.
 */
export function bandForMultiplier(mult) {
  if (mult <= 0) return BAND_BY_ID.none;
  let band = BAND_BY_ID.dust;
  for (const b of PAYING_BANDS) {
    if (mult >= b.min) band = b;
  }
  return band;
}
