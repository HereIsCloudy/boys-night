/** Machine select. Each tile shows your personal best on that machine. */

import { MACHINES, TURBO_PRICE } from './machines.js';
import { getState, hasTurbo, actualRTP, hitRate } from './state.js';
import { fmt, fmtMult, fmtPct, escapeHtml } from './ui.js';

export function renderLobby(root, onPick) {
  const s = getState();

  root.innerHTML = `
    <div class="section-title">Pick your poison</div>
    <div class="machine-grid" id="machine-grid"></div>
    <p style="color:var(--muted);font-size:.78rem;margin-top:18px;line-height:1.6">
      Every machine shares the same odds table and the same bet range. The only
      differences are the bonus feature and a couple of points of RTP.
      Nothing here is generous.
    </p>`;

  const grid = document.getElementById('machine-grid');

  for (const m of MACHINES) {
    const ms = s.perMachine[m.id];
    const card = document.createElement('button');
    card.className = 'machine-card';
    card.style.setProperty('--m-accent', m.accent);
    card.innerHTML = `
      ${hasTurbo(m.id) ? '<span class="turbo-badge">2×</span>' : ''}
      <span class="machine-feature">${escapeHtml(m.featureName)}</span>
      <div class="machine-name">${escapeHtml(m.name)}</div>
      <div class="machine-tag">${escapeHtml(m.tagline)}</div>
      <div class="machine-stats">
        <span class="k">RTP</span><span class="v">${(m.rtp * 100).toFixed(0)}%</span>
        <span class="k">Your spins</span><span class="v">${fmt(ms.spins)}</span>
        <span class="k">Best win</span><span class="v">${ms.biggestWin ? fmt(ms.biggestWin) : '—'}</span>
        <span class="k">Best multi</span><span class="v">${ms.biggestMultiplier ? fmtMult(ms.biggestMultiplier) : '—'}</span>
        ${ms.spins >= 50 ? `
          <span class="k">Your RTP</span>
          <span class="v" style="color:${actualRTP(m.id) >= m.rtp ? 'var(--success)' : 'var(--danger)'}">
            ${fmtPct(actualRTP(m.id))}
          </span>` : ''}
      </div>`;
    card.onclick = () => onPick(m.id);
    grid.appendChild(card);
  }
}
