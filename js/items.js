import { getState, addToInventory, equipItem, unequipSlot, removeFromInventory, saveState } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum, showItemDrop, openModal } from './ui.js';

// ── Data ──────────────────────────────────────────────────────────────────────

const RARITIES = [
  { key: 'common',      label: 'COMMON',       weight: 450, color: '#9ca3af' },
  { key: 'uncommon',    label: 'UNCOMMON',      weight: 250, color: '#22c55e' },
  { key: 'rare',        label: 'RARE',          weight: 150, color: '#3b82f6' },
  { key: 'epic',        label: 'EPIC',          weight:  80, color: '#a855f7' },
  { key: 'legendary',   label: 'LEGENDARY',     weight:  40, color: '#f59e0b' },
  { key: 'divine',      label: 'DIVINE',        weight:  20, color: '#fb923c' },
  { key: 'chaosDivine', label: 'CHAOS DIVINE',  weight:   0.5, color: '#ff00ff' },
];
const RARITY_ORDER = RARITIES.map(r => r.key);

// Stat affix pool — {key, label template, min, max per rarity tier}
// {v} is replaced with the rolled value
const AFFIXES = [
  { key: 'slot_win_mult',     label: '+{v}% to slot win multipliers',       min: [3,5,8,12,20,30,50],  decimal: false },
  { key: 'slot_jackpot_rate', label: '+{v}% jackpot chance on slots',        min: [.1,.2,.4,.8,1.5,2.5,5], decimal: true },
  { key: 'crash_floor',       label: 'Crash never lands below {v}×',         min: [1.1,1.2,1.4,1.6,2.0,2.5,3.0], decimal: true },
  { key: 'crash_multi',       label: '+{v}% crash multiplier on cashout',    min: [5,8,12,18,28,40,60], decimal: false },
  { key: 'coinflip_ins',      label: '{v}% chance streak survives a loss',   min: [5,10,15,22,32,45,60], decimal: false },
  { key: 'coinflip_mult',     label: '+{v}% to all streak multipliers',      min: [5,10,18,28,45,65,100], decimal: false },
  { key: 'wheel_void_remove', label: 'Remove {v} VOID segment(s) per spin',  min: [1,1,1,2,2,3,4],     decimal: false },
  { key: 'wheel_jackpot',     label: '+{v} JACKPOT segment(s) on wheel',     min: [1,1,1,1,2,2,3],     decimal: false },
  { key: 'dice_reroll_ones',  label: '{v}% chance to reroll any 1 on dice',  min: [10,15,22,32,45,60,80], decimal: false },
  { key: 'jackpot_rate',      label: '+{v}% jackpot rate across all games',  min: [.1,.2,.4,.8,1.5,2.5,5], decimal: true },
  { key: 'return_on_loss',    label: 'Recover {v}% of every loss',           min: [2,3,5,8,12,18,25], decimal: false },
  { key: 'all_multi',         label: '+{v}% to ALL win multipliers',         min: [2,4,7,12,20,30,50], decimal: false },
  { key: 'pity_speed',        label: 'Pity fills {v}% faster on pulls',      min: [5,10,18,28,45,65,100], decimal: false },
  { key: 'xp_gain',           label: '+{v}% XP from all activities',         min: [10,15,22,32,50,75,120], decimal: false },
  { key: 'pull_discount',     label: '-{v}% on all Shop pull costs',         min: [3,5,8,12,18,25,35], decimal: false },
  { key: 'bet_bonus',         label: 'Each bet gets +{v} free coins added',  min: [5,10,20,40,80,150,300], decimal: false },
  { key: 'streak_shield',     label: 'Win streak protected once per session',min: [1,1,1,1,1,1,1],    decimal: false },
  { key: 'chaos_wild',        label: '{v}% chance each game rewards extra',  min: [1,2,3,5,8,12,20], decimal: false },
];

