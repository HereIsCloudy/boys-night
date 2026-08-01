import { getState, updateBalance, addWager, recordStat, addXP, getEquippedBonus } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, makeBetRow, showJackpot, showView } from './ui.js';
import { checkAchievements, triggerAchievement } from './stats.js';
import { getSkillBonus } from './skills.js';

// Base segments: {label, mult, color, weight}
const BASE_SEGMENTS = [
  { label:'2×',      mult:2,    color:'#1e3a5f', weight:8  },
  { label:'3×',      mult:3,    color:'#1e4a3f', weight:4  },
  { label:'5×',      mult:5,    color:'#3b1f5e', weight:4  },
  { label:'VOID',    mult:0,    color:'#1a0a0a', weight:4  },
  { label:'10×',     mult:10,   color:'#4a2d00', weight:2  },
  { label:'25×',     mult:25,   color:'#7f1d1d', weight:1  },
  { label:'JACKPOT', mult:100,  color:'#78350f', weight:1  },
];

function buildSegments() {
  const s = getState();
  const segs = [];
  BASE_SEGMENTS.forEach(b => {
    const count = b.weight + (b.label === 'JACKPOT' ? getEquippedBonus('wheel_jackpot') : 0);
    const voidReduce = b.label === 'VOID' ? getEquippedBonus('wheel_void_remove') : 0;
    const final = Math.max(0, count - voidReduce);
    for (let i = 0; i < final; i++) segs.push({ ...b });
  });
  return segs;
}

export function initWheel() {
  const view = document.getElementById('view-wheel');
  if (!view) return;

  view.innerHTML = `
    <div class="game-header">
      <button class="back-btn" id="wheel-back">← Back</button>
      <h2 class="game-title">🌀 CHAOS WHEEL</h2>
    </div>
    <div class="wheel-arena">
      <div class="wheel-wrap" id="wheel-wrap">
        <canvas id="wheel-canvas" width="360" height="360"></canvas>
        <div class="wheel-pointer">▼</div>
      </div>
      <div class="wheel-result" id="wheel-result">Spin to win!</div>
    </div>
    <div class="wheel-controls">
      <div id="wheel-bet-row"></div>
      <button class="spin-btn" id="wheel-spin-btn">SPIN</button>
    </div>`;

  document.getElementById('wheel-back').addEventListener('click', () => showView('lobby'));

  const canvas    = document.getElementById('wheel-canvas');
  const ctx       = canvas.getContext('2d');
  const resultEl  = document.getElementById('wheel-result');
  const spinBtn   = document.getElementById('wheel-spin-btn');

  const betContainer = document.getElementById('wheel-bet-row');
  const { row: betRow, getbet } = makeBetRow(100, null);
  betContainer.appendChild(betRow);

  let spinning = false;
  let currentAngle = 0;

  function drawWheel(angle) {
    const segs = buildSegments();
    const cx = 180, cy = 180, r = 165;
    const step = (Math.PI * 2) / segs.length;

    ctx.clearRect(0, 0, 360, 360);

    segs.forEach((seg, i) => {
      const start = angle + i * step - Math.PI / 2;
      const end   = start + step;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + step / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = seg.label.length > 2 ? 'bold 9px Inter' : 'bold 12px Orbitron';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(seg.label, r - 10, 4);
      ctx.restore();
    });

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#0d001f';
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RW', cx, cy);
  }

  drawWheel(0);

  spinBtn.addEventListener('click', () => {
    if (spinning) return;
    const s = getState();
    const bet = getbet();
    if (bet < 1 || bet > s.balance) { toast('Invalid bet', 'lose'); return; }

    spinning = true;
    spinBtn.disabled = true;

    updateBalance(-bet);
    addWager(bet, 'wheel');
    if (bet >= 500) triggerAchievement('big_bet');
    Audio.spin();

    const segs = buildSegments();
    const segIdx = Math.floor(Math.random() * segs.length);
    const segAngle = (2 * Math.PI / segs.length) * segIdx;

    // Land pointer at top (angle = -segAngle - half-seg offset after full spins)
    const spins = 5 + Math.random() * 5;
    const targetAngle = -(segAngle + Math.PI / segs.length) + spins * 2 * Math.PI;
    const duration = 4000 + Math.random() * 1500;
    const start = performance.now();
    const startAngle = currentAngle;

    let lastTickIdx = -1;

    function animate(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const angle = startAngle + targetAngle * eased;
      currentAngle = angle;
      drawWheel(angle % (2 * Math.PI));

      // Tick sound every segment
      const tickIdx = Math.floor((angle % (2 * Math.PI)) / (2 * Math.PI / segs.length));
      if (tickIdx !== lastTickIdx) { Audio.wheelTick(); lastTickIdx = tickIdx; }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        spinning = false;
        spinBtn.disabled = false;
        Audio.wheelStop();
        resolveResult(segs[segIdx], bet);
      }
    }

    requestAnimationFrame(animate);
  });

  function resolveResult(seg, bet) {
    const skillMult = 1 + (getSkillBonus('all_multi') + getEquippedBonus('all_multi')) / 100;

    recordStat('wheel', 'spins', 1, true);
    recordStat('wheel', 'wagered', bet, true);

    if (seg.label === 'JACKPOT') {
      const jackpotAmt = bet * 100 * skillMult;
      updateBalance(jackpotAmt);
      recordStat('wheel', 'jackpots', 1, true);
      recordStat('wheel', 'won', 1, true);
      recordStat('wheel', 'biggestMulti', 100, false, true);
      addXP(80);
      showJackpot(jackpotAmt);
      resultEl.textContent = '🎉 JACKPOT! 100×!';
      resultEl.style.color = '#f59e0b';
      triggerAchievement('wheel_jack');
    } else if (seg.mult === 0) {
      const refund = getEquippedBonus('return_on_loss') + getSkillBonus('return_on_loss');
      if (refund > 0) {
        const got = Math.round(bet * refund / 100);
        updateBalance(got);
        toast(`VOID — refunded ${fmtNum(got)} (${refund}%)`, 'lose');
      } else {
        Audio.lose();
        toast('VOID — no payout!', 'lose');
      }
      recordStat('wheel', 'lost', 1, true);
      resultEl.textContent = '⬛ VOID — Better luck next spin!';
      resultEl.style.color = '#ef4444';
    } else {
      const effectiveMult = seg.mult * skillMult;
      const won = Math.floor(bet * effectiveMult);
      updateBalance(won);
      recordStat('wheel', 'won', 1, true);
      recordStat('wheel', 'biggestMulti', seg.mult, false, true);
      addXP(Math.ceil(Math.log2(seg.mult + 1) * 8));

      if (seg.mult >= 10) { Particles.fireworks(3); Audio.bigWin(); }
      else Audio.win();
      toast(`${seg.label} → +${fmtNum(won - bet)} profit`, 'win');
      resultEl.textContent = `${seg.label} — +${fmtNum(won - bet)} profit`;
      resultEl.style.color = '#10b981';
    }

    checkAchievements();
  }
}
