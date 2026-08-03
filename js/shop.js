/** Shop: 2x speed per machine, autospin once for all of them. */

import { MACHINES, TURBO_PRICE, AUTOSPIN_PRICE } from './machines.js';
import { getState, hasTurbo, hasAutospin, buyTurbo, buyAutospin } from './state.js';
import { Audio } from './audio.js';
import { fmt, fmtFull, toast, escapeHtml } from './ui.js';
import { checkAchievements } from './achievements.js';
import { queueSync } from './sync.js';

export function renderShop(root) {
  const draw = () => {
    const s = getState();

    root.innerHTML = `
      <div class="section-title">Autospin</div>
      <div class="panel">
        <div class="setting-row">
          <div>
            <div class="label">🤖 Autospin — all machines</div>
            <div class="hint">
              Spin counts of 10, 25, 50, 100 or endless. Stops automatically on a
              bonus trigger or any win of 10× or more.
            </div>
          </div>
          <button class="btn ${hasAutospin() ? '' : 'btn-primary'}" id="buy-auto" ${hasAutospin() ? 'disabled' : ''}>
            ${hasAutospin() ? 'Owned' : fmtFull(AUTOSPIN_PRICE)}
          </button>
        </div>
      </div>

      <div class="section-title">2× Speed</div>
      <p style="color:var(--muted);font-size:.8rem;margin:-6px 0 12px;line-height:1.6">
        Bought per machine. Worth knowing what you're buying: at these odds,
        2× speed makes you lose money twice as fast. It also doubles how quickly
        you reach the 1-in-100,000 tail. It's a variance amplifier, not an edge.
      </p>
      <div class="panel">
        ${MACHINES.map(m => `
          <div class="setting-row">
            <div>
              <div class="label" style="color:${m.accent}">${escapeHtml(m.name)}</div>
              <div class="hint">${escapeHtml(m.featureName)} · ${fmtFull(s.perMachine[m.id].spins)} spins played</div>
            </div>
            <button class="btn ${hasTurbo(m.id) ? '' : 'btn-primary'}" data-turbo="${m.id}" ${hasTurbo(m.id) ? 'disabled' : ''}>
              ${hasTurbo(m.id) ? 'Owned' : fmtFull(TURBO_PRICE)}
            </button>
          </div>`).join('')}
      </div>

      <div class="section-title">Your balance</div>
      <div class="panel" style="text-align:center">
        <div class="num" style="font-size:2.2rem;font-weight:800;color:var(--main)">${fmtFull(s.balance)}</div>
      </div>`;

    document.getElementById('buy-auto').onclick = () => {
      const st = getState();
      if (st.balance < AUTOSPIN_PRICE) {
        Audio.error();
        toast(`Need ${fmtFull(AUTOSPIN_PRICE - st.balance)} more`, 'lose');
        return;
      }
      if (buyAutospin(AUTOSPIN_PRICE)) {
        Audio.buy();
        toast('Autospin unlocked', 'mega');
        checkAchievements();
        queueSync();
        draw();
      }
    };

    root.querySelectorAll('[data-turbo]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.turbo;
        const st = getState();
        if (st.balance < TURBO_PRICE) {
          Audio.error();
          toast(`Need ${fmtFull(TURBO_PRICE - st.balance)} more`, 'lose');
          return;
        }
        if (buyTurbo(id, TURBO_PRICE)) {
          Audio.buy();
          toast(`2× speed unlocked`, 'win');
          checkAchievements();
          queueSync();
          draw();
        }
      };
    });
  };

  draw();
}