const SLOTS_BY_SLOT = {
  hat:    ['🎩','👑','🎓','🪖','🎪'],
  outfit: ['👘','🥻','🦺','🥋','🎭'],
  gloves: ['🧤','🥊','✨','⚡','🌟'],
  shoes:  ['👟','👠','🥿','🪄','🌈'],
  charm:  ['🍀','🌸','⭐','🔮','💫','🎲'],
  ring1:  ['💍','💎','🪩','🌀','🔮'],
  ring2:  ['💍','💎','🪩','⚡','🔮'],
};
const NAME_PRE = ['Golden','Lucky','Cursed','Divine','Ancient','Chaos','Riley\'s','Forbidden','Eternal','Blazing','Shadow','Mystic','Crystal','Phantom','Ultra'];
const NAME_SUF = {
  hat: ['Crown','Cap','Helm','Tiara','Hood'],
  outfit: ['Robe','Coat','Suit','Cloak','Garb'],
  gloves: ['Gauntlets','Mitts','Wraps','Touch'],
  shoes: ['Boots','Slippers','Treads','Steps'],
  charm: ['Charm','Talisman','Amulet','Token','Relic'],
  ring1: ['Ring','Band','Signet','Circle'],
  ring2: ['Ring','Band','Signet','Circle'],
};

let _uid = 1;
function uid() { return `item_${Date.now()}_${_uid++}`; }

function roll(arr, idx) { const v = arr[idx] ?? arr[arr.length - 1]; return v; }

export function generateItem(forcedRarity) {
  const rarity = forcedRarity ?? rollRarity();
  const ridx = RARITY_ORDER.indexOf(rarity);
  const slot = Object.keys(SLOTS_BY_SLOT)[Math.floor(Math.random() * Object.keys(SLOTS_BY_SLOT).length)];
  const icon = SLOTS_BY_SLOT[slot][Math.floor(Math.random() * SLOTS_BY_SLOT[slot].length)];
  const name = NAME_PRE[Math.floor(Math.random() * NAME_PRE.length)] + ' ' +
               NAME_SUF[slot][Math.floor(Math.random() * NAME_SUF[slot].length)];
  const numStats = Math.min(AFFIXES.length, 2 + ridx);
  const pool = [...AFFIXES].sort(() => Math.random() - 0.5).slice(0, numStats);
  const stats = pool.map(a => {
    const base = roll(a.min, ridx);
    const variance = base * 0.25;
    const raw = base + (Math.random() - 0.5) * 2 * variance;
    const value = a.decimal ? Math.round(raw * 10) / 10 : Math.round(raw);
    const label = a.label.replace('{v}', value);
    return { key: a.key, value, label };
  });
  return { id: uid(), rarity, slot, icon, name, stats, rerolls: 0 };
}

function rollRarity(boost = 0) {
  const pool = RARITIES.map(r => ({ ...r, weight: r.weight + (r.key === 'chaosDivine' ? boost : 0) }));
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let r = Math.random() * total;
  for (const rarity of pool) { r -= rarity.weight; if (r <= 0) return rarity.key; }
  return 'common';
}

// Pull system
const PULL_TIERS = [
  { key: 'standard', name: 'Standard Pull',  icon: '📦', cost: 500,  rarityBoost: 0,   guaranteedMin: null,    desc: 'Common–Epic possible' },
  { key: 'premium',  name: 'Premium Pull',   icon: '💜', cost: 2000, rarityBoost: 100, guaranteedMin: 'rare',  desc: 'Rare+ guaranteed' },
  { key: 'ultra',    name: 'Ultra Pull',      icon: '🌟', cost: 8000, rarityBoost: 400, guaranteedMin: 'epic',  desc: 'Epic+ guaranteed, high Legendary rate' },
];

