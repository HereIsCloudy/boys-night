import { getState, updateBalance, addWager, recordStat, addXP, getEquippedBonus } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, makeBetRow, showView } from './ui.js';
import { checkAchievements, triggerAchievement } from './stats.js';
import { getSkillBonus } from './skills.js';

const CANVAS_W = 600, CANVAS_H = 300;

function rollCrashPoint() {
  // House edge 1% — standard Bustabit formula
  const r = Math.random();
  if (r < 0.01) return 1.0;
  return Math.floor(99 / (1 - r)) / 100;
}

export function initCrash() {
  const view = document.getElementById('view-crash');
  if (!view) return;

  view.innerHTML = `
    <div class="game-header">
      <button class="back-btn" id="crash-back">← Back</button>
      <h2 class="game-title">📈 CRASH</h2>
    </div>
    <div class="crash-wrap">
      <canvas id="crash-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
      <div class="crash-multi-display" id="crash-multi">1.00×</div>
      <div class="crash-history" id="crash-history"></div>
    </div>
    <div class="crash-controls">
      <div id="crash-bet-row"></div>
      <div class="crash-auto-row">
        <label class="crash-auto-label">Auto cashout at:
          <input type="number" id="crash-auto-val" min="1.1" step="0.1" value="2.00" style="width:72px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-size:.85rem"/>×
        </label>
        <label class="crash-auto-label"><input type="checkbox" id="crash-auto-chk" /> Auto cashout</label>
      </div>
      <div class="crash-btn-row">
        <button class="crash-action-btn green" id="crash-bet-btn">BET</button>
        <button class="crash-action-btn red" id="crash-cashout-btn" disabled>CASH OUT</button>
      </div>
    </div>
    <div class="crash-history-bar" id="crash-history-bar"></div>`;

  document.getElementById('crash-back').addEventListener('click', () => showView('lobby'));

  const canvas   = document.getElementById('crash-canvas');
  const ctx      = canvas.getContext('2d');
  const multiEl  = document.getElementById('crash-multi');
  const betBtn   = document.getElementById('crash-bet-btn');
  const cashBtn  = document.getElementById('crash-cashout-btn');
  const histBar  = document.getElementById('crash-history-bar');
  const autoChk  = document.getElementById('crash-auto-chk');
  const autoVal  = document.getElementById('crash-auto-val');

  const betContainer = document.getElementById('crash-bet-row');
  const { row: betRow, getbet } = makeBetRow(100, null);
  betContainer.appendChild(betRow);

  let state = 'idle'; // 'idle' | 'running' | 'crashed'
  let currentMulti = 1.0;
  let crashPoint = 1.0;
  let betAmount  = 0;
  let points     = [];
  let animId     = null;
  let startTime  = 0;
  let tickInterval = null;
  const history  = [];

  function drawCurve() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = '#0a001a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (!points.length) return;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_H); ctx.stroke(); }
    for (let y = 0; y <= CANVAS_H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CANVAS_W,y); ctx.stroke(); }

    const maxM = Math.max(2, currentMulti);
    const pad  = 20;

    function toCanvas(multi) {
      const frac = (multi - 1) / (maxM - 1);
      return { x: points.length <= 1 ? pad : pad + frac * (CANVAS_W - pad * 2),
               y: CANVAS_H - pad - frac * (CANVAS_H - pad * 2) };
    }

    // Fill under curve
    ctx.beginPath();
    const startPt = toCanvas(1);
    ctx.moveTo(startPt.x, CANVAS_H);
    const lineColor = state === 'crashed' ? '#ef4444' : '#10b981';

    points.forEach((m, i) => {
      const p = toCanvas(m);
      if (i === 0) ctx.lineTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });

    const last = toCanvas(currentMulti);
    ctx.lineTo(last.x, CANVAS_H);
    ctx.closePath();
    ctx.fillStyle = state === 'crashed' ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.12)';
    ctx.fill();

    // Curve line
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = lineColor;
    ctx.shadowBlur = 12;
    points.forEach((m, i) => {
      const p = toCanvas(m);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dot at current point
    const dot = toCanvas(currentMulti);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = '11px Inter';
    for (let m = 1; m <= Math.ceil(maxM); m++) {
      const pt = toCanvas(m);
      ctx.fillText(m + '×', 4, pt.y + 4);
    }
  }

  function startRound() {
    const s = getState();
    betAmount = getbet();
    if (betAmount < 1 || betAmount > s.balance) { toast('Invalid bet', 'lose'); return; }

    // Apply crash floor from items
    const floorBonus = getEquippedBonus('crash_floor');

    updateBalance(-betAmount);
    addWager(betAmount, 'crash');
    if (betAmount >= 500) triggerAchievement('big_bet');

    crashPoint = rollCrashPoint();
    // Apply floor — if crash point below floor, set to floor
    if (floorBonus > 1.01 && crashPoint < floorBonus) crashPoint = floorBonus;

    currentMulti = 1.0;
    points = [1.0];
    startTime = performance.now();
    state = 'running';

    betBtn.disabled = true;
    cashBtn.disabled = false;
    multiEl.style.color = '#10b981';
    multiEl.textContent = '1.00×';

    Audio.tick();

    let lastTick = startTime;
    tickInterval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;
      // Exponential growth
      currentMulti = Math.pow(Math.E, elapsed * 0.07 * 1.4);

      points.push(currentMulti);
      if (points.length > 200) points.shift();

      multiEl.textContent = currentMulti.toFixed(2) + '×';
      drawCurve();

      // Auto cashout
      if (autoChk.checked) {
        const target = parseFloat(autoVal.value) || 2;
        if (currentMulti >= target) { cashout(); return; }
      }

      // Crash check
      if (currentMulti >= crashPoint) {
        doCrash();
      } else {
        Audio.tick();
      }
    }, 100);
  }

  function cashout() {
    if (state !== 'running') return;
    clearInterval(tickInterval);
    state = 'idle';
    cashBtn.disabled = true;
    betBtn.disabled = false;

    const skillMult = 1 + (getSkillBonus('all_multi') + getEquippedBonus('all_multi') + getEquippedBonus('crash_multi')) / 100;
    const effectiveMult = currentMulti * skillMult;
    const won = Math.floor(betAmount * effectiveMult);

    updateBalance(won);
    recordStat('crash', 'won', 1, true);
    recordStat('crash', 'plays', 1, true);
    recordStat('crash', 'wagered', betAmount, true);
    recordStat('crash', 'biggestMulti', currentMulti, false, true);
    recordStat('crash', 'highestCashout', won, false, true);
    addXP(Math.ceil(Math.log2(effectiveMult + 1) * 10));

    const profit = won - betAmount;
    Audio.cashout();
    Particles.sparkle(canvas.offsetLeft + CANVAS_W / 2, canvas.offsetTop + 20, '#10b981', 20);
    toast(`Cashed out at ${currentMulti.toFixed(2)}× → +${fmtNum(profit)} profit`, 'win');
    pushHistory(currentMulti, false);

    if (currentMulti <= 1.01) triggerAchievement('crash_early');
    if (currentMulti >= 10)   triggerAchievement('crash_moon');
    if (currentMulti >= 100)  triggerAchievement('crash_100');
    checkAchievements();
  }

  function doCrash() {
    clearInterval(tickInterval);
    state = 'crashed';
    cashBtn.disabled = true;
    betBtn.disabled = false;

    multiEl.style.color = '#ef4444';
    multiEl.textContent = `💥 ${crashPoint.toFixed(2)}×`;

    recordStat('crash', 'lost', 1, true);
    recordStat('crash', 'plays', 1, true);
    recordStat('crash', 'wagered', betAmount, true);
    addXP(2);

    const refund = getEquippedBonus('return_on_loss') + getSkillBonus('return_on_loss');
    if (refund > 0) {
      const got = Math.round(betAmount * refund / 100);
      updateBalance(got);
      toast(`Crashed at ${crashPoint.toFixed(2)}×. Refunded ${fmtNum(got)} (${refund}%)`, 'lose');
    } else {
      Audio.crash();
      toast(`Crashed at ${crashPoint.toFixed(2)}×!`, 'lose');
    }

    Particles.screenFlash('#ef4444');
    drawCurve();
    pushHistory(crashPoint, true);
    checkAchievements();
  }

  function pushHistory(multi, crashed) {
    history.unshift({ multi, crashed });
    if (history.length > 20) history.pop();
    renderHistBar();
  }

  function renderHistBar() {
    histBar.innerHTML = '';
    history.forEach(h => {
      const d = document.createElement('div');
      d.className = 'crash-hist-chip';
      const v = h.multi;
      d.style.background = h.crashed
        ? (v < 1.5 ? '#7f1d1d' : v < 3 ? '#991b1b' : '#b91c1c')
        : (v < 2 ? '#14532d' : v < 5 ? '#15803d' : '#16a34a');
      d.style.color = '#fff';
      d.textContent = v.toFixed(2) + '×';
      histBar.appendChild(d);
    });
  }

  cashBtn.addEventListener('click', cashout);
  betBtn.addEventListener('click', startRound);

  drawCurve();
}
