/**
 * Leaderboards.
 *
 * Every board is the same collection ordered by a different field. Boards are
 * cached for a couple of minutes because the Firestore free tier allows 50k
 * reads a day and tab-flipping through eleven boards would otherwise cost 550
 * reads a minute.
 */

import { firebase, isConfigured } from './firebase.js';
import { MACHINES, MACHINE_BY_ID } from './machines.js';
import { getState } from './state.js';
import { fmt, fmtFull, fmtMult, escapeHtml, modal } from './ui.js';

const CACHE_MS = 120_000;
const cache = new Map();

export const BOARDS = [
  { id: 'biggestWin',     label: '💥 Biggest Win',     field: 'biggestWinAmount',  format: fmt,
    blurb: 'Largest single payout. Rewards big bets as much as luck.' },
  { id: 'biggestMulti',   label: '🚀 Biggest Multi',   field: 'biggestMultiplier', format: fmtMult,
    blurb: 'Largest multiplier, regardless of stake. The purest luck board.' },
  { id: 'peakBalance',    label: '🏦 Peak Balance',    field: 'peakBalance',       format: fmt,
    blurb: 'Highest balance ever held. Hard to hold onto in this economy.' },
  { id: 'megaWins',       label: '🔴 Mega Wins',       field: 'megaWins',          format: fmtFull,
    blurb: 'Count of 5,000x+ hits. Roughly 1 in 100,000 spins.' },
  { id: 'totalWagered',   label: '💸 Total Wagered',   field: 'totalWagered',      format: fmt,
    blurb: 'The grind board. Volume, not luck.' },
  { id: 'totalSpins',     label: '🎰 Total Spins',     field: 'totalSpins',        format: fmtFull,
    blurb: 'Sheer commitment.' },
  { id: 'streak',         label: '🔥 Win Streak',      field: 'longestWinStreak',  format: fmtFull,
    blurb: 'Consecutive paying spins. Anything past 6 is absurd.' },
  { id: 'achievements',   label: '🏅 Achievements',    field: 'achievements',      format: fmtFull,
    blurb: 'Completion.' },
  ...MACHINES.map(m => ({
    id: `machine_${m.id}`,
    label: `${m.owner}`,
    field: `perMachine.${m.id}.bestMulti`,
    format: fmtMult,
    blurb: `Best multiplier on ${m.name}.`,
  })),
];

let activeBoard = BOARDS[0].id;

async function fetchBoard(board) {
  const hit = cache.get(board.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;

  const fb = await firebase();
  if (!fb) return null;

  const q = fb.query(
    fb.collection(fb.db, 'players'),
    fb.orderBy(board.field, 'desc'),
    fb.limit(50)
  );
  const snap = await fb.getDocs(q);
  const rows = [];
  snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));

  cache.set(board.id, { at: Date.now(), rows });
  return rows;
}

function valueAt(row, path) {
  return path.split('.').reduce((o, k) => o?.[k], row) ?? 0;
}

