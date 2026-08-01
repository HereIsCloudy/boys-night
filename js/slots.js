import { getState, updateBalance, addWager, recordStat, addXP, getEquippedBonus } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, makeBetRow, showJackpot, showView } from './ui.js';
import { checkAchievements, triggerAchievement } from './stats.js';
import { getSkillBonus } from './skills.js';

const SYMBOLS = [
  { sym: '🍒', weight: 60, name: 'cherry',  vals: [0,0,2,3,5]    },
  { sym: '🍋', weight: 55, name: 'lemon',   vals: [0,0,2,3,5]    },
  { sym: '🍊', weight: 50, name: 'orange',  vals: [0,0,3,5,8]    },
  { sym: '🍇', weight: 45, name: 'grape',   vals: [0,0,3,5,10]   },
  { sym: '🔔', weight: 35, name: 'bell',    vals: [0,2,5,10,20]  },
  { sym: '7️⃣',  weight: 25, name: 'seven',   vals: [0,2,8,20,50]  },
  { sym: '💎', weight: 15, name: 'diamond', vals: [0,3,15,40,100] },
  { sym: '🌟', weight: 10, name: 'riley',   vals: [0,5,20,60,150] },
  { sym: '👑', weight:  6, name: 'crown',   vals: [0,8,30,100,250]},
  { sym: '🎰', weight:  3, name: 'jackpot', vals: [0,10,50,200,500]},
  { sym: '⭐', weight:  8, name: 'wild',    vals: [0,0,0,0,0], isWild: true },
  { sym: '✖️',  weight:  5, name: 'multi',   vals: [0,0,0,0,0], isMulti: true },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);

function weightedSym() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const s of SYMBOLS) { r -= s.weight; if (r <= 0) return s; }
  return SYMBOLS[0];
}

const ROWS = 3, REELS = 5;
const REEL_VISIBLE = 3;
const SYMBOL_H = 80;

function buildGrid() {
  return Array.from({ length: REELS }, () => Array.from({ length: ROWS }, weightedSym));
}

// Win lines: row indices
const WIN_LINES = [
  [0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2],
  [0,1,2,1,0], [2,1,0,1,2],
];

function evalLines(grid) {
  const wins = [];
  WIN_LINES.forEach((line, li) => {
    const syms = line.map((row, col) => grid[col][row]);
    const base = syms[0];
    let count = 1;
    // Wilds substitute
    for (let i = 1; i < REELS; i++) {
      if (syms[i].isWild || syms[i].name === base.name || (base.isWild && !syms[i].isMulti)) count++;
      else break;
    }
    // Non-wild base must have >=3 same or wild
    const canonical = syms.find(s => !s.isWild && !s.isMulti);
    if (!canonical) return;
    if (count < 2) return;
    const mult = syms.filter(s => s.isMulti).length;
    const val = canonical.vals[count - 1];
    if (val > 0) wins.push({ line: li, count, symbol: canonical, val, mult });
  });
  return wins;
}

