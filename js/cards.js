import { getState, updateBalance, addCard, saveState } from './state.js';
import { Audio } from './audio.js';
import { Particles } from './particles.js';
import { toast, fmtNum } from './ui.js';
import {
  CARDS, CARDS_BY_ID, CARD_RARITIES, CARD_RARITY_ORDER,
  SET_BONUSES, BOOST_LABELS, isSetComplete,
} from './cardData.js';

const PACKS = [
  { key: 'single', name: 'Riley Pack',      icon: '🃏', cost: 750,  cards: 3,  desc: '3 cards, Rare+ guaranteed' },
  { key: 'mega',   name: 'Mega Riley Pack', icon: '🎴', cost: 3300, cards: 15, desc: '15 cards (~12% off)' },
];

// map card rarities → item rarities for existing audio/particle effects
const FX_RARITY = { common:'common', rare:'rare', epic:'epic', legendary:'legendary', mythic:'divine', riley:'chaosDivine' };

let _filter = 'all';

function boostLabel(card) {
  const fn = BOOST_LABELS[card.boost.key];
  return fn ? fn(card.boost.v) : '';
}

function rollCard() {
  const total = CARD_RARITY_ORDER.reduce((s, r) => s + CARD_RARITIES[r].weight, 0);
  let roll = Math.random() * total;
  let rarity = 'common';
  for (const r of CARD_RARITY_ORDER) {
    roll -= CARD_RARITIES[r].weight;
    if (roll <= 0) { rarity = r; break; }
  }
  const pool = CARDS.filter(c => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollPack(count) {
  const pulled = [];
  for (let i = 0; i < count; i++) pulled.push(rollCard());
  // guarantee at least one rare+ per 3 cards
  const guarantees = Math.floor(count / 3);
  for (let g = 0; g < guarantees; g++) {
    const seg = pulled.slice(g * 3, g * 3 + 3);
    if (seg.every(c => c.rarity === 'common')) {
      const pool = CARDS.filter(c => c.rarity === 'rare');
      pulled[g * 3] = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return pulled;
}

// ── Card DOM builder (shared by grid + reveal) ────────────────────────────────

function cardHTML(card, { owned = true, copies = 0, faceDown = false } = {}) {
  const r = CARD_RARITIES[card.rarity];
  if (faceDown) {
    return `<div class="rcard-inner">
      <div class="rcard-back"><span class="rcard-back-logo">🃏</span><span class="rcard-back-txt">RILEY</span></div>
      <div class="rcard-front rarity-bg-${card.rarity}">${cardFaceHTML(card)}</div>
    </div>`;
  }
  if (!owned) {
    return `<div class="rcard-locked">
      <div class="rcard-locked-icon">🔒</div>
      <div class="rcard-locked-name">???</div>
      <div class="rcard-rarity-tag" style="color:${r.color}">${r.label}</div>
    </div>`;
  }
  return cardFaceHTML(card, copies);
}

function cardFaceHTML(card, copies = 0) {
  const r = CARD_RARITIES[card.rarity];
  const art = card.gif
    ? `<div class="rcard-art"><img src="${card.gif}" alt="" loading="lazy"
         onerror="this.parentElement.classList.add('gif-missing')">
         <div class="rcard-art-ph">🎬<span>GIF SLOT</span></div></div>`
    : '';
  return `
    <div class="rcard-shine"></div>
    <div class="rcard-rarity-tag" style="color:${r.color}">${r.label}</div>
    ${art}
    <div class="rcard-name">${card.name}</div>
    <div class="rcard-text">${card.text}</div>
    <div class="rcard-boost">⚡ ${boostLabel(card)}</div>
    ${copies > 1 ? `<div class="rcard-copies">×${copies}</div>` : ''}`;
}

// ── Collection modal ──────────────────────────────────────────────────────────

export function renderCards() {
  const root = document.getElementById('cards-root');
  if (!root) return;
  const s = getState();
  const ownedCount = CARDS.filter(c => s.cards[c.id]).length;
  const pct = Math.round((ownedCount / CARDS.length) * 100);

  const rarityChips = CARD_RARITY_ORDER.map(rk => {
    const r = CARD_RARITIES[rk];
    const total = CARDS.filter(c => c.rarity === rk).length;
    const own = CARDS.filter(c => c.rarity === rk && s.cards[c.id]).length;
    const complete = own === total;
    return `<span class="rc-chip ${complete ? 'complete' : ''}" style="--chip:${r.color}">${r.label} ${own}/${total}</span>`;
  }).join('');

  const setRows = SET_BONUSES.map(sb => {
    const done = isSetComplete(s.cards, sb.rarity);
    return `<div class="rc-set ${done ? 'done' : ''}">${done ? '✅' : '⬜'} ${sb.label}</div>`;
  }).join('');

  root.innerHTML = `
    <div class="rc-top">
      <div class="rc-progress-row">
        <span class="rc-progress-label">COLLECTION</span>
        <div class="rc-progress-bar"><div class="rc-progress-fill" style="width:${pct}%"></div></div>
        <span class="rc-progress-num">${ownedCount}/${CARDS.length}</span>
      </div>
      <div class="rc-chips">${rarityChips}</div>
      <div class="rc-packs" id="rc-packs"></div>
      <details class="rc-sets"><summary>Set Bonuses (own every card of a rarity)</summary>${setRows}</details>
      <div class="rc-filters" id="rc-filters">
        <button class="rc-filter ${_filter === 'all' ? 'active' : ''}" data-f="all">ALL</button>
        ${CARD_RARITY_ORDER.map(rk => `<button class="rc-filter ${_filter === rk ? 'active' : ''}" data-f="${rk}" style="--chip:${CARD_RARITIES[rk].color}">${CARD_RARITIES[rk].label}</button>`).join('')}
      </div>
    </div>
    <div class="rc-grid" id="rc-grid"></div>`;

  // packs
  const packsEl = root.querySelector('#rc-packs');
  PACKS.forEach(p => {
    const afford = s.balance >= p.cost;
    const btn = document.createElement('button');
    btn.className = 'rc-pack-btn';
    btn.style.opacity = afford ? '1' : '.5';
    btn.innerHTML = `<span class="rc-pack-icon">${p.icon}</span>
      <span class="rc-pack-name">${p.name}</span>
      <span class="rc-pack-cost">🪙 ${fmtNum(p.cost)}</span>
      <span class="rc-pack-desc">${p.desc}</span>`;
    btn.addEventListener('click', () => openPack(p));
    packsEl.appendChild(btn);
  });

  // filters
  root.querySelector('#rc-filters').addEventListener('click', e => {
    const b = e.target.closest('.rc-filter');
    if (!b) return;
    _filter = b.dataset.f;
    Audio.click();
    renderCards();
  });

  // grid
  const grid = root.querySelector('#rc-grid');
  const list = _filter === 'all' ? CARDS : CARDS.filter(c => c.rarity === _filter);
  list.forEach(card => {
    const copies = s.cards[card.id] ?? 0;
    const owned = copies > 0;
    const div = document.createElement('div');
    div.className = `rcard rarity-${card.rarity} ${owned ? 'owned' : 'unowned'}`;
    div.innerHTML = cardHTML(card, { owned, copies });
    grid.appendChild(div);
  });
}

// ── Pack opening overlay ──────────────────────────────────────────────────────

function openPack(pack) {
  const s = getState();
  if (s.balance < pack.cost) { toast('Not enough coins!', 'lose'); return; }
  Audio.click();
  updateBalance(-pack.cost);
  s.cardPacksOpened = (s.cardPacksOpened ?? 0) + 1;

  const pulled = rollPack(pack.cards);
  let dust = 0;
  const results = pulled.map(card => {
    const isNew = addCard(card.id);
    if (!isNew) dust += CARD_RARITIES[card.rarity].dust;
    return { card, isNew };
  });
  if (dust > 0) updateBalance(dust);
  saveState();

  // overlay
  const ov = document.createElement('div');
  ov.className = 'rc-open-overlay';
  ov.innerHTML = `
    <div class="rc-open-title">🃏 ${pack.name.toUpperCase()} — tap cards to flip!</div>
    <div class="rc-open-row"></div>
    <div class="rc-open-footer">
      ${dust > 0 ? `<span class="rc-dust">Duplicates → +${fmtNum(dust)} 🪙 dust</span>` : ''}
      <button class="rc-open-done">Collect ✨</button>
    </div>`;
  document.body.appendChild(ov);

  const row = ov.querySelector('.rc-open-row');
  let flipped = 0;
  results.forEach(({ card, isNew }, i) => {
    const el = document.createElement('div');
    el.className = `rcard rcard-flip rarity-${card.rarity}`;
    el.style.animationDelay = `${i * 0.08}s`;
    el.innerHTML = cardHTML(card, { faceDown: true });
    if (isNew) el.dataset.new = '1';
    el.addEventListener('click', () => {
      if (el.classList.contains('is-flipped')) return;
      el.classList.add('is-flipped');
      flipped++;
      Audio.itemDrop(FX_RARITY[card.rarity]);
      const r = el.getBoundingClientRect();
      Particles.rarityBurst(FX_RARITY[card.rarity], r.left + r.width / 2, r.top + r.height / 2);
      if (isNew) {
        const badge = document.createElement('div');
        badge.className = 'rc-new-badge';
        badge.textContent = 'NEW!';
        el.appendChild(badge);
      }
      if (card.rarity === 'mythic' || card.rarity === 'riley') Particles.screenFlash(CARD_RARITIES[card.rarity].color);
    }, { once: false });
    row.appendChild(el);
  });

  ov.querySelector('.rc-open-done').addEventListener('click', () => {
    // auto-flip any unflipped before closing
    ov.querySelectorAll('.rcard-flip:not(.is-flipped)').forEach(el => el.classList.add('is-flipped'));
    setTimeout(() => {
      ov.remove();
      Audio.coin();
      renderCards();
    }, flipped < results.length ? 500 : 0);
  });
}
