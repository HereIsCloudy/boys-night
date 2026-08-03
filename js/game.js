/**
 * The play view: reels, spin animation, autospin, and the celebration layer.
 *
 * Celebration scales with the win tier. Dust barely twitches; Mega takes the
 * whole screen. That proportionality is the entire point — if every win got
 * the full treatment, none of them would land.
 */

import { MACHINE_BY_ID, REELS, ROWS, BET_STEPS, TURBO_PRICE, AUTOSPIN_PRICE } from './machines.js';
import { AUTOSPIN_STOP_MULTIPLIER } from './bands.js';
import { spin as engineSpin } from './engine.js';
import { spinRng } from './rng.js';
import {
  getState, addBalance, setBet, recordSpin, hasTurbo, hasAutospin,
  buyTurbo, buyAutospin, checkBrokeRelief, save,
} from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { fmt, fmtFull, fmtMult, countUp, toast, escapeHtml } from './ui.js';
import { checkAchievements } from './achievements.js';
import { queueSync } from './sync.js';
import { Events } from './events.js';

const AUTOSPIN_COUNTS = [10, 25, 50, 100, Infinity];

let machine = null;
let spinning = false;
let autoRemaining = 0;
let turboOn = false;
let cleanupFns = [];
let history = [];

const SYM_H = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sym-h')) || 78;

function reduceMotion() {
  return getState().settings.reduceMotion;
}

// ── Rendering ────────────────────────────────────────────────────────────────

export function renderGame(root, machineId) {
  machine = MACHINE_BY_ID[machineId];
  if (!machine) return;

  spinning = false;
  autoRemaining = 0;
  history = [];
  turboOn = hasTurbo(machine.id) && getState().settings.turboDefault;

  const s = getState();
  root.style.setProperty('--m-accent', machine.accent);
  root.innerHTML = `
    <div class="game">
      <div class="game-head">
        <h2>${escapeHtml(machine.name)}</h2>
        <span class="feat">${escapeHtml(machine.featureName)}</span>
        <span style="margin-left:auto;color:var(--muted);font-size:.78rem">
          RTP ${(machine.rtp * 100).toFixed(0)}% &middot; ${escapeHtml(machine.tagline)}
        </span>
      </div>

      <div class="cabinet" id="cabinet">
        <div class="reels" id="reels"></div>
        <div class="win-banner hidden" id="banner"></div>
      </div>

      <div class="controls">
        <div class="bet-group">
          <span class="bet-label">Bet</span>
          <button class="bet-step" id="bet-down">&minus;</button>
          <span class="bet-value num" id="bet-value">${s.bet}</span>
          <button class="bet-step" id="bet-up">+</button>
        </div>
        <button class="spin-btn" id="spin">Spin</button>
        <button class="toggle-btn" id="turbo"></button>
        <button class="toggle-btn" id="auto"></button>
      </div>

      <div>
        <div class="section-title">Recent spins</div>
        <div class="history" id="history">
          <div class="empty" style="padding:20px">No spins yet.</div>
        </div>
      </div>
    </div>`;

  buildReels();
  wireControls();
  refreshControls();
}

function buildReels() {
  const reels = document.getElementById('reels');
  reels.innerHTML = '';
  for (let r = 0; r < REELS; r++) {
    const reel = document.createElement('div');
    reel.className = 'reel';
    const track = document.createElement('div');
    track.className = 'reel-track';
    track.id = `track-${r}`;
    reel.appendChild(track);
    reels.appendChild(reel);
  }
  // Idle grid so the machine isn't blank before the first spin.
  const filler = machine.symbols.filter(s => s.tier !== 'scat');
  for (let r = 0; r < REELS; r++) {
    const track = document.getElementById(`track-${r}`);
    for (let row = 0; row < ROWS; row++) {
      track.appendChild(symbolEl(filler[(r * 3 + row) % filler.length]));
    }
  }
}

function symbolEl(sym) {
  const d = document.createElement('div');
  d.className = 'symbol';
  d.textContent = sym.glyph;
  d.dataset.key = sym.key;
  return d;
}

function wireControls() {
  const s = getState();

  document.getElementById('bet-down').onclick = () => stepBet(-1);
  document.getElementById('bet-up').onclick = () => stepBet(1);
  document.getElementById('spin').onclick = onSpinClick;
  document.getElementById('turbo').onclick = onTurboClick;
  document.getElementById('auto').onclick = onAutoClick;

  const onKey = e => {
    if (e.code === 'Space' && !e.repeat && !e.target.matches('input,textarea')) {
      e.preventDefault();
      onSpinClick();
    }
  };
  document.addEventListener('keydown', onKey);
  cleanupFns.push(() => document.removeEventListener('keydown', onKey));
}

