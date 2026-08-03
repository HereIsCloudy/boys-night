/** Minimal pub/sub. Everything that changes state emits; views listen. */

const listeners = new Map();

export const Events = {
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => Events.off(event, fn);
  },

  off(event, fn) {
    listeners.get(event)?.delete(fn);
  },

  emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (err) { console.error(`[events] ${event}`, err); }
    }
  },

  clear(event) {
    if (event) listeners.delete(event);
    else listeners.clear();
  },
};
