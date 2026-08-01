import { getState, updateBalance, addWager, recordStat, addXP, getEquippedBonus } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, makeBetRow, showView } from './ui.js';
import { checkAchievements, triggerAchievement } from './stats.js';
import { getSkillBonus } from './skills.js';

const FACE_DOTS = {
  1: [[50,50]],
  2: [[25,25],[75,75]],
  3: [[25,25],[50,50],[75,75]],
  4: [[25,25],[75,25],[25,75],[75,75]],
  5: [[25,25],[75,25],[50,50],[25,75],[75,75]],
  6: [[25,25],[75,25],[25,50],[75,50],[25,75],[75,75]],
};

const BET_TYPES = [
  { key:'exact',   label:'Exact Sum',    desc:'Bet on exact total',  mult: (n,d) => approxExactMult(n,d) },
  { key:'over',    label:'Over 7',       desc:'Sum > 7',             mult: () => 1.8 },
  { key:'under',   label:'Under 7',      desc:'Sum < 7',             mult: () => 1.8 },
  { key:'even',    label:'Even Sum',     desc:'Sum is even',         mult: () => 1.9 },
  { key:'odd',     label:'Odd Sum',      desc:'Sum is odd',          mult: () => 1.9 },
  { key:'doubles', label:'Doubles',      desc:'All dice same face',  mult: (n) => n * 4 },
];

function approxExactMult(n, dice) {
  // Rough payout table: more dice = more combos = lower probability = higher payout
  const base = dice === 2 ? 6 : dice === 3 ? 8 : dice === 4 ? 12 : 16;
  return base;
}

function rollDie() { return Math.floor(Math.random() * 6) + 1; }

function rerollOnes(faces, chance) {
  return faces.map(f => f === 1 && Math.random() * 100 < chance ? rollDie() : f);
}

