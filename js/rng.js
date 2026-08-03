/**
 * Seeded RNG — provably fair.
 *
 * Every spin draws from a stream derived from (serverSeed, clientSeed, nonce).
 * The player sees a hash of the server seed before spinning and the raw seed
 * after, so any spin can be replayed and verified after the fact.
 */

/** Mulberry32 — small, fast, good enough distribution for a slot machine. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — turns a seed string into the 32-bit int mulberry32 wants. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Public commitment for a server seed. Shown before the spin, verified after. */
export function commitHash(serverSeed) {
  return hashString('commit:' + serverSeed).toString(16).padStart(8, '0');
}

/** Deterministic stream for one specific spin. */
export function spinRng(serverSeed, clientSeed, nonce) {
  return mulberry32(hashString(`${serverSeed}|${clientSeed}|${nonce}`));
}

export function randomSeed() {
  let s = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint32Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < buf.length; i++) s += chars[buf[i] % chars.length] + chars[(buf[i] >>> 8) % chars.length];
  return s;
}

/** Weighted pick from `[{ weight }]`. */
export function weightedPick(rng, items, totalWeight) {
  const total = totalWeight ?? items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
