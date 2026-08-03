/**
 * PLINKO.
 *
 * A ball falls through 16 rows of pegs, bouncing left or right at each one, and
 * lands in one of 17 buckets. That makes the odds a binomial distribution —
 * bucket k has probability C(16,k)/65536 — so the centre is hit 19.6% of the
 * time and either edge only once in 65,536 drops. The payout table is symmetric
 * with the huge multipliers on the outside, which is why the middle has to pay
 * less than your stake: that is where the ball almost always goes.
 *
 * The real-money version of this game runs at 99% RTP. Dropped in next to
 * machines paying 56%, it would be strictly better than every slot in the
 * building and nobody would touch them again. So the shapes are real but the
 * interiors are scaled to land on the same ~56% the rest of the game pays,
 * with the headline edge multipliers left untouched.
 */

import { getState, addBalance, setBet, recordPlinko } from './state.js';
import { BET_MIN, BET_MAX, BET_STEPS, clampBet } from './machines.js';
import { spinRng } from './rng.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { fmt, fmtFull, fmtMult, toast, modal, escapeHtml } from './ui.js';
import { queueSync } from './sync.js';

export const ROWS = 16;
export const BUCKETS = ROWS + 1;

/**
 * Payout tables, verified against the binomial odds to 56.0% RTP each.
 * Index 0 is the far left bucket, 16 the far right; they mirror.
 */
export const RISKS = {
  easy: {
    id: 'easy',
    label: 'Easy',
    blurb: 'Low variance. You bleed slowly and steadily, and the top prize is small.',
    colour: '#22c55e',
    table: [16, 5.09, 1.13, 0.79, 0.79, 0.68, 0.62, 0.57, 0.28, 0.57, 0.62, 0.68, 0.79, 0.79, 1.13, 5.09, 16],
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    blurb: 'The middle ground. Real swings, a 110x ceiling, and a centre that still costs you.',
    colour: '#38bdf8',
    table: [110, 23.1, 5.64, 2.82, 1.69, 0.85, 0.56, 0.28, 0.17, 0.28, 0.56, 0.85, 1.69, 2.82, 5.64, 23.1, 110],
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    blurb: 'Brutal. The centre returns 11% of your stake and you will land there constantly. The edges pay 1000x once in 65,536 drops.',
    colour: '#ff2d55',
    table: [1000, 71.8, 14.4, 4.97, 2.21, 1.1, 0.11, 0.11, 0.11, 0.11, 0.11, 1.1, 2.21, 4.97, 14.4, 71.8, 1000],
  },
};

/** C(16,k) — how many distinct paths reach each bucket. */
const PATHS = (() => {
  const out = [];
  let c = 1;
  for (let k = 0; k <= ROWS; k++) { out.push(c); c = c * (ROWS - k) / (k + 1); }
  return out;
})();
const TOTAL_PATHS = 2 ** ROWS;

export function bucketOdds(k) {
  return PATHS[k] / TOTAL_PATHS;
}

export function riskRTP(risk) {
  return RISKS[risk].table.reduce((s, m, k) => s + m * bucketOdds(k), 0);
}

let currentRisk = 'medium';
let dropping = 0;          // concurrent balls in flight
let cleanupFns = [];