export function doPull(tierKey, onDone) {
  const s = getState();
  const tier = PULL_TIERS.find(t => t.key === tierKey);
  if (!tier) return;
  const cost = Math.round(tier.cost * (1 - (getEquippedBonus('pull_discount') / 100)));
  if (s.balance < cost) { toast('Not enough coins!', 'lose'); return; }

  s.balance -= cost;
  s.totalWagered += cost;
  s.pityCounter++;
  saveState();

  // Determine rarity
  let rarity;
  if (s.pityCounter >= 90) { rarity = 'legendary'; s.pityCounter = 0; }
  else {
    rarity = rollRarity(tier.rarityBoost);
    if (tier.guaranteedMin) {
      const minIdx = RARITY_ORDER.indexOf(tier.guaranteedMin);
      if (RARITY_ORDER.indexOf(rarity) < minIdx) rarity = tier.guaranteedMin;
    }
  }

  const item = generateItem(rarity);
  addToInventory(item);
  s.pullsTotal++;
  saveState();

  showItemDrop(item, () => { if (onDone) onDone(); });
}

function getEquippedBonus(key) {
  const s = getState();
  let t = 0;
  Object.values(s.equipped).forEach(item => { if (item) item.stats.forEach(st => { if (st.key === key) t += st.value; }); });
  return t;
}

// ── Shop UI ───────────────────────────────────────────────────────────────────

export function renderShop() {
  const root = document.getElementById('shop-root');
  if (!root) return;
  const s = getState();
  const pity = Math.min(100, Math.round((s.pityCounter / 90) * 100));

  root.innerHTML = `
    <div class="pity-row" style="margin-bottom:16px">
      <span class="pity-label">Pity: ${s.pityCounter}/90</span>
      <div class="pity-bar-wrap"><div class="pity-bar-fill" style="width:${pity}%"></div></div>
      <span class="pity-label">${pity}%</span>
    </div>
    <div class="shop-pulls" id="shop-pulls"></div>
    <p style="font-size:.75rem;color:var(--muted);text-align:center;margin-top:8px">At 90 pulls without Legendary, the next pull guarantees Legendary.</p>`;

  const pullsEl = root.querySelector('#shop-pulls');
  PULL_TIERS.forEach(tier => {
    const cost = Math.round(tier.cost * (1 - (getEquippedBonus('pull_discount') / 100)));
    const canAfford = s.balance >= cost;
    const card = document.createElement('div');
    card.className = `pull-card ${tier.key}`;
    card.style.opacity = canAfford ? '1' : '.5';
    card.innerHTML = `
      <div class="pull-icon">${tier.icon}</div>
      <div class="pull-name">${tier.name}</div>
      <div class="pull-cost">🪙 ${fmtNum(cost)}</div>
      <div class="pull-rates">${tier.desc}</div>`;
    card.addEventListener('click', () => {
      if (!canAfford) { toast('Not enough coins!', 'lose'); return; }
      Audio.click();
      doPull(tier.key, () => { renderShop(); });
    });
    pullsEl.appendChild(card);
  });
}

// ── Inventory UI ──────────────────────────────────────────────────────────────

