/**
 * The play view: reels, spin animation, autospin, and the celebration layer.
 *
 * Celebration scales with the win tier. Dust barely twitches; Mega takes the
 * whole screen. That proportionality is the entire point — if every win got
 * the full treatment, none of them would land.
 */

import { MACHINE_BY_ID, REELS, ROWS, BET_STEPS, BET_MIN, BET_MAX, clampBet,
         TURBO_PRICE, AUTOSPIN_PRICE, PAYLINES } from './machines.js';
import { AUTOSPIN_STOP_MULTIPLIER, BANDS, PAYING_BANDS, MAX_MULTIPLIER } from './bands.js';
import { spin as engineSpin, gridForMultiplier } from './engine.js';
import { spinRng } from './rng.js';
import {
  getState, addBalance, setBet, recordSpin, hasTurbo, hasAutospin,
  buyTurbo, buyAutospin, checkBrokeRelief, save,
} from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { fmt, fmtFull, fmtMult, fmtPct, countUp, toast, modal, escapeHtml } from './ui.js';
import { checkAchievements } from './achievements.js';
import { queueSync } from './sync.js';
import { Events } from './events.js';

const AUTOSPIN_COUNTS = [10, 25, 50, 100, Infinity];

let machine = null;
let spinning = false;
let autoRemaining = 0;
let turboOn = false;
let awaitingCollect = false;
let cleanupFns = [];
let history = [];

/**
 * Active bonus round, or null.
 *
 * A feature used to resolve instantly and print a summary card, which meant
 * the best part of the game happened without the player touching anything.
 * Now the steps are handed back one at a time: the spin button stays live but
 * costs nothing, each press plays the next step on the real reels, and the
 * running total builds until there's something to claim.
 */