export function renderPlinko(root) {
  const s = getState();

  root.innerHTML = `
    <div class="game">
      <div class="game-head">
        <h2>PLINKO</h2>
        <span class="feat" id="plinko-risk-badge"></span>
        <button class="info-btn" id="plinko-info" title="Odds and payouts">i</button>
      </div>

      <div class="bank" id="bank">
        <span class="bank-label">Balance</span>
        <span class="bank-value num" id="bank-value">${fmtFull(s.balance)}</span>
      </div>

      <div class="risk-row" id="risk-row">
        ${Object.values(RISKS).map(r => `
          <button class="risk-btn ${r.id === currentRisk ? 'active' : ''}" data-risk="${r.id}"
                  style="--risk:${r.colour}">
            ${r.label}
            <span class="risk-max">up to ${fmtMult(r.table[0])}</span>
          </button>`).join('')}
      </div>

      <div class="cabinet plinko-cabinet" id="plinko-board">
        <div class="pegs" id="pegs"></div>
        <div class="balls" id="balls"></div>
        <div class="buckets" id="buckets"></div>
      </div>

      <div class="controls">
        <div class="bet-block">
          <div class="bet-row">
            <span class="bet-label">Bet</span>
            <button class="bet-step" id="bet-down">&minus;</button>
            <input class="bet-input num" id="bet-input" inputmode="numeric" value="${s.bet}">
            <button class="bet-step" id="bet-up">+</button>
          </div>
          <div class="bet-quick">
            <button class="bet-chip" data-bet-op="half">&frac12;</button>
            <button class="bet-chip" data-bet-op="x2">&times;2</button>
            <button class="bet-chip" data-bet-op="x10">&times;10</button>
            <button class="bet-chip" data-bet-op="max">MAX</button>
          </div>
        </div>
        <button class="spin-btn" id="drop-btn">Drop</button>
      </div>

      <div>
        <div class="section-title">Recent drops</div>
        <div class="history" id="plinko-history">
          <div class="empty" style="padding:20px">No drops yet.</div>
        </div>
      </div>
    </div>`;

  buildPegs();
  buildBuckets();
  paintRiskBadge();
  wire(root);
}

function buildPegs() {
  const host = document.getElementById('pegs');
  host.innerHTML = '';
  // Row r has r+2 pegs, centred — the classic triangle the ball threads.
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'peg-row';
    for (let i = 0; i < r + 2; i++) {
      const peg = document.createElement('span');
      peg.className = 'peg';
      peg.dataset.row = r;
      peg.dataset.i = i;
      row.appendChild(peg);
    }
    host.appendChild(row);
  }
}

function buildBuckets() {
  const host = document.getElementById('buckets');
  const table = RISKS[currentRisk].table;
  host.innerHTML = '';
  for (let k = 0; k < BUCKETS; k++) {
    const m = table[k];
    const b = document.createElement('div');
    // Winners and losers are coloured differently, because "which of these
    // actually pays" is the only thing a player needs from this row.
    b.className = `bucket ${m >= 1 ? 'win' : 'loss'} ${m >= 10 ? 'big' : ''}`;
    b.dataset.bucket = k;
    b.textContent = m >= 100 ? `${Math.round(m)}x` : `${m}x`;
    host.appendChild(b);
  }
}

function paintRiskBadge() {
  const badge = document.getElementById('plinko-risk-badge');
  const r = RISKS[currentRisk];
  if (badge) {
    badge.textContent = `${r.label} · RTP ${(riskRTP(currentRisk) * 100).toFixed(0)}%`;
    badge.style.color = r.colour;
  }
  document.getElementById('plinko-board')?.style.setProperty('--m-accent', r.colour);
}

function wire(root) {
  root.querySelectorAll('[data-risk]').forEach(btn => {
    btn.onclick = () => {
      currentRisk = btn.dataset.risk;
      root.querySelectorAll('[data-risk]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildBuckets();
      paintRiskBadge();
      Audio.click();
    };
  });

  document.getElementById('drop-btn').onclick = drop;
  document.getElementById('bet-down').onclick = () => stepBet(-1);
  document.getElementById('bet-up').onclick = () => stepBet(1);
  document.getElementById('plinko-info').onclick = showInfo;
  root.querySelectorAll('[data-bet-op]').forEach(b => { b.onclick = () => betOp(b.dataset.betOp); });

  const input = document.getElementById('bet-input');
  input.addEventListener('blur', commitBet);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { commitBet(); input.blur(); } });
  input.addEventListener('focus', () => input.select());

  const onKey = e => {
    if (e.code === 'Space' && !e.repeat && !e.target.matches('input,textarea')) {
      e.preventDefault();
      drop();
    }
  };
  document.addEventListener('keydown', onKey);
  cleanupFns.push(() => document.removeEventListener('keydown', onKey));
}

