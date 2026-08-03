/**
 * The login screen — the first thing anyone sees, so it does the heaviest
 * animation work in the app.
 *
 * Live slot reels spin behind the panel using the real symbol sets, which
 * sells what the game is before a single word is read. They are pure
 * decoration: no engine calls, no state, no payouts.
 */

import { MACHINES } from './machines.js';
import { getState, setName } from './state.js';
import {
  signInAsGuest, signInWithName, markOnboarded,
  describeAuthError, MIN_PASSWORD, isSignedIn, signOut, accountLabel,
} from './auth.js';
import { isConfigured } from './firebase.js';
import { pullCloudSave } from './sync.js';
import { Audio } from './audio.js';
import { toast, confirmDialog, escapeHtml, fmtFull } from './ui.js';

const ALL_SYMBOLS = MACHINES.flatMap(m => m.symbols.filter(s => s.tier !== 'scat').map(s => s.glyph));

/**
 * The returning-player door.
 *
 * The login screen is shown on every launch so the game always opens on
 * something deliberate rather than dumping you mid-menu. For anyone already
 * signed in it collapses to a single Continue button, with the way out
 * directly underneath it.
 */
function renderReturning(root, onDone, s) {
  root.innerHTML = `
    <div class="login">
      <div class="login-reels" aria-hidden="true">
        ${Array.from({ length: 6 }, (_, i) => reelColumn(i)).join('')}
      </div>
      <div class="login-veil" aria-hidden="true"></div>

      <div class="login-panel">
        <div class="login-badge">Welcome back</div>

        <h1 class="login-title">
          <span class="lt-word" style="--i:0">BOYS</span>
          <span class="lt-word lt-accent" style="--i:1">NIGHT</span>
        </h1>

        <div class="login-form">
          <button class="login-play" id="login-continue">
            <span class="lp-text">Continue as ${escapeHtml(s.name)}</span>
            <span class="lp-shine" aria-hidden="true"></span>
          </button>
          <div class="returning-who">
            <span class="player-tag">#${escapeHtml(s.tag || '----')}</span>
            <span class="returning-balance num">${fmtFull(s.balance)} coins</span>
          </div>

          <button class="login-logout" id="login-logout">Log out</button>
          <p class="login-note" id="login-note">${escapeHtml(accountLabel())}</p>
        </div>
      </div>
    </div>`;

  const go = () => {
    Audio.unlock();
    Audio.click();
    const panel = root.querySelector('.login-panel');
    panel?.classList.add('login-exit');
    setTimeout(onDone, 380);
  };

  document.getElementById('login-continue').onclick = go;

  document.getElementById('login-logout').onclick = async () => {
    const guest = !isSignedIn();
    const ok = await confirmDialog(
      guest ? 'Log out of this guest?' : 'Log out?',
      guest
        ? 'You are playing as a guest, so there is no account to sign back into. '
          + 'Your balance, stats and unlocks on this device will be gone for good.'
        : 'Your progress stays saved to your account and comes back when you sign in.',
      guest ? 'Log out anyway' : 'Log out'
    );
    if (!ok) return;
    await signOut();
    location.reload();
  };

  // Enter is the obvious key for "yes, that's me".
  const onKey = e => {
    if (e.key === 'Enter') { e.preventDefault(); go(); }
  };
  document.addEventListener('keydown', onKey, { once: true });
}

function reelColumn(index) {
  const glyphs = [];
  for (let i = 0; i < 14; i++) {
    glyphs.push(ALL_SYMBOLS[(index * 7 + i * 3) % ALL_SYMBOLS.length]);
  }
  // Duplicated so the CSS loop can wrap seamlessly.
  const strip = [...glyphs, ...glyphs];
  return `
    <div class="lr-col" style="--dur:${9 + index * 2.5}s; --delay:${index * -1.7}s">
      <div class="lr-strip">${strip.map(g => `<span>${g}</span>`).join('')}</div>
    </div>`;
}

