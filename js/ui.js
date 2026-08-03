/** Shared UI helpers: formatting, toasts, modals, and the count-up. */

const toastRoot = () => document.getElementById('toasts');

export function fmt(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return sign + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6)  return sign + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3)  return sign + (a / 1e3).toFixed(1) + 'K';
  return sign + Math.round(a).toLocaleString();
}

export function fmtFull(n) {
  return Math.round(n).toLocaleString();
}

export function fmtMult(m) {
  if (m === 0) return '0x';
  return (m < 10 ? m.toFixed(2).replace(/\.?0+$/, '') : Math.round(m).toLocaleString()) + 'x';
}

export function fmtPct(n, digits = 1) {
  return (n * 100).toFixed(digits) + '%';
}

export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toast(message, kind = '', ttl = 2600) {
  const root = toastRoot();
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ttl);
  // Never let a backlog build up during autospin.
  while (root.children.length > 4) root.firstChild.remove();
}

/**
 * Numbers always climb — never snap to the final value. This is most of the
 * reason a win feels like a win.
 */
export function countUp(el, from, to, ms = 700, format = fmt) {
  if (document.documentElement.dataset.motion === 'reduced' || ms <= 0) {
    el.textContent = format(to);
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const step = now => {
    const t = Math.min(1, (now - start) / ms);
    // easeOutExpo: fast climb, long settle.
    const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    el.textContent = format(from + (to - from) * eased);
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function modal(html, { onMount } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  onMount?.(backdrop.firstElementChild, close);
  return close;
}

export function confirmDialog(title, body, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    modal(
      `<h3>${title}</h3><p style="color:var(--muted);font-size:.9rem;line-height:1.5">${body}</p>
       <div style="display:flex;gap:10px;margin-top:20px">
         <button class="btn" data-act="cancel" style="flex:1">Cancel</button>
         <button class="btn btn-primary" data-act="ok" style="flex:1">${confirmLabel}</button>
       </div>`,
      {
        onMount(el, close) {
          el.querySelector('[data-act="cancel"]').onclick = () => { close(); resolve(false); };
          el.querySelector('[data-act="ok"]').onclick = () => { close(); resolve(true); };
        },
      }
    );
  });
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