function paintBet(v) { const i = document.getElementById('bet-input'); if (i) i.value = v; }
function commitBet() {
  const i = document.getElementById('bet-input');
  if (!i) return;
  const n = clampBet(i.value);
  setBet(n); paintBet(n);
}
function stepBet(dir) {
  const cur = getState().bet;
  const next = dir > 0
    ? (BET_STEPS.find(v => v > cur) ?? BET_MAX)
    : ([...BET_STEPS].reverse().find(v => v < cur) ?? BET_MIN);
  setBet(next); paintBet(next); Audio.click();
}
function betOp(op) {
  const s = getState();
  const next = clampBet({
    half: Math.floor(s.bet / 2),
    x2: s.bet * 2,
    x10: s.bet * 10,
    max: Math.min(BET_MAX, Math.floor(s.balance)),
  }[op] ?? s.bet);
  setBet(next); paintBet(next); Audio.click();
}

/**
 * Drop a ball.
 *
 * The path is decided up front by 16 coin flips from the provably-fair stream,
 * so the bucket is known before the animation starts and the ball is simply
 * shown travelling to a result already committed — the same honesty the reels
 * get. Balls are independent, so several can be in flight at once.
 */
async function drop() {
  const s = getState();
  const bet = s.bet;
  if (bet > s.balance) {
    Audio.error();
    toast('Not enough coins — wait for the pool', 'lose');
    return;
  }
  if (dropping > 12) return;   // keep the board readable

  addBalance(-bet, 'spin');
  paintBank(getState().balance);

  s.nonce++;
  const rng = spinRng(s.serverSeed, s.clientSeed, s.nonce);

  // 16 independent bounces. Right-count IS the bucket index, which is exactly
  // why the distribution is binomial.
  const path = [];
  let bucket = 0;
  for (let r = 0; r < ROWS; r++) {
    const right = rng() < 0.5;
    path.push(right);
    if (right) bucket++;
  }

  const risk = RISKS[currentRisk];
  const mult = risk.table[bucket];
  const payout = Math.round(bet * mult);

  dropping++;
  Audio.spinStart();
  await animateBall(path, bucket);
  dropping--;

  if (payout > 0) addBalance(payout, 'win');
  paintBank(getState().balance);
  recordPlinko({ risk: currentRisk, bet, bucket, multiplier: mult, payout });

  landBucket(bucket, mult);
  addHistory({ bucket, mult, payout, bet });
  queueSync();
}

/** Walk the ball down the peg rows, then into its bucket. */
function animateBall(path, bucket) {
  const board = document.getElementById('plinko-board');
  const host = document.getElementById('balls');
  if (!board || !host) return Promise.resolve();

  const reduce = getState().settings.reduceMotion;
  const ball = document.createElement('div');
  ball.className = 'plinko-ball';
  host.appendChild(ball);

  const stepMs = reduce ? 6 : 68;
  // Horizontal offset in "half-columns": each right bounce moves +1, left -1.
  let offset = 0;

  return new Promise(resolve => {
    let r = 0;
    const stepOnce = () => {
      if (r >= ROWS) {
        // Final drop into the bucket row.
        ball.style.setProperty('--y', `${ROWS + 1}`);
        setTimeout(() => { ball.remove(); resolve(); }, reduce ? 10 : 220);
        return;
      }
      offset += path[r] ? 1 : -1;
      ball.style.setProperty('--x', `${offset}`);
      ball.style.setProperty('--y', `${r + 1}`);
      if (!reduce) {
        Audio.peg(r);
        bumpPeg(r, Math.floor((offset + r + 2) / 2));
      }
      r++;
      setTimeout(stepOnce, stepMs);
    };
    stepOnce();
  });
}

