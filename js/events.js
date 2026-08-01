const _listeners = {};
export const Events = {
  on(event, cb)  { (_listeners[event] ??= []).push(cb); },
  off(event, cb) { if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== cb); },
  emit(event, data) { (_listeners[event] ?? []).forEach(cb => { try { cb(data); } catch {} }); },
};
