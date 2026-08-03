/** Settings: theme picker, sound, motion, name, and the provably-fair seeds. */

import { getState, updateSettings, setName, resetAll } from './state.js';
import { randomSeed, commitHash } from './rng.js';
import { accountLabel, isSignedIn, isGuest, signInWithGoogle, signOut } from './auth.js';
import { isConfigured } from './firebase.js';
import { pullCloudSave, flush } from './sync.js';
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
    <div class="section-title">Account</div>
    <div class="panel">
      <div class="setting-row">
        <div>
          <div class="label">${escapeHtml(accountLabel())}</div>
          <div class="hint">${
            isSignedIn()
              ? 'Progress is backed up and follows you to any device.'
              : isConfigured()
                ? 'Guest progress lives in this browser only. Clearing site data wipes it.'
                : 'Firebase is not configured, so everything stays on this device.'
          }</div>
        </div>
        ${isConfigured() ? (
          isSignedIn()
            ? `<button class="btn" id="acct-signout">Sign out</button>`
            : `<button class="btn btn-primary" id="acct-google">Link Google</button>`
        ) : ''}
      </div>
      ${isSignedIn() ? `
        <div class="setting-row">
          <div>
            <div class="label">Cloud save</div>
            <div class="hint">Pull the copy stored against your account, replacing what is here.</div>
          </div>
          <button class="btn" id="acct-restore">Restore</button>
        </div>` : ''}
    </div>

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

  // ── Account ──
  document.getElementById('acct-google')?.addEventListener('click', async () => {
    const btn = document.getElementById('acct-google');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Waiting…';
    try {
      await signInWithGoogle();
      await flush();
      Audio.buy();
      toast('Account linked — progress now syncs', 'win');
      renderSettings(root);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = label;
      const code = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      Audio.error();
      toast(
        code === 'auth/operation-not-allowed'
          ? 'Google sign-in is not enabled in Firebase yet'
          : `Link failed: ${code || 'unknown error'}`,
        'lose', 4200
      );
    }
  });

  document.getElementById('acct-signout')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Sign out?',
      'Your progress stays saved to your account. This device will fall back to a fresh guest save until you sign in again.',
      'Sign out'
    );
    if (!ok) return;
    await flush();          // make sure the latest save is uploaded first
    await signOut();
    toast('Signed out');
    location.reload();
  });

  document.getElementById('acct-restore')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Restore cloud save?',
      'This replaces everything on this device with the copy stored against your account. Anything newer here will be lost.',
      'Restore'
    );
    if (!ok) return;
    const res = await pullCloudSave({ force: true });
    if (res.restored) { Audio.buy(); toast('Cloud save restored', 'win'); location.reload(); }
    else { Audio.error(); toast(`Nothing to restore (${res.reason ?? 'unknown'})`, 'lose'); }
  });

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