export function renderLeaderboards(root) {
  root.innerHTML = `
    <div class="board-tabs" id="board-tabs"></div>
    <div id="board-body"></div>`;

  const tabs = document.getElementById('board-tabs');
  for (const b of BOARDS) {
    const btn = document.createElement('button');
    btn.className = `board-tab ${b.id === activeBoard ? 'active' : ''}`;
    btn.textContent = b.label;
    btn.onclick = () => {
      activeBoard = b.id;
      tabs.querySelectorAll('.board-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      drawBoard();
    };
    tabs.appendChild(btn);
  }
  drawBoard();
}

async function drawBoard() {
  const body = document.getElementById('board-body');
  if (!body) return;
  const board = BOARDS.find(b => b.id === activeBoard);

  if (!isConfigured()) {
    body.innerHTML = `
      <div class="offline-note">
        Firebase isn't configured yet, so global boards are offline. Your records
        are still being tracked locally and will upload once it's connected —
        see <strong>FIREBASE.md</strong>.
      </div>
      ${renderLocalOnly(board)}`;
    return;
  }

  body.innerHTML = `<div class="empty">Loading ${escapeHtml(board.label)}…</div>`;

  let rows;
  try {
    rows = await fetchBoard(board);
  } catch (err) {
    body.innerHTML = `<div class="offline-note">Couldn't reach the leaderboard: ${escapeHtml(err?.message ?? 'unknown error')}</div>${renderLocalOnly(board)}`;
    return;
  }

  if (!rows) {
    body.innerHTML = `<div class="offline-note">Offline — showing your local record only.</div>${renderLocalOnly(board)}`;
    return;
  }

  const fb = (await firebase());
  const myUid = fb?.uid;
  const ranked = rows.filter(r => valueAt(r, board.field) > 0);

  if (!ranked.length) {
    body.innerHTML = `<p style="color:var(--muted);font-size:.8rem;margin-bottom:12px">${escapeHtml(board.blurb)}</p>
      <div class="empty">Nobody's on this board yet. Be the first.</div>`;
    return;
  }

  body.innerHTML = `
    <p style="color:var(--muted);font-size:.8rem;margin:0 0 12px">${escapeHtml(board.blurb)}</p>
    <div class="table">
      ${ranked.map((r, i) => {
        const isMe = r.id === myUid;
        const canReplay = board.id === 'biggestWin' || board.id === 'biggestMulti';
        const win = r.biggestWin;
        return `
          <div class="lb-row ${isMe ? 'me' : ''} ${canReplay && win?.grid ? 'clickable' : ''}"
               ${canReplay && win?.grid ? `data-replay="${i}"` : ''}>
            <span class="lb-rank">#${i + 1}</span>
            <span>
              <div class="lb-name">${escapeHtml(r.name ?? 'Anonymous')}${isMe ? ' <small style="color:var(--trim)">(you)</small>' : ''}</div>
              ${win && canReplay ? `<div class="lb-meta">${escapeHtml(MACHINE_BY_ID[win.machineId]?.owner ?? '')} · bet ${fmtFull(win.bet ?? 0)}</div>` : ''}
            </span>
            <span class="lb-value">${board.format(valueAt(r, board.field))}</span>
          </div>`;
      }).join('')}
    </div>`;

  body.querySelectorAll('[data-replay]').forEach(el => {
    el.onclick = () => showReplay(ranked[Number(el.dataset.replay)]);
  });
}

/** Fallback panel when Firestore isn't reachable — your own number, at least. */
function renderLocalOnly(board) {
  const s = getState();
  const local = {
    biggestWin: s.biggestWin?.amount ?? 0,
    biggestMulti: s.biggestMultiplier,
    peakBalance: s.peakBalance,
    totalWagered: s.totalWagered,
    totalSpins: s.totalSpins,
    streak: s.longestWinStreak,
    achievements: s.achievements.length,
    megaWins: MACHINES.reduce((t, m) => t + (s.perMachine[m.id]?.bands?.mega ?? 0), 0),
  }[board.id] ?? (board.id.startsWith('machine_')
    ? s.perMachine[board.id.slice(8)]?.biggestMultiplier ?? 0
    : 0);

  return `
    <div class="table">
      <div class="lb-row me">
        <span class="lb-rank">#—</span>
        <span><div class="lb-name">${escapeHtml(s.name || 'You')}</div>
        <div class="lb-meta">Local record</div></span>
        <span class="lb-value">${board.format(local)}</span>
      </div>
    </div>`;
}

/**
 * The best part of the whole feature: click a row and see the exact reels that
 * paid. The grid is stored with the record for precisely this.
 */
function showReplay(row) {
  const win = row.biggestWin;
  if (!win?.grid) return;
  const machine = MACHINE_BY_ID[win.machineId];
  if (!machine) return;

  const glyph = key => machine.symbols.find(s => s.key === key)?.glyph ?? '❔';
  const cols = [];
  for (let r = 0; r < 5; r++) {
    const cells = win.grid.slice(r * 3, r * 3 + 3);
    cols.push(`<div class="replay-col">${cells.map(k => `<div class="replay-cell">${glyph(k)}</div>`).join('')}</div>`);
  }

  modal(`
    <h3>${escapeHtml(row.name ?? 'Anonymous')}</h3>
    <p style="color:var(--muted);font-size:.84rem;margin:0">
      ${escapeHtml(machine.name)} · bet ${fmtFull(win.bet)} ·
      ${win.at ? new Date(win.at).toLocaleDateString() : ''}
    </p>
    <div class="replay-grid">${cols.join('')}</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-family:var(--font-mono);font-size:1.6rem;font-weight:800;color:var(--win-big)">
        ${fmt(win.amount)}
      </span>
      <span style="font-family:var(--font-mono);font-weight:800;color:var(--win-mega)">
        ${fmtMult(win.multiplier)}
      </span>
    </div>`);
}

export function invalidateBoards() {
  cache.clear();
}