function stepBet(dir) {
  const s = getState();
  const i = BET_STEPS.indexOf(s.bet);
  const next = BET_STEPS[Math.min(BET_STEPS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))];
  setBet(next);
  document.getElementById('bet-value').textContent = next;
  Audio.click();
}

function refreshControls() {
  const owned = hasTurbo(machine.id);
  const turbo = document.getElementById('turbo');
  const auto = document.getElementById('auto');
  if (!turbo || !auto) return;

  turbo.className = `toggle-btn ${owned ? (turboOn ? 'on' : '') : 'locked'}`;
  turbo.innerHTML = owned
    ? `2&times; Speed`
    : `2&times; Speed<span class="price">${fmtFull(TURBO_PRICE)}</span>`;

  const autoOwned = hasAutospin();
  auto.className = `toggle-btn ${autoOwned ? (autoRemaining > 0 ? 'on' : '') : 'locked'}`;
  auto.innerHTML = autoOwned
    ? (autoRemaining > 0
        ? `Auto ${autoRemaining === Infinity ? '∞' : autoRemaining}`
        : `Autospin`)
    : `Autospin<span class="price">${fmtFull(AUTOSPIN_PRICE)}</span>`;

  const spinBtn = document.getElementById('spin');
  if (spinBtn) {
    spinBtn.textContent = autoRemaining > 0 ? 'Stop' : 'Spin';
    spinBtn.classList.toggle('stop', autoRemaining > 0);
  }
}

// ── Purchases ────────────────────────────────────────────────────────────────

function onTurboClick() {
  if (hasTurbo(machine.id)) {
    turboOn = !turboOn;
    Audio.click();
    refreshControls();
    return;
  }
  const s = getState();
  if (s.balance < TURBO_PRICE) {
    Audio.error();
    toast(`Need ${fmtFull(TURBO_PRICE)} for 2× speed`, 'lose');
    return;
  }
  if (buyTurbo(machine.id, TURBO_PRICE)) {
    Audio.buy();
    turboOn = true;
    toast(`2× speed unlocked on ${machine.owner}`, 'win');
    refreshControls();
    checkAchievements();
    queueSync();
  }
}

function onAutoClick() {
  if (!hasAutospin()) {
    const s = getState();
    if (s.balance < AUTOSPIN_PRICE) {
      Audio.error();
      toast(`Need ${fmtFull(AUTOSPIN_PRICE)} for autospin`, 'lose');
      return;
    }
    if (buyAutospin(AUTOSPIN_PRICE)) {
      Audio.buy();
      toast('Autospin unlocked — every machine', 'win');
      refreshControls();
      checkAchievements();
      queueSync();
    }
    return;
  }

  if (autoRemaining > 0) { autoRemaining = 0; refreshControls(); return; }

  // Cycle through the counts on repeat taps.
  const idx = AUTOSPIN_COUNTS.indexOf(autoRemaining);
  autoRemaining = AUTOSPIN_COUNTS[0];
  Audio.click();
  refreshControls();
  if (!spinning) doSpin();
}

// ── Spin ─────────────────────────────────────────────────────────────────────

function onSpinClick() {
  if (autoRemaining > 0) { autoRemaining = 0; refreshControls(); return; }
  if (spinning) return;
  doSpin();
}

async function doSpin() {
  if (spinning) return;
  const s = getState();
  const bet = s.bet;

  if (s.balance < bet) {
    autoRemaining = 0;
    refreshControls();
    Audio.error();
    toast('Not enough coins — collect the pool', 'lose');
    checkBrokeRelief();
    return;
  }

  spinning = true;
  Audio.unlock();
  Audio.spinStart();

  addBalance(-bet, 'spin');
  hideBanner();

  // Provably fair: same seed + nonce always reproduces this exact spin.
  s.nonce++;
  const rng = spinRng(s.serverSeed, s.clientSeed, s.nonce);
  const result = engineSpin(machine, rng, bet);

  await animateReels(result);

  recordSpin(result, machine);
  if (result.payout > 0) addBalance(result.payout, 'win');

  presentResult(result);
  addHistory(result);
  checkAchievements();
  queueSync();

  spinning = false;

  // Autospin stop conditions: a feature trigger or a genuinely big win halts
  // the run. Ordinary dust and small wins tick past without interrupting.
  let stopped = false;
  if (autoRemaining > 0) {
    if (result.feature) {
      autoRemaining = 0;
      stopped = true;
      toast(`${machine.featureName} — autospin stopped`, 'win');
    } else if (result.multiplier >= AUTOSPIN_STOP_MULTIPLIER) {
      autoRemaining = 0;
      stopped = true;
      toast(`${fmtMult(result.multiplier)} win — autospin stopped`, 'win');
    } else if (getState().balance < bet) {
      autoRemaining = 0;
      stopped = true;
    } else if (autoRemaining !== Infinity) {
      autoRemaining--;
    }
  }

  refreshControls();
  if (getState().balance < bet) checkBrokeRelief();

  if (autoRemaining > 0 && !stopped) {
    const gap = result.multiplier > 0 ? (turboOn ? 320 : 700) : (turboOn ? 90 : 220);
    setTimeout(() => { if (autoRemaining > 0) doSpin(); }, gap);
  }
}

