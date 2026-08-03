/**
 * The stat tracker.
 *
 * Note the deliberate split between gambling net and pool income. In a faucet
 * economy every player's lifetime gambling net is negative — that is the design
 * working, not a bug — so lumping the two together would make the single most
 * important number meaningless.
 */

import { MACHINES } from './machines.js';
import { BANDS, PAYING_BANDS } from './bands.js';
import {
  getState, actualRTP, hitRate, gamblingNet,
  POOL_AMOUNT, POOL_INTERVAL_MS, poolDropSize,
  FRIEND_BONUS_PER_FRIEND, FRIEND_BONUS_MAX_FRIENDS,
} from './state.js';
import { ACHIEVEMENTS } from './achievements.js';
import { fmt, fmtFull, fmtMult, fmtPct, fmtDuration, escapeHtml } from './ui.js';

const SYMBOL_TOTAL = 1153;   // sum of ROLES weights in machines.js

function statCard(title, rows) {
  return `
    <div class="stat-card">
      <div class="stat-card-title">${title}</div>
      ${rows.filter(Boolean).map(([k, v, colour]) => `
        <div class="stat-row">
          <span class="k">${k}</span>
          <span class="v" ${colour ? `style="color:${colour}"` : ''}>${v}</span>
        </div>`).join('')}
    </div>`;
}

const good = 'var(--success)';
const bad = 'var(--danger)';
const hi = 'var(--main)';

