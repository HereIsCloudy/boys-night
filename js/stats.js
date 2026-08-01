import { getState, earnAchievement } from './state.js';
import { toast } from './ui.js';
import { Events } from './events.js';

const ACHIEVEMENTS = [
  { id: 'first_spin',   icon: '🎰', name: 'First Spin',        desc: 'Spin the slots for the first time',  check: s => s.stats.slots.spins >= 1 },
  { id: 'spin_100',     icon: '🔄', name: 'Slot Addict',       desc: 'Spin slots 100 times',               check: s => s.stats.slots.spins >= 100 },
  { id: 'jackpot_1',    icon: '💰', name: 'Jackpot!',           desc: 'Hit a slots jackpot',               check: s => s.stats.slots.jackpots >= 1 },
  { id: 'jackpot_10',   icon: '👑', name: 'Jackpot Hunter',    desc: 'Hit 10 jackpots total',              check: s => s.stats.slots.jackpots >= 10 },
  { id: 'crash_moon',   icon: '🌙', name: 'To the Moon',       desc: 'Cash out at 10× or higher on Crash', check: s => s.stats.crash.biggestMulti >= 10 },
  { id: 'crash_100',    icon: '🚀', name: 'Rocket Fuel',       desc: 'Cash out at 100× on Crash',          check: s => s.stats.crash.biggestMulti >= 100 },
  { id: 'streak_5',     icon: '🔥', name: 'On Fire',           desc: 'Win 5 flips in a row',               check: s => s.bestWinStreak >= 5 },
  { id: 'streak_10',    icon: '⚡', name: 'Lightning Streak',  desc: 'Win 10 flips in a row',              check: s => s.bestWinStreak >= 10 },
  { id: 'streak_20',    icon: '🌪️', name: 'Unstoppable',       desc: 'Win 20 flips in a row',              check: s => s.bestWinStreak >= 20 },
  { id: 'wheel_jack',   icon: '🌀', name: 'Wheel of Fortune',  desc: 'Hit JACKPOT on the Chaos Wheel',     check: s => s.stats.wheel.jackpots >= 1 },
  { id: 'dice_exact',   icon: '🎲', name: 'Exact Science',     desc: 'Win an exact sum bet on dice',       check: s => s.stats.dice.exactHits >= 1 },
  { id: 'dice_50',      icon: '🎯', name: 'Dice Master',       desc: '50 dice rolls',                      check: s => s.stats.dice.rolls >= 50 },
  { id: 'wagered_10k',  icon: '💸', name: 'Whale',             desc: 'Wager 10,000 coins total',           check: s => s.totalWagered >= 10000 },
  { id: 'wagered_100k', icon: '🐋', name: 'Mega Whale',        desc: 'Wager 100,000 coins total',          check: s => s.totalWagered >= 100000 },
  { id: 'win_1k',       icon: '🏆', name: 'Big Winner',        desc: 'Win 1,000 coins in a single game',   check: s => s.biggestWin >= 1000 },
  { id: 'win_10k',      icon: '💎', name: 'Diamond Hands',     desc: 'Win 10,000 coins in a single game',  check: s => s.biggestWin >= 10000 },
  { id: 'level_5',      icon: '⭐', name: 'Rising Star',       desc: 'Reach level 5',                      check: s => s.level >= 5 },
  { id: 'level_10',     icon: '🌟', name: 'Veteran',           desc: 'Reach level 10',                     check: s => s.level >= 10 },
  { id: 'item_rare',    icon: '🔷', name: 'Rare Find',         desc: 'Pull a Rare item',                   check: s => checkRarityPulled(s, 'rare') },
  { id: 'item_epic',    icon: '🟣', name: 'Epic Loot',         desc: 'Pull an Epic item',                  check: s => checkRarityPulled(s, 'epic') },
  { id: 'item_legend',  icon: '🟡', name: 'Legendary',         desc: 'Pull a Legendary item',              check: s => checkRarityPulled(s, 'legendary') },
  { id: 'item_divine',  icon: '🟠', name: 'Divine Grace',      desc: 'Pull a Divine item',                 check: s => checkRarityPulled(s, 'divine') },
  { id: 'item_chaos',   icon: '🌈', name: 'Chaos Divine',      desc: 'Pull a Chaos Divine item',           check: s => checkRarityPulled(s, 'chaosDivine') },
  { id: 'equipped_all', icon: '🧙', name: 'Fully Equipped',    desc: 'Fill all 7 equipment slots',         check: s => Object.values(s.equipped).every(Boolean) },
  { id: 'skill_10',     icon: '🌿', name: 'Skilled',           desc: 'Unlock 10 skill levels total',       check: s => Object.values(s.skills).filter(v => typeof v === 'number').reduce((a,b) => a+b, 0) >= 10 },
  { id: 'pulls_50',     icon: '📦', name: 'Collector',         desc: '50 total shop pulls',                check: s => s.pullsTotal >= 50 },
  { id: 'net_plus',     icon: '📈', name: 'Profitable',        desc: 'Finish a session with +1000 profit', check: s => s.sessionProfit >= 1000 },
  { id: 'crash_early',  icon: '😬', name: 'Safety First',      desc: 'Cash out at exactly 1.01× on Crash', check: () => false /* triggered in game */ },
  { id: 'all_games',    icon: '🎮', name: 'All-Rounder',       desc: 'Play every casino game at least once', check: s => Object.values(s.stats).every(g => (g.spins || g.plays || g.flips || g.rolls) > 0) },
  { id: 'big_bet',      icon: '😤', name: 'All-In',            desc: 'Bet 500+ coins in a single game',    check: () => false /* triggered in game */ },
];

