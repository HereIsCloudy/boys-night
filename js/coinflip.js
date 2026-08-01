import { getState, updateBalance, addWager, recordStat, addXP, getEquippedBonus, updateStreak } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, makeBetRow, showView } from './ui.js';
import { checkAchievements, triggerAchievement } from './stats.js';
import { getSkillBonus } from './skills.js';

const STREAK_MULTS = [1, 1.5, 2, 3, 5, 8, 12, 20, 35, 50];

function getStreakMult(streak) {
  const idx = Math.min(streak, STREAK_MULTS.length - 1);
  const base = STREAK_MULTS[idx];
  const bonus = getEquippedBonus('coinflip_mult') + getSkillBonus('all_multi');
  return base * (1 + bonus / 100);
}

export function initCoinFlip() {
  const view = document.getElementById('view-coinflip');
  if (!view) return;

  view.innerHTML = `
    <div class="game-header">
      <button class="back-btn" id="cf-back">← Back</button>
      <h2 class="game-title">🪙 COIN FLIP GAUNTLET</h2>
    </div>
    <div class="cf-arena">
      <div class="cf-streak-display" id="cf-streak-disp">
        <div class="cf-streak-num" id="cf-streak-num">0</div>
        <div class="cf-streak-label">WIN STREAK</div>
        <div class="cf-mult-num" id="cf-mult-num">1.00×</div>
        <div class="cf-streak-label">MULTIPLIER</div>
      </div>
      <div class="cf-coin-wrap">
        <div class="cf-coin" id="cf-coin">
          <div class="cf-coin-face cf-heads">H</div>
          <div class="cf-coin-face cf-tails">T</div>
        </div>
      </div>
      <div class="cf-result" id="cf-result">&nbsp;</div>
    </div>
    <div class="cf-controls">
      <div id="cf-bet-row"></div>
      <div class="cf-choice-row">
        <button class="cf-choice-btn" id="cf-heads-btn">HEADS</button>
        <button class="cf-choice-btn" id="cf-tails-btn">TAILS</button>
      </div>
      <button class="cf-allin-btn" id="cf-allin-btn">⚡ ALL-IN</button>
      <div class="cf-streak-tiers" id="cf-streak-tiers"></div>
    </div>`;

  document.getElementById('cf-back').addEventListener('click', () => showView('lobby'));

  const coin       = document.getElementById('cf-coin');
  const streakNum  = document.getElementById('cf-streak-num');
  const multNum    = document.getElementById('cf-mult-num');
  const resultEl   = document.getElementById('cf-result');
  const tiers      = document.getElementById('cf-streak-tiers');
  const headsBtn   = document.getElementById('cf-heads-btn');
  const tailsBtn   = document.getElementById('cf-tails-btn');
  const allInBtn   = document.getElementById('cf-allin-btn');

  const betContainer = document.getElementById('cf-bet-row');
  const { row: betRow, getbet } = makeBetRow(100, null);
  betContainer.appendChild(betRow);

  let flipping = false;

  function renderTiers() {
    const streak = getState().currentWinStreak;
    tiers.innerHTML = STREAK_MULTS.map((m, i) => {
      const active = i === Math.min(streak, STREAK_MULTS.length - 1);
      return `<div class="cf-tier ${active ? 'active' : ''} ${i < streak ? 'past' : ''}">${m}×</div>`;
    }).join('');
  }

  function updateStreakDisplay() {
    const streak = getState().currentWinStreak;
    streakNum.textContent = streak;
    multNum.textContent = getStreakMult(streak).toFixed(2) + '×';
    renderTiers();
  }
  updateStreakDisplay();

  function flip(choice) {
    if (flipping) return;
    const s = getState();
    let bet = getbet();
    if (bet < 1 || bet > s.balance) { toast('Invalid bet', 'lose'); return; }
    flipping = true;
    headsBtn.disabled = true;
    tailsBtn.disabled = true;
    allInBtn.disabled = true;

    updateBalance(-bet);
    addWager(bet, 'coinflip');
    if (bet >= 500) triggerAchievement('big_bet');
    Audio.flip();

    const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = outcome === choice;

    // Animate
    const animClass = outcome === 'heads' ? 'flip-to-heads' : 'flip-to-tails';
    coin.classList.remove('flip-to-heads', 'flip-to-tails');
    void coin.offsetWidth;
    coin.classList.add(animClass);

    setTimeout(() => {
      coin.classList.remove(animClass);
      flipping = false;
      headsBtn.disabled = false;
      tailsBtn.disabled = false;
      allInBtn.disabled = false;

      if (won) {
        const streakBefore = s.currentWinStreak;
        updateStreak(true);
        const mult = getStreakMult(s.currentWinStreak);
        const gross = Math.floor(bet * mult * 2);
        updateBalance(gross);
        recordStat('coinflip', 'wins', 1, true);
        recordStat('coinflip', 'flips', 1, true);
        recordStat('coinflip', 'wagered', bet, true);
        recordStat('coinflip', 'bestStreak', s.currentWinStreak, false, true);
        addXP(Math.ceil(mult * 5));

        resultEl.textContent = `${outcome.toUpperCase()} — WIN! +${fmtNum(gross - bet)}`;
        resultEl.style.color = '#10b981';
        Audio.win();
        if (mult >= 5) { Particles.sparkle(coin.getBoundingClientRect().left + 40, coin.getBoundingClientRect().top, '#f59e0b', 20); }
        if (s.currentWinStreak >= 5)  triggerAchievement('streak_5');
        if (s.currentWinStreak >= 10) triggerAchievement('streak_10');
        if (s.currentWinStreak >= 20) triggerAchievement('streak_20');
        toast(`${outcome.toUpperCase()} — ${mult.toFixed(2)}× streak multiplier!`, 'win');
      } else {
        // Streak insurance check
        const insuranceChance = getEquippedBonus('coinflip_ins') + getSkillBonus('coinflip_ins');
        const insured = Math.random() * 100 < insuranceChance;

        if (!insured) {
          updateStreak(false);
          const refund = getEquippedBonus('return_on_loss') + getSkillBonus('return_on_loss');
          if (refund > 0) {
            const got = Math.round(bet * refund / 100);
            updateBalance(got);
            toast(`${outcome.toUpperCase()} — Lost. Refunded ${fmtNum(got)}`, 'lose');
          } else {
            Audio.lose();
            toast(`${outcome.toUpperCase()} — Lost! Streak broken.`, 'lose');
          }
        } else {
          toast(`${outcome.toUpperCase()} — Lost, but streak PROTECTED!`, 'info');
        }

        recordStat('coinflip', 'losses', 1, true);
        recordStat('coinflip', 'flips', 1, true);
        recordStat('coinflip', 'wagered', bet, true);
        addXP(1);

        resultEl.textContent = `${outcome.toUpperCase()} — LOSS${insured ? ' (protected)' : ''}`;
        resultEl.style.color = insured ? '#f59e0b' : '#ef4444';
      }

      updateStreakDisplay();
      checkAchievements();
    }, 900);
  }

  headsBtn.addEventListener('click', () => { Audio.click(); flip('heads'); });
  tailsBtn.addEventListener('click', () => { Audio.click(); flip('tails'); });
  allInBtn.addEventListener('click', () => {
    const s = getState();
    const input = betRow.querySelector('.bet-input');
    if (input) { input.value = s.balance; }
    Audio.click();
    toast('All-in!', 'jackpot');
    flip(Math.random() < 0.5 ? 'heads' : 'tails');
  });
}