export function initSlots() {
  const view = document.getElementById('view-slots');
  if (!view) return;

  view.innerHTML = `
    <div class="game-header">
      <button class="back-btn" id="slots-back">← Back</button>
      <h2 class="game-title">🎰 SLOTS</h2>
    </div>
    <div class="slots-machine" id="slots-machine">
      <div class="slots-reels" id="slots-reels"></div>
      <div class="slots-win-lines" id="slots-win-lines"></div>
    </div>
    <div class="slots-controls">
      <div id="slots-bet-row"></div>
      <button class="spin-btn" id="slots-spin-btn">SPIN</button>
      <div class="slots-payline-info" id="slots-pay-info"></div>
    </div>
    <div class="slots-history" id="slots-history">
      <div class="sh-title">Last Wins</div>
      <div id="sh-entries"></div>
    </div>`;

  document.getElementById('slots-back').addEventListener('click', () => showView('lobby'));

  const reelsEl = document.getElementById('slots-reels');
  const reelEls = [];
  const symbolEls = [];

  for (let r = 0; r < REELS; r++) {
    const reel = document.createElement('div');
    reel.className = 'slot-reel';
    // Create extended symbol list for scroll animation
    const track = document.createElement('div');
    track.className = 'slot-track';
    track.id = `reel-track-${r}`;
    reel.appendChild(track);
    reelsEl.appendChild(reel);
    reelEls.push(reel);
    symbolEls.push(track);
  }

  // Bet row
  const betContainer = document.getElementById('slots-bet-row');
  const { row: betRow, getbet } = makeBetRow(50, null);
  betContainer.appendChild(betRow);

  let spinning = false;
  let grid = buildGrid();
  renderGrid(grid, symbolEls);

  function renderGrid(g, tracks) {
    tracks.forEach((track, r) => {
      track.innerHTML = '';
      for (let row = 0; row < ROWS; row++) {
        const cell = document.createElement('div');
        cell.className = 'slot-symbol';
        cell.textContent = g[r][row].sym;
        track.appendChild(cell);
      }
    });
  }

  const spinBtn = document.getElementById('slots-spin-btn');
  spinBtn.addEventListener('click', () => {
    if (spinning) return;
    const bet = getbet();
    const s = getState();
    if (bet < 1 || bet > s.balance) { toast('Invalid bet', 'lose'); return; }
    spinning = true;
    spinBtn.disabled = true;
    Audio.spin();

    updateBalance(-bet);
    addWager(bet, 'slots');
    if (bet >= 500) triggerAchievement('big_bet');

    const newGrid = buildGrid();
    let stopped = 0;

    reelEls.forEach((reel, r) => {
      const track = symbolEls[r];
      // Build a tall list of random symbols for scroll illusion
      const extended = [];
      for (let i = 0; i < 30; i++) extended.push(weightedSym());
      // Append actual result at the end
      extended.push(...newGrid[r]);

      track.innerHTML = '';
      extended.forEach(sym => {
        const cell = document.createElement('div');
        cell.className = 'slot-symbol';
        cell.textContent = sym.sym;
        track.appendChild(cell);
      });

      const totalSyms = extended.length;
      const targetOffset = -(totalSyms - ROWS) * SYMBOL_H;
      const delay = r * 180;
      const dur = 700 + r * 280;

      setTimeout(() => {
        track.style.transition = `transform ${dur}ms cubic-bezier(.17,.67,.34,1.1)`;
        track.style.transform = `translateY(${targetOffset}px)`;

        setTimeout(() => {
          Audio.reelStop();
          track.style.transition = 'none';
          // Set final 3 symbols only
          track.innerHTML = '';
          for (let row = 0; row < ROWS; row++) {
            const cell = document.createElement('div');
            cell.className = 'slot-symbol';
            cell.textContent = newGrid[r][row].sym;
            track.appendChild(cell);
          }
          track.style.transform = 'translateY(0)';

          stopped++;
          if (stopped === REELS) {
            grid = newGrid;
            spinning = false;
            spinBtn.disabled = false;
            evalResult(grid, bet);
          }
        }, dur + 50);
      }, delay);
    });
  });

  function evalResult(grid, bet) {
    const wins = evalLines(grid);
    const skillMult = 1 + (getSkillBonus('all_multi') + getEquippedBonus('all_multi') + getEquippedBonus('slot_win_mult')) / 100;
    const jackpotChance = getEquippedBonus('jackpot_rate') + getSkillBonus('jackpot_rate') + getEquippedBonus('slot_jackpot_rate');

    let totalMult = 0;
    let isJackpot = false;

    wins.forEach(w => {
      let m = w.val;
      if (w.mult > 0) m *= Math.pow(2, w.mult);
      m = Math.round(m * skillMult);
      totalMult += m;
      if (w.symbol.name === 'jackpot' && w.count === REELS) isJackpot = true;
    });

    // Jackpot chance from items
    if (!isJackpot && Math.random() * 100 < jackpotChance) isJackpot = true;

    const shEntries = document.getElementById('sh-entries');

    if (isJackpot) {
      const jackpotAmt = bet * 500;
      updateBalance(jackpotAmt);
      recordStat('slots', 'jackpots', 1, true);
      recordStat('slots', 'biggestWin', jackpotAmt, false, true);
      addXP(100);
      showJackpot(jackpotAmt);
      addHistory(shEntries, `🎰 JACKPOT! +${fmtNum(jackpotAmt)}`, 'jackpot');
      triggerAchievement('jackpot_1');
    } else if (totalMult > 0) {
      const won = bet * totalMult;
      updateBalance(won);
      recordStat('slots', 'won', 1, true);
      recordStat('slots', 'biggestWin', won, false, true);
      addXP(Math.ceil(Math.log2(totalMult + 1) * 5));
      if (won >= 1000) { Audio.bigWin(); Particles.fireworks(4); toast(`WIN! +${fmtNum(won)} (${totalMult}×)`, 'win'); }
      else { Audio.win(); toast(`Win! +${fmtNum(won)}`, 'win'); }
      addHistory(shEntries, `+${fmtNum(won)} (${totalMult}×)`, 'win');
    } else {
      recordStat('slots', 'lost', 1, true);
      addXP(1);
      const refund = getEquippedBonus('return_on_loss') + getSkillBonus('return_on_loss');
      if (refund > 0) {
        const got = Math.round(bet * refund / 100);
        updateBalance(got);
        toast(`Spin: No win. Refunded ${fmtNum(got)} (${refund}%)`, 'lose');
      } else {
        Audio.lose();
      }
      addHistory(shEntries, `No win`, 'lose');
    }

    recordStat('slots', 'spins', 1, true);
    recordStat('slots', 'wagered', bet, true);
    checkAchievements();
  }

  function addHistory(el, text, type) {
    const d = document.createElement('div');
    d.className = `sh-entry ${type}`;
    d.textContent = text;
    el.insertBefore(d, el.firstChild);
    while (el.children.length > 12) el.removeChild(el.lastChild);
  }
}