function checkRarityPulled(s, rarity) {
  const ORDER = ['common','uncommon','rare','epic','legendary','divine','chaosDivine'];
  const inv = [...s.inventory, ...Object.values(s.equipped).filter(Boolean)];
  return inv.some(i => ORDER.indexOf(i.rarity) >= ORDER.indexOf(rarity));
}

export function checkAchievements() {
  const s = getState();
  ACHIEVEMENTS.forEach(a => {
    if (!s.achievements.includes(a.id) && a.check(s)) {
      if (earnAchievement(a.id)) {
        toast(`Achievement unlocked: ${a.name} ${a.icon}`, 'jackpot');
      }
    }
  });
}

export function triggerAchievement(id) {
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return;
  if (earnAchievement(id)) {
    toast(`Achievement unlocked: ${ach.name} ${ach.icon}`, 'jackpot');
  }
}

export function renderStats() {
  const root = document.getElementById('stats-root');
  if (!root) return;
  const s = getState();

  const sec = (label, rows) => `
    <div class="stat-card">
      <div class="stat-card-title">${label}</div>
      ${rows.map(([k,v,c]) => `
        <div class="stat-row">
          <span class="stat-row-key">${k}</span>
          <span class="stat-row-val" style="${c ? `color:${c}` : ''}">${v}</span>
        </div>`).join('')}
    </div>`;

  const fmt = n => {
    const a = Math.abs(n);
    return (n<0?'-':'') + (a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(2)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':Math.round(a));
  };

  root.innerHTML = `
    <div class="stats-grid">
      ${sec('🌍 All-Time', [
        ['Total Wagered',     fmt(s.totalWagered),      '#f59e0b'],
        ['Total Won',         fmt(s.totalWon),           '#10b981'],
        ['Total Lost',        fmt(s.totalLost),          '#ef4444'],
        ['Net Profit',        fmt(s.totalWon-s.totalLost), s.totalWon>=s.totalLost?'#10b981':'#ef4444'],
        ['Biggest Single Win',fmt(s.biggestWin),         '#a855f7'],
        ['Jackpots Hit',      s.jackpotsHit,             '#f59e0b'],
      ])}
      ${sec('🎰 Slots', [
        ['Total Spins',   s.stats.slots.spins,           '#06b6d4'],
        ['Wins',          s.stats.slots.won,             '#10b981'],
        ['Losses',        s.stats.slots.lost,            '#ef4444'],
        ['Jackpots',      s.stats.slots.jackpots,        '#f59e0b'],
        ['Biggest Win',   fmt(s.stats.slots.biggestWin), '#a855f7'],
        ['Wagered',       fmt(s.stats.slots.wagered),    '#9ca3af'],
      ])}
      ${sec('📈 Crash', [
        ['Games Played',    s.stats.crash.plays,             '#06b6d4'],
        ['Wins',            s.stats.crash.won,               '#10b981'],
        ['Losses',          s.stats.crash.lost,              '#ef4444'],
        ['Best Multiplier', s.stats.crash.biggestMulti + '×','#f59e0b'],
        ['Highest Cashout', fmt(s.stats.crash.highestCashout),'#a855f7'],
        ['Wagered',         fmt(s.stats.crash.wagered),      '#9ca3af'],
      ])}
      ${sec('🪙 Coin Flip', [
        ['Total Flips',  s.stats.coinflip.flips,       '#06b6d4'],
        ['Wins',         s.stats.coinflip.wins,        '#10b981'],
        ['Losses',       s.stats.coinflip.losses,      '#ef4444'],
        ['Best Streak',  s.stats.coinflip.bestStreak,  '#ec4899'],
        ['Current',      s.currentWinStreak + ' 🔥',   '#ec4899'],
        ['Wagered',      fmt(s.stats.coinflip.wagered),'#9ca3af'],
      ])}
      ${sec('🌀 Wheel', [
        ['Spins',            s.stats.wheel.spins,           '#06b6d4'],
        ['Wins',             s.stats.wheel.won,             '#10b981'],
        ['Jackpots',         s.stats.wheel.jackpots,        '#f59e0b'],
        ['Biggest Multi',    s.stats.wheel.biggestMulti+'×','#a855f7'],
        ['Wagered',          fmt(s.stats.wheel.wagered),    '#9ca3af'],
      ])}
      ${sec('🎲 Dice', [
        ['Rolls',        s.stats.dice.rolls,           '#06b6d4'],
        ['Wins',         s.stats.dice.won,             '#10b981'],
        ['Losses',       s.stats.dice.lost,            '#ef4444'],
        ['Exact Hits',   s.stats.dice.exactHits,       '#f59e0b'],
        ['Biggest Win',  fmt(s.stats.dice.biggestWin), '#a855f7'],
        ['Wagered',      fmt(s.stats.dice.wagered),    '#9ca3af'],
      ])}
      ${sec('🧙 Character', [
        ['Level',        s.level,                       '#06b6d4'],
        ['XP',           `${s.xp}/${s.level*120}`,      '#a855f7'],
        ['Skill Points', s.skillPoints,                  '#22c55e'],
        ['Best Streak',  s.bestWinStreak,                '#ec4899'],
        ['Items Owned',  s.inventory.length + Object.values(s.equipped).filter(Boolean).length,'#f59e0b'],
        ['Total Pulls',  s.pullsTotal,                   '#9ca3af'],
      ])}
    </div>
    <h3 style="font-family:var(--font-hd);font-size:.9rem;color:var(--muted);margin:20px 0 12px">Achievements (${s.achievements.length}/${ACHIEVEMENTS.length})</h3>
    <div class="achievements-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="ach-card ${s.achievements.includes(a.id) ? 'earned' : 'locked'}">
          <span class="ach-icon">${a.icon}</span>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>`).join('')}
    </div>`;
}
