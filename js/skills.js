import { getState, spendSkillPoint, getSkillLevel, saveState } from './state.js';
import { Audio } from './audio.js';
import { toast } from './ui.js';
import { refresh as hudRefresh } from './hud.js';

const TREE = {
  fortune: {
    name: 'Fortune', icon: '🍀', color: '#22c55e',
    nodes: [
      { id: 'f1', name: 'Lucky Touch',     desc: '+1.5% jackpot rate per level', max: 5, cost: 1, row: 0 },
      { id: 'f2', name: 'Pity Ace',        desc: 'Pity fills 15% faster per level', max: 3, cost: 1, req: ['f1'], row: 1 },
      { id: 'f3', name: 'Silver Lining',   desc: '5% of each loss refunded per level', max: 3, cost: 1, req: ['f1'], row: 1 },
      { id: 'f4', name: 'Hot Streak',      desc: 'Win streak multipliers kick in 1 step sooner', max: 1, cost: 2, req: ['f2'], row: 2 },
      { id: 'f5', name: 'Fortune\'s Smile',desc: '+3% to all win multipliers per level', max: 4, cost: 2, req: ['f3'], row: 2 },
      { id: 'f6', name: 'Beginner\'s Luck',desc: 'Each session bonus: +50 coins/level on start', max: 5, cost: 2, req: ['f4','f5'], row: 3 },
    ],
  },
  highroller: {
    name: 'High Roller', icon: '💰', color: '#f59e0b',
    nodes: [
      { id: 'h1', name: 'Big Bets',         desc: 'Unlock higher bet limits on all games', max: 1, cost: 1, row: 0 },
      { id: 'h2', name: 'Multiplier Master',desc: '+5% to all multipliers per level', max: 4, cost: 1, req: ['h1'], row: 1 },
      { id: 'h3', name: 'VIP Access',        desc: 'VIP slots mode with higher min payouts', max: 1, cost: 3, req: ['h1'], row: 1 },
      { id: 'h4', name: 'Whale Mode',        desc: 'Max bet doubled on all games', max: 1, cost: 3, req: ['h2','h3'], row: 2 },
      { id: 'h5', name: 'Money Talks',       desc: 'Every 5k wagered grants 1 free Standard pull', max: 3, cost: 2, req: ['h2'], row: 2 },
      { id: 'h6', name: 'High Roller Crown', desc: '+10% to ALL payouts globally', max: 1, cost: 5, req: ['h4','h5'], row: 3 },
    ],
  },
  chaos: {
    name: 'Chaos', icon: '🎲', color: '#ec4899',
    nodes: [
      { id: 'c1', name: 'Wild Card',      desc: '3% chance per game to double reward', max: 3, cost: 1, row: 0 },
      { id: 'c2', name: 'Devil\'s Bargain',desc: 'Cursed items enabled: huge bonus + random penalty', max: 1, cost: 2, req: ['c1'], row: 1 },
      { id: 'c3', name: 'Entropy Rising', desc: 'Each loss adds +4% to next win (stacks up to 10×)', max: 5, cost: 1, req: ['c1'], row: 1 },
      { id: 'c4', name: 'Chaos Touch',    desc: 'RNG variance 20% more extreme', max: 1, cost: 3, req: ['c2'], rngUnlock: 33, row: 2 },
      { id: 'c5', name: 'Gambler\'s High',desc: '+15% boost for 5 plays after any jackpot', max: 3, cost: 2, req: ['c3'], row: 2 },
      { id: 'c6', name: 'Chaos Divine',   desc: '+0.1% Chaos Divine pull chance per level', max: 3, cost: 5, req: ['c4','c5'], rngUnlock: 25, row: 3 },
    ],
  },
};

export function getSkillBonus(key) {
  // Returns a numeric bonus for composite skill keys
  const map = {
    jackpot_rate:   () => getSkillLevel('f1') * 1.5,
    pity_speed:     () => getSkillLevel('f2') * 15,
    return_on_loss: () => getSkillLevel('f3') * 5,
    all_multi:      () => getSkillLevel('f5') * 3 + getSkillLevel('h2') * 5 + (getSkillLevel('h6') ? 10 : 0),
    wild_card:      () => getSkillLevel('c1') * 3,
    entropy:        () => getSkillLevel('c3') * 4,
    gambler_high:   () => getSkillLevel('c5') * 15,
    chaos_divine:   () => getSkillLevel('c6') * 0.1,
  };
  return map[key] ? map[key]() : 0;
}

export function renderSkillTree() {
  const root = document.getElementById('skills-root');
  if (!root) return;
  const s = getState();

  root.innerHTML = `<div class="skills-branches" id="skills-branches"></div>`;
  const container = root.querySelector('#skills-branches');

  Object.entries(TREE).forEach(([branchKey, branch]) => {
    const col = document.createElement('div');
    col.className = 'skill-branch';
    col.innerHTML = `
      <div class="sb-header">
        <span class="sb-icon">${branch.icon}</span>
        <span class="sb-name" style="color:${branch.color}">${branch.name}</span>
      </div>
      <div class="skill-nodes" id="branch-${branchKey}"></div>`;
    container.appendChild(col);

    const nodesEl = col.querySelector(`#branch-${branchKey}`);
    branch.nodes.forEach(node => {
      const level = getSkillLevel(node.id);
      const maxed = level >= node.max;
      const prereqMet = !node.req || node.req.every(r => getSkillLevel(r) > 0);
      const canAfford = s.skillPoints >= node.cost;
      const rngPassed = !node.rngUnlock || (s.skills[`${node.id}_rng`]);
      const locked = !prereqMet;

      const div = document.createElement('div');
      div.className = 'skill-node' + (maxed ? ' maxed' : level > 0 ? ' unlocked' : '') + (locked ? ' locked-node' : '');

      let costLine = '';
      if (!maxed) {
        if (node.rngUnlock && !rngPassed) {
          costLine = `<div class="sn-rng-badge">? Unlocks randomly</div>`;
        } else if (!locked) {
          costLine = `<div class="sn-cost">Cost: ${node.cost} SP${canAfford ? '' : ' — need more SP'}</div>`;
        } else {
          costLine = `<div class="sn-cost" style="color:var(--red)">Requires: ${(node.req||[]).join(', ')}</div>`;
        }
      }

      div.innerHTML = `
        <div class="sn-header">
          <span class="sn-name">${node.name}</span>
          <span class="sn-level">${maxed ? '✓ MAX' : `${level}/${node.max}`}</span>
        </div>
        <div class="sn-desc">${node.desc}</div>
        ${costLine}`;

      if (!locked && !maxed && canAfford) {
        // Handle RNG unlock
        if (node.rngUnlock && !rngPassed) {
          div.addEventListener('click', () => {
            if (Math.random() * 100 < node.rngUnlock) {
              s.skills[`${node.id}_rng`] = true;
              saveState();
              toast(`${node.name} unlocked!`, 'win');
              renderSkillTree();
            } else {
              toast(`Not this time... (${node.rngUnlock}% chance)`, 'lose');
            }
          });
        } else if (!node.rngUnlock || rngPassed) {
          div.style.cursor = 'pointer';
          div.addEventListener('click', () => {
            Audio.click();
            if (spendSkillPoint(node.id)) {
              toast(`${node.name} upgraded!`, 'win');
              hudRefresh();
              renderSkillTree();
            } else {
              toast('Not enough skill points', 'lose');
            }
          });
        }
      }

      nodesEl.appendChild(div);
    });
  });
}