function bumpPeg(row, i) {
  const peg = document.querySelector(`.peg[data-row="${row}"][data-i="${i}"]`);
  if (!peg) return;
  peg.classList.remove('hit');
  void peg.offsetWidth;
  peg.classList.add('hit');
}

function landBucket(k, mult) {
  const b = document.querySelector(`.bucket[data-bucket="${k}"]`);
  if (b) {
    b.classList.remove('landed');
    void b.offsetWidth;
    b.classList.add('landed');
  }
  if (mult >= 10) {
    Audio.big();
    Particles.burst(mult >= 100 ? 'mega' : 'big', document.getElementById('plinko-board'));
  } else if (mult >= 1) {
    Audio.small();
  } else {
    Audio.dust();
  }
}

function paintBank(v) {
  const el = document.getElementById('bank-value');
  if (el) el.textContent = fmtFull(v);
}

const history = [];
function addHistory(entry) {
  history.unshift(entry);
  if (history.length > 20) history.pop();
  const root = document.getElementById('plinko-history');
  if (!root) return;
  root.innerHTML = history.map(h => {
    const tier = h.mult >= 100 ? 'mega' : h.mult >= 10 ? 'big' : h.mult >= 1 ? 'small' : 'dust';
    return `
      <div class="history-row ${tier}">
        <span>Bucket ${h.bucket + 1}</span>
        <span class="mult">${h.payout > 0 ? '+' + fmt(h.payout) : '0'}</span>
        <span class="mult" style="min-width:64px;text-align:right;color:var(--muted)">${fmtMult(h.mult)}</span>
      </div>`;
  }).join('');
}

function showInfo() {
  Audio.click();
  const risk = RISKS[currentRisk];
  modal(`
      <h3 style="color:${risk.colour}">Plinko — ${escapeHtml(risk.label)}</h3>
      <p style="color:var(--muted);font-size:.86rem;line-height:1.6;margin:0 0 14px">
        ${escapeHtml(risk.blurb)}
      </p>

      <div class="info-grid">
        <span>Rows</span><b>${ROWS}</b>
        <span>Buckets</span><b>${BUCKETS}</b>
        <span>Return to player</span><b>${(riskRTP(currentRisk) * 100).toFixed(1)}%</b>
        <span>Top multiplier</span><b>${fmtMult(risk.table[0])}</b>
        <span>Centre multiplier</span><b>${fmtMult(risk.table[8])}</b>
        <span>Bet range</span><b>${fmtFull(BET_MIN)} – ${fmtFull(BET_MAX)}</b>
      </div>

      <div class="section-title" style="margin:18px 0 8px">Why the middle loses</div>
      <p style="color:var(--muted);font-size:.78rem;line-height:1.55;margin:0 0 12px">
        The ball bounces left or right ${ROWS} times, so where it lands is a
        binomial distribution. Reaching an edge means bouncing the same way
        every single time — one path out of ${fmtFull(TOTAL_PATHS)}. The centre
        has ${fmtFull(PATHS[8])} paths leading to it. That is why the centre
        pays less than your stake: it is where the ball nearly always goes.
      </p>

      <div class="info-rules">
        ${risk.table.slice(0, 9).map((m, k) => `
          <div class="info-rule">
            <span class="ir-term">Bucket ${k + 1} &amp; ${BUCKETS - k}${k === 8 ? ' (centre)' : ''}</span>
            <span class="ir-detail">
              ${fmtMult(m)} &middot; ${(bucketOdds(k) * (k === 8 ? 1 : 2) * 100).toFixed(2)}% chance
              ${m < 1 ? ' &mdash; pays back less than you staked' : ''}
            </span>
          </div>`).join('')}
      </div>`);
}

export function teardownPlinko() {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
  dropping = 0;
  history.length = 0;
}
