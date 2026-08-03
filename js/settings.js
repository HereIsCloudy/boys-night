/** Settings: theme picker, sound, motion, name, and the provably-fair seeds. */

import { getState, updateSettings, setName, resetAll } from './state.js';
import { randomSeed, commitHash } from './rng.js';
import { Audio } from './audio.js';
import { toast, confirmDialog, escapeHtml } from './ui.js';
import { queueSync } from './sync.js';

export const THEMES = [
  { id: 'jaxon',  name: 'Jaxon',  colors: ['#14e0c8', '#ffffff', '#39ff14'] },
  { id: 'riley',  name: 'Riley',  colors: ['#000000', '#0b0b0b', '#ffffff'] },
  { id: 'josh',   name: 'Josh',   colors: ['#ffffff', '#7dd3fc', '#ff6b4a'] },
  { id: 'talon',  name: 'Talon',  colors: ['#ff4d8d', '#3effa8', '#ffd93d'] },
  { id: 'hayden', name: 'Hayden', colors: ['#6d28d9', '#2e1065', '#000000'] },
];

export function applyTheme(themeId) {
  document.documentElement.dataset.theme = themeId;
}

export function applyMotion(reduced) {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}

export function ensureSeeds() {
  const s = getState();
  if (!s.serverSeed) s.serverSeed = randomSeed();
  if (!s.clientSeed) s.clientSeed = randomSeed().slice(0, 12);
}

export function renderSettings(root) {
  const s = getState();

  root.innerHTML = `
    <div class="section-title">Theme</div>
    <div class="theme-grid" id="theme-grid"></div>

    <div class="section-title">Preferences</div>
    <div class="panel">
      <div class="setting-row">
        <div>
          <div class="label">Display name</div>
          <div class="hint">Shown on the leaderboards</div>
        </div>
        <input class="text-input" id="name-input" maxlength="18"
               style="max-width:190px" value="${escapeHtml(s.name)}" placeholder="Anonymous">
      </div>

      <div class="setting-row">
        <div><div class="label">Sound</div><div class="hint">Synthesised, no downloads</div></div>
        <button class="switch ${s.settings.sound ? 'on' : ''}" id="sw-sound"></button>
      </div>

      <div class="setting-row">
        <div>
          <div class="label">Reduce motion</div>
          <div class="hint">Kills the shake, particles and count-ups</div>
        </div>
        <button class="switch ${s.settings.reduceMotion ? 'on' : ''}" id="sw-motion"></button>
      </div>

      <div class="setting-row">
        <div>
          <div class="label">Turbo on by default</div>
          <div class="hint">Only applies to machines where you own 2× speed</div>
        </div>
        <button class="switch ${s.settings.turboDefault ? 'on' : ''}" id="sw-turbo"></button>
      </div>
    </div>

    <div class="section-title">Provably fair</div>
    <div class="panel">
      <p style="color:var(--muted);font-size:.82rem;line-height:1.6;margin:0 0 14px">
        Every spin is generated from your seed pair plus a counter, so any result
        can be replayed and checked. Change the client seed whenever you like —
        it resets the counter and gives you a fresh stream.
      </p>
      <div class="setting-row">
        <div><div class="label">Server seed hash</div><div class="hint">Commitment for the current stream</div></div>
        <span class="num" style="font-size:.8rem">${commitHash(s.serverSeed)}</span>
      </div>
      <div class="setting-row">
        <div><div class="label">Client seed</div><div class="hint">Yours to change</div></div>
        <input class="text-input" id="seed-input" maxlength="24" style="max-width:190px" value="${escapeHtml(s.clientSeed)}">
      </div>
      <div class="setting-row">
        <div><div class="label">Spin counter</div><div class="hint">Nonce for the next spin</div></div>
        <span class="num">${s.nonce}</span>
      </div>
      <button class="btn" id="reseed" style="width:100%;margin-top:12px">New seed pair</button>
    </div>

    <div class="section-title">Danger zone</div>
    <div class="panel">
      <div class="setting-row">
        <div>
          <div class="label">Reset everything</div>
          <div class="hint">Wipes balance, stats, unlocks and achievements. Cannot be undone.</div>
        </div>
        <button class="btn" id="reset" style="color:var(--danger);border-color:var(--danger)">Reset</button>
      </div>
    </div>`;

  const grid = document.getElementById('theme-grid');
  for (const t of THEMES) {
    const btn = document.createElement('button');
    btn.className = `theme-swatch ${s.settings.theme === t.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="dots">${t.colors.map(c => `<span class="dot" style="background:${c}"></span>`).join('')}</div>
      <div class="nm">${t.name}</div>`;
    btn.onclick = () => {
      updateSettings({ theme: t.id });
      applyTheme(t.id);
      Audio.click();
      grid.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
    };
    grid.appendChild(btn);
  }

  const toggle = (id, key, after) => {
    const el = document.getElementById(id);
    el.onclick = () => {
      const value = !getState().settings[key];
      updateSettings({ [key]: value });
      el.classList.toggle('on', value);
      Audio.click();
      after?.(value);
    };
  };

  toggle('sw-sound', 'sound');
  toggle('sw-motion', 'reduceMotion', applyMotion);
  toggle('sw-turbo', 'turboDefault');

  const nameInput = document.getElementById('name-input');
  nameInput.onchange = () => {
    setName(nameInput.value.trim());
    queueSync(true);
    toast('Name saved', 'win');
  };

  const seedInput = document.getElementById('seed-input');
  seedInput.onchange = () => {
    const st = getState();
    st.clientSeed = seedInput.value.trim() || randomSeed().slice(0, 12);
    st.nonce = 0;
    toast('Client seed updated — counter reset');
  };

  document.getElementById('reseed').onclick = () => {
    const st = getState();
    st.serverSeed = randomSeed();
    st.clientSeed = randomSeed().slice(0, 12);
    st.nonce = 0;
    Audio.buy();
    toast('New seed pair generated', 'win');
    renderSettings(root);
  };

  document.getElementById('reset').onclick = async () => {
    const ok = await confirmDialog(
      'Reset everything?',
      'Your balance, every statistic, all unlocks and all achievements will be erased. This cannot be undone.',
      'Wipe it'
    );
    if (!ok) return;
    resetAll();
    ensureSeeds();
    location.reload();
  };
}
