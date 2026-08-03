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
  signInAsGuest, signInWithGoogle, markOnboarded, currentUser, isGuest,
} from './auth.js';
import { isConfigured } from './firebase.js';
import { Audio } from './audio.js';
import { toast, escapeHtml } from './ui.js';

const ALL_SYMBOLS = MACHINES.flatMap(m => m.symbols.filter(s => s.tier !== 'scat').map(s => s.glyph));

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

          <button class="login-play" id="login-play">
            <span class="lp-text">Enter the casino</span>
            <span class="lp-shine" aria-hidden="true"></span>
          </button>

          ${isConfigured() ? `
            <div class="login-or"><span>or</span></div>
            <button class="login-google" id="login-google">
              <svg viewBox="0 0 48 48" width="17" height="17" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6c1.9-5.7 7.2-10.2 13.6-10.2z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/>
                <path fill="#FBBC05" d="M10.4 28.3a14.5 14.5 0 010-8.6l-7.8-6a24 24 0 000 20.6l7.8-6z"/>
                <path fill="#34A853" d="M24 47.5c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.5-13.6-10.2l-7.8 6C6.5 42.1 14.6 47.5 24 47.5z"/>
              </svg>
              Continue with Google
            </button>
            <p class="login-note" id="login-note">
              Guest progress lives in this browser only. Google keeps it across devices —
              and you can upgrade later without losing anything.
            </p>` : `
            <p class="login-note">Running offline — scores stay on this device.</p>`}
        </div>
      </div>
    </div>`;

  const nameInput = document.getElementById('login-name');
  const playBtn = document.getElementById('login-play');
  const googleBtn = document.getElementById('login-google');

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

  const enter = async () => {
    const name = commitName();
    if (!name) {
      nameInput.classList.add('shake-input');
      nameInput.focus();
      Audio.error();
      setTimeout(() => nameInput.classList.remove('shake-input'), 450);
      return;
    }
    Audio.unlock();
    Audio.buy();
    playBtn.disabled = true;
    playBtn.querySelector('.lp-text').textContent = 'Opening…';
    try { await signInAsGuest(); } catch { /* offline is fine */ }
    finish();
  };

  playBtn.onclick = enter;
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });

  if (googleBtn) {
    googleBtn.onclick = async () => {
      commitName();
      Audio.unlock();
      Audio.click();
      googleBtn.disabled = true;
      const original = googleBtn.innerHTML;
      googleBtn.textContent = 'Waiting for Google…';
      try {
        await signInWithGoogle();
        if (!getState().name) setName(currentUser()?.displayName?.split(' ')[0] || 'Player');
        Audio.buy();
        finish();
      } catch (err) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = original;
        const code = err?.code ?? '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        Audio.error();
        // Surface the real reason — "operation-not-allowed" means the Google
        // provider simply is not switched on in the Firebase console yet.
        toast(
          code === 'auth/operation-not-allowed'
            ? 'Google sign-in is not enabled in Firebase yet'
            : `Sign-in failed: ${code || 'unknown error'}`,
          'lose', 4200
        );
      }
    };
  }

  if (!s.name) setTimeout(() => nameInput.focus(), 500);
}