export function renderInventory() {
  const root = document.getElementById('inventory-root');
  if (!root) return;
  const s = getState();

  const SLOT_INFO = {
    hat:    { emoji: '🎩', label: 'Hat' },
    outfit: { emoji: '👘', label: 'Outfit' },
    gloves: { emoji: '🧤', label: 'Gloves' },
    shoes:  { emoji: '👟', label: 'Shoes' },
    charm:  { emoji: '🍀', label: 'Charm' },
    ring1:  { emoji: '💍', label: 'Ring 1' },
    ring2:  { emoji: '💍', label: 'Ring 2' },
  };

  root.innerHTML = `
    <div class="inv-layout">
      <div>
        <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Equipped (click to unequip)</p>
        <div class="inv-equipped-grid" id="inv-equipped"></div>
        <div class="inv-fuse-section">
          <div class="fuse-title">💥 Fuse Items — 3 same rarity → 1 tier higher</div>
          <select id="fuse-rarity" style="padding:6px 12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;color:var(--text);font-size:.82rem;width:100%">
            <option value="">— select rarity —</option>
            ${RARITY_ORDER.slice(0,-1).map(r => `<option value="${r}">${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}
          </select>
          <button id="fuse-btn" style="margin-top:8px;width:100%;padding:10px;background:linear-gradient(135deg,var(--purple),var(--pink));border:none;border-radius:10px;color:#fff;font:700 .85rem var(--font-hd);cursor:pointer">Fuse 3 Items</button>
        </div>
      </div>
      <div>
        <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Bag (${s.inventory.length} items — click to equip)</p>
        <div class="inv-bag" id="inv-bag"></div>
      </div>
    </div>`;

  // Equipped slots
  const eq = root.querySelector('#inv-equipped');
  Object.entries(SLOT_INFO).forEach(([slotKey, info]) => {
    const item = s.equipped[slotKey];
    const div = document.createElement('div');
    div.className = 'inv-slot' + (item ? ' occupied' : '');
    div.innerHTML = item
      ? `<span class="inv-slot-label">${info.label}</span>
         <span class="inv-slot-icon">${item.icon}</span>
         <span class="inv-slot-rarity rarity-${item.rarity}">${item.rarity.toUpperCase()}</span>
         <div class="inv-item-tooltip">
           <strong>${item.name}</strong><br>
           ${item.stats.map(s => `<div style="font-size:.75rem;color:var(--green);margin-top:2px">${s.label}</div>`).join('')}
           <div style="font-size:.7rem;color:var(--muted);margin-top:6px">Click to unequip</div>
         </div>`
      : `<span class="inv-slot-label">${info.label}</span>
         <span class="inv-slot-icon" style="opacity:.2">${info.emoji}</span>
         <span class="inv-slot-label" style="font-size:.6rem">empty</span>`;
    if (item) {
      div.addEventListener('click', () => { Audio.click(); unequipSlot(slotKey); renderInventory(); });
    }
    eq.appendChild(div);
  });

  // Bag
  const bag = root.querySelector('#inv-bag');
  if (!s.inventory.length) {
    bag.innerHTML = '<p style="color:var(--muted);font-size:.82rem;grid-column:1/-1;padding:12px">Empty — buy pulls from the Shop!</p>';
  }
  s.inventory.forEach(item => {
    const div = document.createElement('div');
    div.className = `inv-item border-${item.rarity}`;
    div.innerHTML = `
      <span class="inv-item-icon">${item.icon}</span>
      <div class="inv-item-rarity-line bg-${item.rarity}"></div>
      <div class="inv-item-tooltip">
        <strong class="rarity-${item.rarity}">${item.rarity.toUpperCase()}</strong>
        <div style="font-weight:700;margin:4px 0">${item.name}</div>
        ${item.stats.map(st => `<div style="font-size:.75rem;color:var(--green);margin-top:2px">${st.label}</div>`).join('')}
        <div style="font-size:.7rem;color:var(--muted);margin-top:6px">Click to equip</div>
      </div>`;
    div.addEventListener('click', () => { Audio.click(); equipItem(item); renderInventory(); });
    bag.appendChild(div);
  });

  // Fuse
  const fuseBtn = root.querySelector('#fuse-btn');
  fuseBtn.addEventListener('click', () => {
    const sel = root.querySelector('#fuse-rarity').value;
    if (!sel) { toast('Select a rarity to fuse', 'info'); return; }
    const matches = s.inventory.filter(i => i.rarity === sel);
    if (matches.length < 3) { toast(`Need 3 ${sel} items to fuse (have ${matches.length})`, 'lose'); return; }
    for (let i = 0; i < 3; i++) removeFromInventory(matches[i].id);
    const nextRarity = RARITY_ORDER[Math.min(RARITY_ORDER.indexOf(sel) + 1, RARITY_ORDER.length - 1)];
    const result = generateItem(nextRarity);
    addToInventory(result);
    Audio.bigWin();
    toast(`Fused into ${nextRarity.toUpperCase()} item!`, 'win');
    showItemDrop(result, () => renderInventory());
  });
}