export function initDice() {
  const view = document.getElementById('view-dice');
  if (!view) return;

  view.innerHTML = `
    <div class="game-header">
      <button class="back-btn" id="dice-back">← Back</button>
      <h2 class="game-title">🎲 DICE DEN</h2>
    </div>
    <div class="dice-arena">
      <div class="dice-tray" id="dice-tray"></div>
      <div class="dice-sum" id="dice-sum">Roll to play</div>
    </div>
    <div class="dice-controls">
      <div class="dice-count-row">
        <span style="font-size:.82rem;color:var(--muted)">Dice:</span>
        <div class="dice-count-btns">
          <button class="dcb active" data-n="2">2</button>
          <button class="dcb" data-n="3">3</button>
          <button class="dcb" data-n="4">4</button>
          <button class="dcb" data-n="6">6</button>
        </div>
      </div>
      <div class="dice-bet-type-row" id="dice-bet-types"></div>
      <div class="dice-exact-row" id="dice-exact-row" style="display:none">
        <label style="font-size:.82rem;color:var(--muted)">Exact sum target:
          <input type="number" id="dice-exact-input" min="2" max="36" value="7" style="width:60px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-size:.85rem;margin-left:6px"/>
        </label>
      </div>
      <div id="dice-bet-row"></div>
      <button class="spin-btn" id="dice-roll-btn">ROLL</button>
    </div>`;

  document.getElementById('dice-back').addEventListener('click', () => showView('lobby'));

  const tray      = document.getElementById('dice-tray');
  const sumEl     = document.getElementById('dice-sum');
  const rollBtn   = document.getElementById('dice-roll-btn');
  const exactRow  = document.getElementById('dice-exact-row');
  const exactInput= document.getElementById('dice-exact-input');
  const betTypes  = document.getElementById('dice-bet-types');

  let numDice    = 2;
  let betTypeKey = 'over';
  let rolling    = false;

  const betContainer = document.getElementById('dice-bet-row');
  const { row: betRow, getbet } = makeBetRow(100, null);
  betContainer.appendChild(betRow);

  // Dice count buttons
  document.querySelectorAll('.dcb').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dcb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      numDice = parseInt(btn.dataset.n);
      renderDice(Array.from({ length: numDice }, () => 1));
      updateExactRange();
    });
  });

  // Bet type buttons
  BET_TYPES.forEach(bt => {
    const btn = document.createElement('button');
    btn.className = 'dbt-btn' + (bt.key === betTypeKey ? ' active' : '');
    btn.dataset.key = bt.key;
    btn.innerHTML = `<div class="dbt-label">${bt.label}</div><div class="dbt-desc">${bt.desc}</div>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dbt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      betTypeKey = bt.key;
      exactRow.style.display = bt.key === 'exact' ? 'block' : 'none';
    });
    betTypes.appendChild(btn);
  });

  function updateExactRange() {
    exactInput.min = numDice;
    exactInput.max = numDice * 6;
    const mid = Math.floor((numDice + numDice * 6) / 2);
    exactInput.value = mid;
  }
  updateExactRange();

  function renderDice(faces, rolling = false) {
    tray.innerHTML = '';
    faces.forEach((face, i) => {
      const die = document.createElement('div');
      die.className = 'die' + (rolling ? ' rolling' : '');
      die.style.animationDelay = `${i * 80}ms`;
      const dots = FACE_DOTS[face] || FACE_DOTS[1];
      dots.forEach(([x, y]) => {
        const dot = document.createElement('div');
        dot.className = 'die-dot';
        dot.style.left = x + '%';
        dot.style.top  = y + '%';
        tray.appendChild(die); // will fix below
        die.appendChild(dot);
      });
      tray.appendChild(die);
    });
  }

  renderDice([1, 1]);

  rollBtn.addEventListener('click', () => {
    if (rolling) return;
    const s = getState();
    const bet = getbet();
    if (bet < 1 || bet > s.balance) { toast('Invalid bet', 'lose'); return; }
    rolling = true;
    rollBtn.disabled = true;

    updateBalance(-bet);
    addWager(bet, 'dice');
    if (bet >= 500) triggerAchievement('big_bet');
    Audio.rollDice();

    // Show rolling animation
    const animFaces = Array.from({ length: numDice }, rollDie);
    renderDice(animFaces, true);

    setTimeout(() => {
      let faces = Array.from({ length: numDice }, rollDie);

      // Reroll ones from items
      const rerollChance = getEquippedBonus('dice_reroll_ones');
      if (rerollChance > 0) faces = rerollOnes(faces, rerollChance);

      rolling = false;
      rollBtn.disabled = false;
      renderDice(faces);

      const sum = faces.reduce((a, b) => a + b, 0);
      sumEl.textContent = `Sum: ${sum}  (${faces.join(' + ')})`;

      resolveResult(faces, sum, bet);
    }, 800);
  });

  function resolveResult(faces, sum, bet) {
    const bt = BET_TYPES.find(t => t.key === betTypeKey);
    const skillMult = 1 + (getSkillBonus('all_multi') + getEquippedBonus('all_multi')) / 100;
    let won = false;
    let multVal = bt.mult(numDice * 6 - numDice + 1, numDice);

    switch (betTypeKey) {
      case 'exact':
        const target = parseInt(exactInput.value);
        won = sum === target;
        multVal = approxExactMult(target, numDice);
        if (won) { recordStat('dice', 'exactHits', 1, true); triggerAchievement('dice_exact'); }
        break;
      case 'over':   won = sum > 7;   break;
      case 'under':  won = sum < 7;   break;
      case 'even':   won = sum % 2 === 0; break;
      case 'odd':    won = sum % 2 !== 0; break;
      case 'doubles':won = faces.every(f => f === faces[0]); multVal = bt.mult(numDice); break;
    }

    recordStat('dice', 'rolls', 1, true);
    recordStat('dice', 'wagered', bet, true);

    if (won) {
      const gross = Math.floor(bet * multVal * skillMult);
      updateBalance(gross);
      recordStat('dice', 'won', 1, true);
      recordStat('dice', 'biggestWin', gross - bet, false, true);
      addXP(Math.ceil(Math.log2(multVal + 1) * 8));

      if (gross >= 1000) { Particles.fireworks(3); Audio.bigWin(); }
      else Audio.win();

      toast(`Win! Sum ${sum} → +${fmtNum(gross - bet)} (${multVal}×)`, 'win');
      sumEl.style.color = '#10b981';
    } else {
      recordStat('dice', 'lost', 1, true);
      addXP(1);
      const refund = getEquippedBonus('return_on_loss') + getSkillBonus('return_on_loss');
      if (refund > 0) {
        const got = Math.round(bet * refund / 100);
        updateBalance(got);
        toast(`No win (sum ${sum}). Refunded ${fmtNum(got)} (${refund}%)`, 'lose');
      } else {
        Audio.lose();
        toast(`No win. Sum was ${sum}.`, 'lose');
      }
      sumEl.style.color = '#ef4444';
    }

    checkAchievements();
  }
}