function animateReels(result) {
  const speed = turboOn ? 0.5 : 1;
  const h = SYM_H();

  if (reduceMotion()) {
    for (let r = 0; r < REELS; r++) paintFinal(r, result.grid[r]);
    return Promise.resolve();
  }

  const promises = [];
  for (let r = 0; r < REELS; r++) {
    const track = document.getElementById(`track-${r}`);
    const reel = track.parentElement;

    // A tall strip of decoy symbols with the real result at the bottom.
    const strip = [];
    const pool = machine.symbols;
    for (let i = 0; i < 18; i++) strip.push(pool[(Math.random() * pool.length) | 0]);
    strip.push(...result.grid[r]);

    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    track.innerHTML = '';
    strip.forEach(sym => track.appendChild(symbolEl(sym)));

    const distance = (strip.length - ROWS) * h;
    const delay = r * 130 * speed;
    const dur = (620 + r * 190) * speed;

    promises.push(new Promise(resolve => {
      setTimeout(() => {
        track.style.transition = `transform ${dur}ms cubic-bezier(.16,.7,.3,1.02)`;
        track.style.transform = `translateY(${-distance}px)`;

        setTimeout(() => {
          Audio.reelStop(r);
          paintFinal(r, result.grid[r]);
          reel.classList.remove('anticipate');
          resolve();
        }, dur + 20);
      }, delay);
    }));

    // Anticipation: if a feature is coming, the last reels crawl.
    if (result.feature && r >= 2) {
      setTimeout(() => reel.classList.add('anticipate'), delay);
    }
  }
  return Promise.all(promises);
}

function paintFinal(reelIndex, symbols) {
  const track = document.getElementById(`track-${reelIndex}`);
  if (!track) return;
  track.style.transition = 'none';
  track.style.transform = 'translateY(0)';
  track.innerHTML = '';
  symbols.forEach(sym => track.appendChild(symbolEl(sym)));
}

// ── Presentation ─────────────────────────────────────────────────────────────

function presentResult(result) {
  highlightWins(result);
  updateTension(result);

  if (!result.isWin) { showNearMiss(result); return; }

  const tier = result.band;
  const cabinet = document.getElementById('cabinet');

  // Sound and particles, scaled.
  ({ dust: Audio.dust, small: Audio.small, medium: Audio.medium, big: Audio.big, mega: Audio.mega }[tier] ?? Audio.dust)();
  Particles.burst(tier, cabinet);
  flyCoins(tier);

  if (!reduceMotion()) {
    const shake = { medium: 'shake-medium', big: 'shake-big', mega: 'shake-mega' }[tier];
    if (shake) {
      cabinet.classList.add(shake);
      setTimeout(() => cabinet.classList.remove(shake), 900);
    }
    if (tier === 'mega') {
      const flash = document.createElement('div');
      flash.className = 'mega-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 1200);
    }
  }

  showBanner(result);
  if (result.feature) showFeature(result);
}

/**
 * The cabinet reflects how the run is going: it warms up on a win streak and
 * drains of colour during a drought. Purely cosmetic — it reads the same stats
 * the player can see on the stats page and changes nothing about the odds.
 */
function updateTension(result) {
  const cabinet = document.getElementById('cabinet');
  if (!cabinet) return;
  const ms = getState().perMachine[machine.id];

  const streak = ms.currentWinStreak;
  cabinet.dataset.heat = streak >= 4 ? '3' : streak >= 3 ? '2' : streak >= 2 ? '1' : '0';

  const dry = ms.currentDrySpell;
  cabinet.dataset.dry = dry >= 40 ? '3' : dry >= 25 ? '2' : dry >= 12 ? '1' : '0';
}

/** Two scatters and no third — flag the tease that never paid. */
function showNearMiss(result) {
  if (result.feature || result.scatters.count !== 2 || reduceMotion()) return;
  const reels = document.getElementById('reels');
  if (!reels) return;
  for (const pos of result.scatters.positions) {
    const reel = reels.children[pos.reel];
    if (!reel) continue;
    reel.classList.remove('near-miss');
    void reel.offsetWidth;
    reel.classList.add('near-miss');
    setTimeout(() => reel.classList.remove('near-miss'), 800);
  }
  Audio.reelStop(1);
}