export function renderStats(root) {
  const s = getState();
  const net = gamblingNet();
  const spinsToday = s.spinsByDay[new Date().toISOString().slice(0, 10)] ?? 0;
  const spm = s.totalPlaytimeMs > 0 ? s.totalSpins / (s.totalPlaytimeMs / 60000) : 0;

  root.innerHTML = `
    <div class="section-title">Lifetime</div>
    <div class="stats-grid">
      ${statCard('💰 Money', [
        ['Balance', fmtFull(s.balance), hi],
        ['Peak balance', fmtFull(s.peakBalance), good],
        ['Lowest balance', fmtFull(s.lowestBalance)],
        ['Total wagered', fmt(s.totalWagered)],
        ['Total returned', fmt(s.totalWon)],
        ['Gambling net', (net >= 0 ? '+' : '') + fmt(net), net >= 0 ? good : bad],
        ['Times broke', s.timesBroke, s.timesBroke > 0 ? bad : null],
      ])}

      ${statCard('📦 Pool income', [
        ['Collected total', fmt(s.poolTotalCollected), good],
        ['Collections', fmtFull(s.poolCollections)],
        ['Drop size', fmtFull(POOL_AMOUNT)],
        ['Drop interval', `${POOL_INTERVAL_MS / 60000} min`],
        ['Your drop', fmtFull(poolDropSize()), good],
        ['Friends', `${Math.min(FRIEND_BONUS_MAX_FRIENDS, (s.friends ?? []).length)} / ${FRIEND_BONUS_MAX_FRIENDS}`],
        ['True net', (() => {
          const t = net + s.poolTotalCollected;
          return (t >= 0 ? '+' : '') + fmt(t);
        })(), net + s.poolTotalCollected >= 0 ? good : bad],
      ])}

      ${statCard('🎰 Spinning', [
        ['Total spins', fmtFull(s.totalSpins), hi],
        ['Spins today', fmtFull(spinsToday)],
        ['Hits', fmtFull(s.totalHits)],
        ['Hit rate', fmtPct(hitRate())],
        ['Actual RTP', s.totalWagered > 0 ? fmtPct(actualRTP()) : '—',
          actualRTP() >= 0.6 ? good : bad],
        ['Spins / min', spm > 0 ? spm.toFixed(1) : '—'],
      ])}

      ${statCard('🏆 Records', [
        ['Biggest win', s.biggestWin ? fmt(s.biggestWin.amount) : '—', 'var(--win-big)'],
        ['Biggest multiplier', s.biggestMultiplier ? fmtMult(s.biggestMultiplier) : '—', 'var(--win-mega)'],
        ['On machine', s.biggestWin ? escapeHtml(MACHINES.find(m => m.id === s.biggestWin.machineId)?.owner ?? '—') : '—'],
        ['Longest win streak', s.longestWinStreak],
        ['Longest loss streak', s.longestLossStreak, bad],
        ['Near misses', fmtFull(s.nearMisses)],
      ])}

      ${statCard('⏱️ Time', [
        ['Playtime', fmtDuration(s.totalPlaytimeMs)],
        ['Sessions', fmtFull(s.sessionsPlayed)],
        ['First played', s.firstPlayedAt ? new Date(s.firstPlayedAt).toLocaleDateString() : '—'],
        ['Days active', Object.keys(s.spinsByDay).length],
        ['Busiest day', (() => {
          const e = Object.entries(s.spinsByDay).sort((a, b) => b[1] - a[1])[0];
          return e ? `${fmtFull(e[1])} spins` : '—';
        })()],
        ['Achievements', `${s.achievements.length} / ${ACHIEVEMENTS.length}`, hi],
      ])}

      ${statCard('🛒 Unlocks', [
        ['Autospin', s.autospin ? 'Owned' : 'Locked', s.autospin ? good : null],
        ...MACHINES.map(m => [`2× ${m.owner}`, s.turbo[m.id] ? 'Owned' : 'Locked', s.turbo[m.id] ? good : null]),
      ])}
    </div>

    <div class="section-title">Win bands — where your money actually went</div>
    ${renderBandTable(s)}

    <div class="section-title">Per machine</div>
    <div class="stats-grid">
      ${MACHINES.map(m => renderMachineCard(s, m)).join('')}
    </div>

    <div class="section-title">Symbol frequency</div>
    <p style="color:var(--muted);font-size:.78rem;margin:-6px 0 12px">
      Observed landing share against each symbol's designed weight. Large gaps
      after a few thousand spins would mean the reels are lying — they aren't.
    </p>
    ${renderSymbolGrid(s)}

    <div class="section-title">Paylines</div>
    ${renderLineTable(s)}

    <div class="section-title">Achievements — ${s.achievements.length} / ${ACHIEVEMENTS.length}</div>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="ach ${s.achievements.includes(a.id) ? 'earned' : ''}">
          <span class="ach-icon">${a.icon}</span>
          <div>
            <div class="ach-name">${escapeHtml(a.name)}</div>
            <div class="ach-desc">${escapeHtml(a.desc)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}

function renderBandTable(s) {
  const totals = Object.fromEntries(BANDS.map(b => [b.id, 0]));
  let spins = 0;
  for (const m of MACHINES) {
    const ms = s.perMachine[m.id];
    spins += ms.spins;
    for (const b of BANDS) totals[b.id] += ms.bands[b.id] ?? 0;
  }
  if (spins === 0) return `<div class="empty">No spins recorded yet.</div>`;

  return `
    <div class="table">
      <div class="tr th"><span>Band</span><span>Range</span><span>Hits</span><span>Frequency</span><span>Odds</span></div>
      ${BANDS.map(b => {
        const n = totals[b.id];
        const p = n / spins;
        return `
          <div class="tr">
            <span class="band-dot ${b.id}">${b.name}</span>
            <span class="num">${b.max === 0 ? '—' : `${b.min}x – ${b.max}x`}</span>
            <span class="num">${fmtFull(n)}</span>
            <span class="num">${fmtPct(p, 3)}</span>
            <span class="num">${n > 0 ? '1 in ' + fmt(Math.round(1 / p)) : '—'}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function renderMachineCard(s, m) {
  const ms = s.perMachine[m.id];
  const rtp = ms.wagered > 0 ? ms.won / ms.wagered : 0;
  const hr = ms.spins > 0 ? ms.hits / ms.spins : 0;
  const net = ms.won - ms.wagered;

  return statCard(`🎰 ${escapeHtml(m.owner)}`, [
    ['Spins', fmtFull(ms.spins), hi],
    ['Wagered', fmt(ms.wagered)],
    ['Returned', fmt(ms.won)],
    ['Net', (net >= 0 ? '+' : '') + fmt(net), net >= 0 ? good : bad],
    ['Target RTP', fmtPct(m.rtp)],
    ['Your RTP', ms.wagered > 0 ? fmtPct(rtp) : '—', rtp >= m.rtp ? good : bad],
    ['Hit rate', ms.spins > 0 ? fmtPct(hr) : '—'],
    ['Biggest win', ms.biggestWin ? fmt(ms.biggestWin) : '—', 'var(--win-big)'],
    ['Best multiplier', ms.biggestMultiplier ? fmtMult(ms.biggestMultiplier) : '—', 'var(--win-mega)'],
    // Feature names are already plural ("Free Spins", "Cascades"), so appending
    // an 's' produced "Free Spinss".
    ['Features hit', fmtFull(ms.featureTriggers)],
    ['Feature winnings', fmt(ms.featureWinnings)],
    ['Longest dry spell', `${ms.longestDrySpell} spins`, ms.longestDrySpell >= 50 ? bad : null],
    ['Longest win streak', ms.longestWinStreak],
    ['Time played', fmtDuration(ms.timePlayedMs)],
  ]);
}

function renderSymbolGrid(s) {
  const rows = [];
  for (const m of MACHINES) {
    const ms = s.perMachine[m.id];
    const totalLanded = Object.values(ms.symbols).reduce((t, r) => t + r.landed, 0);
    if (totalLanded === 0) continue;

    rows.push(`<div class="sym-machine">${escapeHtml(m.name)}</div>`);
    rows.push(`<div class="sym-row">${m.symbols.map(sym => {
      const rec = ms.symbols[sym.key] ?? { landed: 0, inWin: 0, paid: 0 };
      const share = rec.landed / totalLanded;
      const expected = sym.weight / SYMBOL_TOTAL;
      const delta = expected > 0 ? (share - expected) / expected : 0;
      const heat = Math.max(-1, Math.min(1, delta * 3));
      const colour = heat >= 0
        ? `color-mix(in srgb, var(--success) ${Math.round(Math.abs(heat) * 70)}%, var(--panel))`
        : `color-mix(in srgb, var(--danger) ${Math.round(Math.abs(heat) * 70)}%, var(--panel))`;
      return `
        <div class="sym-cell" style="background:${colour}" title="${escapeHtml(sym.name)} — ${fmtFull(rec.landed)} landed, ${fmtFull(rec.inWin)} in wins">
          <span class="g">${sym.glyph}</span>
          <span class="n num">${fmtPct(share, 1)}</span>
          <span class="d num">${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%</span>
        </div>`;
    }).join('')}</div>`);
  }
  return rows.length ? `<div class="sym-grid">${rows.join('')}</div>` : `<div class="empty">Spin a few times to populate this.</div>`;
}

function renderLineTable(s) {
  const agg = {};
  for (const m of MACHINES) {
    for (const [idx, rec] of Object.entries(s.perMachine[m.id].lines)) {
      const a = agg[idx] ?? (agg[idx] = { hits: 0, won: 0 });
      a.hits += rec.hits;
      a.won += rec.won;
    }
  }
  const entries = Object.entries(agg).sort((a, b) => b[1].won - a[1].won);
  if (!entries.length) return `<div class="empty">No winning lines yet.</div>`;

  return `
    <div class="table">
      <div class="tr th"><span>Line</span><span>Hits</span><span>Paid</span><span>Share</span></div>
      ${entries.slice(0, 20).map(([idx, rec]) => {
        const totalWon = entries.reduce((t, e) => t + e[1].won, 0);
        return `
          <div class="tr">
            <span>Line ${Number(idx) + 1}</span>
            <span class="num">${fmtFull(rec.hits)}</span>
            <span class="num">${fmt(rec.won)}</span>
            <span class="num">${fmtPct(totalWon > 0 ? rec.won / totalWon : 0)}</span>
          </div>`;
      }).join('')}
    </div>`;
}
