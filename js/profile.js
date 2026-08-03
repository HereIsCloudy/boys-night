/**
 * The profile view — reachable straight off the main menu.
 *
 * Everything about who you ARE lives here: your card as others see it, the
 * badge picker, your friends, and the requests waiting on an answer. It used
 * to be scattered through Settings, which made "customise my profile" mean
 * scrolling past the sound toggle.
 */

import { getState, removeFriend, toggleBadge, MAX_BADGES,
         FRIEND_BONUS_PER_FRIEND, FRIEND_BONUS_MAX_FRIENDS } from './state.js';
import { BADGES } from './badges.js';
import { loadRequests, acceptRequest, declineRequest, cancelRequest } from './friends.js';
import { isConfigured } from './firebase.js';
import { queueSync } from './sync.js';
import { Audio } from './audio.js';
import { toast, fmtFull, escapeHtml } from './ui.js';

export function renderProfile(root) {
  const s = getState();
  const friends = s.friends ?? [];
  const counting = Math.min(FRIEND_BONUS_MAX_FRIENDS, friends.length);
  const chosen = (s.badges ?? [])
    .map(id => BADGES.find(b => b.id === id))
    .filter(Boolean);

  root.innerHTML = `
    <div class="section-title">Your card</div>
    <div class="panel profile-card">
      <div class="profile-card-name">
        ${escapeHtml(s.name || 'Anonymous')}
        <span class="player-tag">#${escapeHtml(s.tag || '----')}</span>
      </div>
      ${chosen.length ? `
        <div class="profile-badges">
          ${chosen.map(b => `
            <span class="profile-badge" title="${escapeHtml(b.desc)}">
              <span class="profile-badge-icon">${b.icon}</span>${escapeHtml(b.name)}
            </span>`).join('')}
        </div>` : `
        <p class="hint" style="color:var(--muted);font-size:.78rem;margin:8px 0 0">
          No badges chosen yet — pick up to ${MAX_BADGES} below. This is what
          everyone sees when they open you from a leaderboard.
        </p>`}
    </div>

    <div class="section-title">Badges — choose up to ${MAX_BADGES}</div>
    <div class="panel">
      <div class="badge-grid" id="badge-grid"></div>
    </div>

    <div class="section-title">Friend requests</div>
    <div class="panel" id="requests-panel">
      <div class="setting-row" style="border:none">
        <div class="hint">${isConfigured() ? 'Checking…' : 'Offline — requests need a connection.'}</div>
      </div>
    </div>

    <div class="section-title">Friends</div>
    <div class="panel">
      <div class="setting-row">
        <div>
          <div class="label">Pool bonus</div>
          <div class="hint">${counting} of ${FRIEND_BONUS_MAX_FRIENDS} counting — each adds +${FRIEND_BONUS_PER_FRIEND} to every drop</div>
        </div>
        <span class="num" style="font-weight:800;color:var(--success)">+${counting * FRIEND_BONUS_PER_FRIEND}/drop</span>
      </div>
      ${friends.length ? friends.map(f => `
        <div class="setting-row">
          <div class="label">${escapeHtml(f.name || 'Anonymous')} <span class="player-tag">#${escapeHtml(f.tag || '----')}</span></div>
          <button class="btn" data-remove-friend="${escapeHtml(f.uid)}">Remove</button>
        </div>`).join('') : `
        <div class="setting-row" style="border:none">
          <div class="hint">No friends yet — open someone on a leaderboard and send a request.</div>
        </div>`}
    </div>`;

  wireBadgePicker(root);
  wireFriendRemoval(root);
  if (isConfigured()) fillRequests(root);
}

function wireBadgePicker(root) {
  const grid = root.querySelector('#badge-grid');
  if (!grid) return;
  const s = getState();

  for (const b of BADGES) {
    const earned = (() => { try { return b.earned(s); } catch { return false; } })();
    const picked = s.badges.includes(b.id);

    const btn = document.createElement('button');
    btn.className = `badge-pick ${picked ? 'picked' : ''} ${earned ? '' : 'locked'}`;
    btn.title = b.desc;
    btn.innerHTML = `<span class="bp-icon">${b.icon}</span><span class="bp-name">${escapeHtml(b.name)}</span>`;
    btn.onclick = () => {
      if (!earned) { Audio.error(); toast('Not earned yet', 'lose'); return; }
      const result = toggleBadge(b.id);
      if (result === false && !getState().badges.includes(b.id)) {
        Audio.error();
        toast(`Only ${MAX_BADGES} badges — remove one first`, 'lose');
        return;
      }
      Audio.click();
      queueSync(true);
      renderProfile(root);
    };
    grid.appendChild(btn);
  }
}

function wireFriendRemoval(root) {
  root.querySelectorAll('[data-remove-friend]').forEach(btn => {
    btn.onclick = () => {
      removeFriend(btn.dataset.removeFriend);
      Audio.click();
      toast('Friend removed');
      queueSync(true);
      renderProfile(root);
    };
  });
}

async function fillRequests(root) {
  const panel = root.querySelector('#requests-panel');
  if (!panel) return;

  const { incoming, outgoing } = await loadRequests();
  const waiting = outgoing.filter(r => r.status === 'pending');
  if (!panel.isConnected) return;   // player navigated away mid-fetch

  if (!incoming.length && !waiting.length) {
    panel.innerHTML = `
      <div class="setting-row" style="border:none">
        <div class="hint">Nothing waiting. Requests you send or receive show up here.</div>
      </div>`;
    return;
  }

  panel.innerHTML = `
    ${incoming.map((r, i) => `
      <div class="setting-row">
        <div>
          <div class="label">${escapeHtml(r.fromName)} <span class="player-tag">#${escapeHtml(r.fromTag)}</span></div>
          <div class="hint">wants to be friends</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="btn btn-primary" data-accept="${i}">Accept</button>
          <button class="btn" data-decline="${i}">Decline</button>
        </div>
      </div>`).join('')}
    ${waiting.map((r, i) => `
      <div class="setting-row">
        <div>
          <div class="label">${escapeHtml(r.toName)} <span class="player-tag">#${escapeHtml(r.toTag)}</span></div>
          <div class="hint">request sent — waiting on them</div>
        </div>
        <button class="btn" data-cancel="${i}">Cancel</button>
      </div>`).join('')}`;

  panel.querySelectorAll('[data-accept]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      const req = incoming[Number(btn.dataset.accept)];
      await acceptRequest(req);
      Audio.buy();
      toast(`${req.fromName} is now a friend`, 'win');
      queueSync(true);
      renderProfile(root);
    };
  });
  panel.querySelectorAll('[data-decline]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await declineRequest(incoming[Number(btn.dataset.decline)]);
      Audio.click();
      renderProfile(root);
    };
  });
  panel.querySelectorAll('[data-cancel]').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      await cancelRequest(waiting[Number(btn.dataset.cancel)]);
      Audio.click();
      renderProfile(root);
    };
  });
}