/** Coins arcing from the reels into the balance counter. */
function flyCoins(tier) {
  if (reduceMotion()) return;
  const count = { dust: 0, small: 3, medium: 6, big: 12, mega: 20 }[tier] ?? 0;
  if (!count) return;

  const cabinet = document.getElementById('cabinet');
  const target = document.getElementById('balance-value');
  if (!cabinet || !target) return;

  const from = cabinet.getBoundingClientRect();
  const to = target.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    const coin = document.createElement('div');
    coin.className = 'coin-fly';
    coin.textContent = '🪙';
    const startX = from.left + Math.random() * from.width;
    const startY = from.top + from.height * (0.3 + Math.random() * 0.4);
    coin.style.left = `${startX}px`;
    coin.style.top = `${startY}px`;
    coin.style.setProperty('--dx', `${to.left + to.width / 2 - startX}px`);
    coin.style.setProperty('--dy', `${to.top + to.height / 2 - startY}px`);
    coin.style.setProperty('--fly-dur', `${0.55 + Math.random() * 0.35}s`);
    coin.style.animationDelay = `${i * 45}ms`;
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 1400 + i * 45);
  }
}

function highlightWins(result) {
  const reels = document.getElementById('reels');
  if (!reels) return;
  for (const line of result.lines) {
    for (const pos of line.positions) {
      const cell = reels.children[pos.reel]?.firstElementChild?.children[pos.row];
      cell?.classList.add('win');
    }
  }
  if (result.feature) {
    for (const pos of result.scatters.positions) {
      const cell = reels.children[pos.reel]?.firstElementChild?.children[pos.row];
      cell?.classList.add('scatter-hit');
    }
  }
}

const TIER_LABEL = { dust: 'Dust', small: 'Win', medium: 'Big Win', big: 'Huge Win', mega: 'MEGA WIN' };

function showBanner(result) {
  const banner = document.getElementById('banner');
  if (!banner) return;

  const tier = result.band;
  const durations = { dust: 500, small: 900, medium: 1500, big: 3200, mega: 5000 };
  const countMs = { dust: 250, small: 600, medium: 1100, big: 2600, mega: 4000 }[tier] ?? 500;

  banner.className = `win-banner tier-${tier}`;
  banner.innerHTML = `
    <div style="text-align:center">
      ${tier === 'mega' || tier === 'big' ? `<div class="tier">${TIER_LABEL[tier]}</div>` : ''}
      <div class="amount num" id="banner-amount">0</div>
      <div class="mult">${fmtMult(result.multiplier)}</div>
    </div>`;

  countUp(document.getElementById('banner-amount'), 0, result.payout, countMs, fmt);
  setTimeout(hideBanner, durations[tier] ?? 800);
}

function hideBanner() {
  const banner = document.getElementById('banner');
  if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
  document.querySelectorAll('.symbol.win, .symbol.scatter-hit')
    .forEach(e => e.classList.remove('win', 'scatter-hit'));
}

function showFeature(result) {
  const cabinet = document.getElementById('cabinet');
  if (!cabinet || !result.feature) return;

  Audio.feature();
  const overlay = document.createElement('div');
  overlay.className = 'feature-overlay';
  overlay.innerHTML = `
    <div class="feature-card">
      <div class="title">${escapeHtml(result.feature.name)}</div>
      <div class="feature-steps">
        ${result.feature.steps.map((s, i) => `
          <span class="feature-step ${s.multiplier > 0 ? '' : 'zero'}" style="animation-delay:${i * 60}ms">
            ${escapeHtml(s.label)} &middot; ${fmtMult(s.multiplier)}
          </span>`).join('')}
      </div>
      <div style="margin-top:14px;font-family:var(--font-mono);font-weight:800;font-size:1.2rem">
        +${fmt(Math.round(result.bet * result.feature.multiplier))}
      </div>
    </div>`;
  cabinet.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2600);
}

function addHistory(result) {
  history.unshift(result);
  if (history.length > 20) history.pop();

  const root = document.getElementById('history');
  if (!root) return;
  root.innerHTML = history.map(r => `
    <div class="history-row ${r.band}">
      <span>${r.isWin ? (r.feature ? '🎁 ' + escapeHtml(r.feature.name) : 'Win') : 'No win'}</span>
      <span class="mult">${r.isWin ? '+' + fmt(r.payout) : '−' + fmt(r.bet)}</span>
      <span class="mult" style="min-width:64px;text-align:right;color:var(--muted)">${fmtMult(r.multiplier)}</span>
    </div>`).join('');
}

export function teardownGame() {
  autoRemaining = 0;
  spinning = false;
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  save(true);
}