let feature = null;

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
  awaitingCollect = false;
  feature = null;
  history = [];
  turboOn = hasTurbo(machine.id) && getState().settings.turboDefault;

  // Every win sound from here on is in this cabinet's key.
  Audio.setVoice(machine.sound);

  const s = getState();
  root.style.setProperty('--m-accent', machine.accent);
  root.innerHTML = `
    <div class="game">
      <div class="game-head">
        <h2>${escapeHtml(machine.name)}</h2>
        <span class="feat">${escapeHtml(machine.featureName)}</span>
        <button class="info-btn" id="info-btn" title="Paytable and odds">i</button>
      </div>

      <div class="bank" id="bank">
        <span class="bank-label">Balance</span>
        <span class="bank-value num" id="bank-value">${fmtFull(s.balance)}</span>
      </div>

      <div class="cabinet" id="cabinet">
        <div class="reels" id="reels"></div>
        <div class="win-banner hidden" id="banner"></div>
      </div>

      <div class="controls">
        <div class="bet-block">
          <div class="bet-row">
            <span class="bet-label">Bet</span>
            <button class="bet-step" id="bet-down" title="Lower">&minus;</button>
            <input class="bet-input num" id="bet-input" inputmode="numeric"
                   value="${s.bet}" aria-label="Bet amount">
            <button class="bet-step" id="bet-up" title="Raise">+</button>
          </div>
          <div class="bet-quick">
            <button class="bet-chip" data-bet-op="half">&frac12;</button>
            <button class="bet-chip" data-bet-op="x2">&times;2</button>
            <button class="bet-chip" data-bet-op="x10">&times;10</button>
            <button class="bet-chip" data-bet-op="max">MAX</button>
          </div>
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
  document.getElementById('bet-down').onclick = () => stepBet(-1);
  document.getElementById('bet-up').onclick = () => stepBet(1);
  document.getElementById('spin').onclick = onSpinClick;
  document.getElementById('turbo').onclick = onTurboClick;
  document.getElementById('auto').onclick = onAutoClick;
  document.getElementById('info-btn').onclick = showInfo;

  document.querySelectorAll('[data-bet-op]').forEach(btn => {
    btn.onclick = () => applyBetOp(btn.dataset.betOp);
  });

  // Typed bets are only committed on blur/Enter, so half-typed numbers like
  // "5" on the way to "500" never briefly become the live bet.
  const input = document.getElementById('bet-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { commitBetInput(); input.blur(); }
  });
  input.addEventListener('blur', commitBetInput);
  input.addEventListener('focus', () => input.select());

  const onKey = e => {
    if (e.code === 'Space' && !e.repeat && !e.target.matches('input,textarea')) {
      e.preventDefault();
      onSpinClick();
    }
  };
  document.addEventListener('keydown', onKey);
  cleanupFns.push(() => document.removeEventListener('keydown', onKey));
}

function paintBet(value) {
  const input = document.getElementById('bet-input');
  if (input) input.value = value;
}

function commitBetInput() {
  const input = document.getElementById('bet-input');
  if (!input) return;
  const next = clampBet(input.value);
  setBet(next);
  paintBet(next);
}

/** Walk the preset ladder rather than stepping by 1 across a 1-5000 range. */
function stepBet(dir) {
  const current = getState().bet;
  let next;
  if (dir > 0) next = BET_STEPS.find(v => v > current) ?? BET_MAX;
  else next = [...BET_STEPS].reverse().find(v => v < current) ?? BET_MIN;
  setBet(next);
  paintBet(next);
  Audio.click();
}

function applyBetOp(op) {
  const s = getState();
  let next;
  switch (op) {
    case 'half': next = Math.floor(s.bet / 2); break;
    case 'x2':   next = s.bet * 2; break;
    case 'x10':  next = s.bet * 10; break;
    // MAX is capped by what you can actually afford, so it never puts the
    // spin button into a state that just errors.
    case 'max':  next = Math.min(BET_MAX, Math.max(BET_MIN, Math.floor(s.balance))); break;
    default: return;
  }
  const clamped = clampBet(next);
  setBet(clamped);
  paintBet(clamped);
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
    if (feature) {
      const left = feature.steps.length - feature.index;
      spinBtn.textContent = left > 0 ? `Free Spin  ${left}` : 'Finish';
      spinBtn.classList.remove('stop');
      spinBtn.classList.add('free');
    } else {
      spinBtn.textContent = autoRemaining > 0 ? 'Stop' : 'Spin';
      spinBtn.classList.toggle('stop', autoRemaining > 0);
      spinBtn.classList.remove('free');
    }
  }

  // Betting is locked while a bonus is running — the stake is already set.
  document.querySelectorAll('#bet-input,#bet-down,#bet-up,[data-bet-op],#auto,#turbo')
    .forEach(el => { el.disabled = !!feature; });
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
  // A pending Claim owns the screen — the click belongs to it, not to a spin.
  if (awaitingCollect) { document.getElementById('collect-btn')?.click(); return; }
  // Mid-bonus, the button advances the bonus instead of buying a spin.
  if (feature) { playFeatureStep(); return; }
  if (autoRemaining > 0) { autoRemaining = 0; refreshControls(); return; }
  if (spinning) return;
  doSpin();
}

async function doSpin() {
  if (spinning || awaitingCollect || feature) return;
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
  paintBank(getState().balance);
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
  // Collect-tier wins fly their coins when the player clicks Collect, so the
  // payoff lands on the click rather than before they've even seen the number.
  if (!needsClaim(result)) flyCoins(tier, result.payout);
  else paintBank(getState().balance);

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

  if (result.feature) enterFeature(result);
  else showBanner(result);
}

// ── Bonus rounds ────────────────────────────────────────────────────────────

/** Hand control of the bonus to the player rather than resolving it for them. */
function enterFeature(result) {
  Audio.feature();
  feature = {
    name: result.feature.name,
    steps: result.feature.steps,
    index: 0,
    total: 0,
    bet: result.bet,
    // The base spin already paid; only the bonus is played out here.
    basePayout: result.payout - Math.round(result.bet * result.feature.multiplier),
    result,
  };
  autoRemaining = 0;
  renderFeatureBar();
  refreshControls();
}

function renderFeatureBar() {
  let bar = document.getElementById('feature-bar');
  if (!feature) { bar?.remove(); return; }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'feature-bar';
    bar.className = 'feature-bar';
    document.getElementById('cabinet')?.before(bar);
  }

  const remaining = feature.steps.length - feature.index;
  bar.innerHTML = `
    <span class="fb-name">${escapeHtml(feature.name)}</span>
    <span class="fb-count">${remaining > 0 ? `${remaining} left` : 'Complete'}</span>
    <span class="fb-total num">+${fmtFull(Math.round(feature.bet * feature.total))}</span>`;
  bar.classList.toggle('done', remaining <= 0);
}

/** Play the next step of the bonus. Costs nothing. */
async function playFeatureStep() {
  if (!feature || spinning) return;
  const step = feature.steps[feature.index];
  if (!step) return finishFeature();

  spinning = true;
  refreshControls();
  Audio.spinStart();

  const s = getState();
  s.nonce++;
  const rng = spinRng(s.serverSeed, s.clientSeed, s.nonce);
  const grid = gridForMultiplier(machine, rng, step.multiplier);

  await animateReels({ grid, feature: null });

  feature.index++;
  feature.total += step.multiplier;

  const stepPay = Math.round(feature.bet * step.multiplier);
  if (stepPay > 0) {
    addBalance(stepPay, 'win');
    paintBank(getState().balance);
    Audio.rung(Math.min(6, Math.floor(step.multiplier / 8)));
    flashStep(step, stepPay);
  } else {
    Audio.dust();
    flashStep(step, 0);
  }

  renderFeatureBar();
  spinning = false;

  if (feature.index >= feature.steps.length) setTimeout(finishFeature, 700);
  else refreshControls();
}

/** Small floating label for what the step just paid. */
function flashStep(step, pay) {
  const cabinet = document.getElementById('cabinet');
  if (!cabinet || reduceMotion()) return;
  const el = document.createElement('div');
  el.className = `step-flash ${pay > 0 ? '' : 'zero'}`;
  el.innerHTML = `<b>${escapeHtml(step.label)}</b>${pay > 0 ? ` +${fmt(pay)}` : ' —'}`;
  cabinet.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function finishFeature() {
  if (!feature) return;
  const total = feature.total;
  const bet = feature.bet;
  const name = feature.name;
  const totalPay = Math.round(bet * total);
  feature = null;
  renderFeatureBar();

  // The bonus total gets the same reveal a big base win would get. Payout is
  // already banked step by step, so this is presentation only.
  showBanner({
    payout: totalPay,
    multiplier: total,
    bet,
    band: bandNameFor(total),
    featureName: name,
    alreadyPaid: true,
  });
  refreshControls();
  checkAchievements();
  queueSync();
}

function bandNameFor(mult) {
  if (mult >= 2000) return 'mega';
  if (mult >= 200) return 'big';
  if (mult >= 20) return 'medium';
  if (mult >= 2) return 'small';
  return 'dust';
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

/** Coins arcing from the reels into the on-screen balance. */
function flyCoins(tier, payout) {
  const target = document.getElementById('bank-value');
  const cabinet = document.getElementById('cabinet');
  if (!target) return;

  const before = getState().balance - (payout ?? 0);
  if (payout) paintBank(getState().balance, before);

  if (reduceMotion() || !cabinet) return;
  const count = { dust: 0, small: 4, medium: 9, big: 16, mega: 26 }[tier] ?? 0;
  if (!count) return;

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
    coin.style.animationDelay = `${i * 42}ms`;
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 1400 + i * 42);
  }
}

/**
 * Paytable and odds for this machine. Everything here is read straight from
 * the live config, so it can never drift from what the engine actually does.
 */
function showInfo() {
  Audio.click();
  const bands = PAYING_BANDS;
  const spinsPerFeature = Math.round(1 / machine.featureRate);

  modal(`
    <h3 style="color:${machine.accent}">${escapeHtml(machine.name)}</h3>
    <p style="color:var(--muted);font-size:.86rem;margin:0 0 16px;line-height:1.5">
      ${escapeHtml(machine.tagline)}
    </p>

    <div class="info-grid">
      <span>Return to player</span><b>${fmtPct(machine.rtp, 0)}</b>
      <span>Grid</span><b>${REELS}&times;${ROWS}, ${PAYLINES.length} lines</b>
      <span>Bet range</span><b>${fmtFull(BET_MIN)} – ${fmtFull(BET_MAX)}</b>
      <span>Max win</span><b>${fmtFull(MAX_MULTIPLIER)}&times;</b>
      <span>Feature</span><b>${escapeHtml(machine.featureName)}</b>
      <span>Feature odds</span><b>1 in ${fmtFull(spinsPerFeature)} spins</b>
    </div>

    <p style="font-size:.82rem;line-height:1.55;margin:14px 0 6px">
      ${escapeHtml(machine.featureDesc)}
    </p>

    <div class="section-title" style="margin:18px 0 8px">Win bands</div>
    <p style="color:var(--muted);font-size:.74rem;line-height:1.5;margin:0 0 10px">
      A spin rolls a band, then a random multiplier inside it. Ranges are
      contiguous, so any value between ${bands[0].min}&times; and
      ${fmtFull(MAX_MULTIPLIER)}&times; is possible.
    </p>
    <div class="info-bands">
      ${bands.map(b => {
        const odds = Math.round(1 / (b.weight / 10_000_000));
        return `
          <div class="info-band">
            <span class="band-dot ${b.id}">${b.name}</span>
            <span class="num">${b.min}&times; – ${fmtFull(b.max)}&times;</span>
            <span class="num" style="color:var(--muted)">1 in ${fmtFull(odds)}</span>
          </div>`;
      }).join('')}
    </div>

    <div class="section-title" style="margin:18px 0 8px">Symbols</div>
    <div class="info-syms">
      ${machine.symbols.map(sym => `
        <div class="info-sym" title="${escapeHtml(sym.name)}">
          <span class="g">${sym.glyph}</span>
          <span class="n">${escapeHtml(sym.name)}</span>
          <span class="t">${
            sym.tier === 'wild' ? 'Wild' :
            sym.tier === 'scat' ? 'Scatter' :
            sym.tier === 'high' ? 'High' :
            sym.tier === 'mid' ? 'Mid' : 'Low'
          }</span>
        </div>`).join('')}
    </div>

    <p style="color:var(--muted);font-size:.72rem;line-height:1.5;margin:16px 0 0">
      Wilds substitute for any symbol except scatters. Three or more scatters
      trigger ${escapeHtml(machine.featureName)}. Every result is generated from
      your seed pair and a spin counter, so any spin can be replayed and checked
      from Settings.
    </p>`);
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

/**
 * Any win at or above this multiplier stops everything and demands a click.
 * Keyed to the multiplier rather than the band, so a 12x from a small band
 * still gets the full treatment — the player cares what it paid, not which
 * internal bucket produced it.
 */
const CLAIM_FROM_MULTIPLIER = 10;

const needsClaim = result => result.multiplier >= CLAIM_FROM_MULTIPLIER;

/**
 * The rollup ladder.
 *
 * A big win doesn't just print its number — the counter climbs and the title
 * keeps getting upgraded underneath it. Each rung is keyed to the running
 * multiplier, so the player watches "BIG WIN" become "MASSIVE" become
 * "LEGENDARY" while the money is still ticking up. That escalation is the
 * whole payoff; the final number arriving instantly wastes it.
 */
const ROLLUP = [
  { at: 0,    name: 'WIN',        colour: 'var(--win-small)'  },
  { at: 10,   name: 'NICE',       colour: '#7dd3fc'           },
  { at: 25,   name: 'BIG WIN',    colour: 'var(--win-medium)' },
  { at: 60,   name: 'HUGE WIN',   colour: '#a855f7'           },
  { at: 150,  name: 'MASSIVE',    colour: 'var(--win-big)'    },
  { at: 400,  name: 'COLOSSAL',   colour: '#ff9500'           },
  { at: 1000, name: 'UNREAL',     colour: '#ff4d8d'           },
  { at: 3000, name: 'LEGENDARY',  colour: 'var(--win-mega)'   },
  { at: 8000, name: 'BOYS NIGHT', colour: '#ffd93d'           },
];

function rungFor(mult) {
  let rung = ROLLUP[0];
  for (const r of ROLLUP) if (mult >= r.at) rung = r;
  return rung;
}

function paintBank(value, animateFrom) {
  const el = document.getElementById('bank-value');
  if (!el) return;
  if (animateFrom != null) countUp(el, animateFrom, value, 900, fmtFull);
  else el.textContent = fmtFull(value);
}

/**
 * Climb the counter and upgrade the title as it passes each rung.
 * Returns a cancel function.
 */
function rollup(result, els, done) {
  const target = result.payout;
  const perBet = result.bet > 0 ? result.bet : 1;
  const topRung = rungFor(result.multiplier);
  // Longer climbs for bigger wins — a Mega should take its time.
  const ms = Math.min(6000, 900 + ROLLUP.indexOf(topRung) * 620);
  const start = performance.now();

  let lastRung = null;
  let raf = 0;

  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 2.2);
    const shown = target * eased;
    els.amount.textContent = fmt(shown);

    const rung = rungFor(shown / perBet);
    if (rung !== lastRung) {
      lastRung = rung;
      els.title.textContent = rung.name;
      els.root.style.color = rung.colour;
      if (!reduceMotion()) {
        els.title.classList.remove('rung-pop');
        void els.title.offsetWidth;
        els.title.classList.add('rung-pop');
      }
      // Each upgrade is a note higher than the last.
      Audio.rung(ROLLUP.indexOf(rung));
    }

    if (t < 1) raf = requestAnimationFrame(step);
    else { els.amount.textContent = fmt(target); done?.(); }
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function showBanner(result) {
  const banner = document.getElementById('banner');
  if (!banner) return;

  const tier = result.band;
  const collect = needsClaim(result);

  banner.className = `win-banner tier-${tier}${collect ? ' collectable' : ''}`;
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="wb-inner">
      ${result.featureName ? `<div class="wb-feature">${escapeHtml(result.featureName)}</div>` : ''}
      <div class="rung-title" id="rung-title">WIN</div>
      <div class="amount num" id="banner-amount">0</div>
      <div class="mult">${fmtMult(result.multiplier)}</div>
      ${collect ? `<button class="collect-btn" id="collect-btn" disabled>Claim</button>` : ''}
    </div>`;

  const els = {
    root: banner,
    title: document.getElementById('rung-title'),
    amount: document.getElementById('banner-amount'),
  };

  // Small wins don't deserve the ladder — they just tick and vanish.
  if (!collect) {
    countUp(els.amount, 0, result.payout, tier === 'dust' ? 250 : 600, fmt);
    els.title.textContent = rungFor(result.multiplier).name;
    setTimeout(hideBanner, tier === 'dust' ? 550 : 950);
    return;
  }

  // A win worth collecting cancels autospin so it can never scroll past.
  autoRemaining = 0;
  refreshControls();
  awaitingCollect = true;

  const btn = document.getElementById('collect-btn');
  const finish = () => {
    if (!awaitingCollect) return;
    awaitingCollect = false;
    cancelRollup?.();
    Audio.coin();
    // Bonus totals were already banked one step at a time, so don't animate
    // the balance a second time — just the coins.
    flyCoins(tier, result.alreadyPaid ? 0 : result.payout);
    hideBanner();
  };

  // Collect stays disabled until the climb finishes, so nobody skips the
  // reveal by mashing — but it enables the moment it's done.
  const cancelRollup = rollup(result, els, () => {
    btn.disabled = false;
    btn.focus();
  });

  btn.onclick = finish;
  const onKey = e => {
    if ((e.key === 'Enter' || e.code === 'Space') && !btn.disabled) {
      e.preventDefault();
      finish();
    }
  };
  document.addEventListener('keydown', onKey);
  cleanupFns.push(() => document.removeEventListener('keydown', onKey));
}

function hideBanner() {
  awaitingCollect = false;
  const banner = document.getElementById('banner');
  if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
  document.querySelectorAll('.symbol.win, .symbol.scatter-hit')
    .forEach(e => e.classList.remove('win', 'scatter-hit'));
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
  awaitingCollect = false;
  feature = null;
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  save(true);
}