export function renderLogin(root, onDone) {
  const s = getState();

  // A player who has already been through the door gets a doorman, not a form.
  if (s.onboarded && s.name) return renderReturning(root, onDone, s);

  root.innerHTML = `
    <div class="login">
      <div class="login-reels" aria-hidden="true">
        ${Array.from({ length: 6 }, (_, i) => reelColumn(i)).join('')}
      </div>
      <div class="login-veil" aria-hidden="true"></div>

      <div class="login-panel">
        <div class="login-badge">Five machines · Terrible odds</div>

        <h1 class="login-title">
          <span class="lt-word" style="--i:0">BOYS</span>
          <span class="lt-word lt-accent" style="--i:1">NIGHT</span>
        </h1>

        <p class="login-tag">Come lose money with your mates.</p>

        <div class="login-form">
          <label class="login-label" for="login-name">What should we call you?</label>
          <input class="login-input" id="login-name" maxlength="18" autocomplete="nickname"
                 placeholder="Your name" value="${escapeHtml(s.name)}" spellcheck="false">

          ${isConfigured() ? `
            <label class="login-label" style="margin-top:12px" for="login-pass">
              Password <span class="login-optional">optional</span>
            </label>
            <input class="login-input login-input-pass" id="login-pass" type="password"
                   maxlength="64" autocomplete="current-password"
                   placeholder="Keep this name for yourself">
            <p class="login-hint" id="login-hint">
              Leave it blank to play as a guest on this browser.
              Set one and the name is yours — you can sign back in anywhere.
            </p>` : ''}

          <button class="login-play" id="login-play">
            <span class="lp-text">Enter the casino</span>
            <span class="lp-shine" aria-hidden="true"></span>
          </button>

          ${isConfigured() ? `
            <p class="login-note" id="login-note">
              Guest progress lives in this browser only. A password keeps your
              name and progress across devices — and you can add one later in
              Settings without losing anything.
            </p>` : `
            <p class="login-note">Running offline — scores stay on this device.</p>`}
        </div>
      </div>
    </div>`;

  const nameInput = document.getElementById('login-name');
  const passInput = document.getElementById('login-pass');
  const playBtn = document.getElementById('login-play');

  const commitName = () => {
    const v = nameInput.value.trim();
    if (v) setName(v);
    return v;
  };

  const finish = () => {
    markOnboarded();
    const panel = root.querySelector('.login-panel');
    panel?.classList.add('login-exit');
    setTimeout(onDone, 380);
  };

  const rejectField = (field, message) => {
    field.classList.add('shake-input');
    field.focus();
    Audio.error();
    if (message) toast(message, 'lose', 3600);
    setTimeout(() => field.classList.remove('shake-input'), 450);
  };

  const setBusy = (busy, label) => {
    playBtn.disabled = busy;
    playBtn.querySelector('.lp-text').textContent = busy ? label : 'Enter the casino';
  };

  const enter = async () => {
    const name = commitName();
    if (!name) return rejectField(nameInput, '');

    const password = passInput?.value ?? '';
    Audio.unlock();

    // No password means guest — the original, instant path.
    if (!password) {
      Audio.buy();
      setBusy(true, 'Opening…');
      try { await signInAsGuest(); } catch { /* offline is fine */ }
      return finish();
    }

    if (password.length < MIN_PASSWORD) {
      return rejectField(passInput, `Password must be at least ${MIN_PASSWORD} characters`);
    }

    setBusy(true, 'Signing in…');
    try {
      await signInWithName(name, password);
      // Returning player on a new device — pull their save before entering.
      const res = await pullCloudSave();
      Audio.buy();
      if (res.restored) toast('Welcome back — save restored', 'win', 3200);
      finish();
    } catch (err) {
      setBusy(false);
      const msg = describeAuthError(err?.code);
      if (msg) rejectField(passInput, msg);
    }
  };

  playBtn.onclick = enter;
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });
  passInput?.addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });

  if (!s.name) setTimeout(() => nameInput.focus(), 500);
}
