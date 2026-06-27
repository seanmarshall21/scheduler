// Editable kitchen dashboard — widget registry + per-device layout persistence.
// Layouts are react-grid-layout's { breakpoint: [{i,x,y,w,h}] } and are stored
// per household, per device (localStorage) so each screen can be arranged on its
// own and toggled to its saved arrangement.
export const WIDGETS = {
  clock: { title: 'Clock' },
  agenda: { title: 'Today' },
  tasks: { title: 'Tasks' },
  nudges: { title: 'Heads up' },
  fridge: { title: 'Fridge' },
  notes: { title: 'Notes' },
};

export const DEFAULT_VISIBLE = ['clock', 'nudges', 'agenda', 'tasks', 'fridge', 'notes'];

export const DEFAULT_LAYOUT = {
  lg: [
    { i: 'clock', x: 0, y: 0, w: 7, h: 4, minW: 3, minH: 3 },
    { i: 'nudges', x: 7, y: 0, w: 5, h: 4, minW: 2, minH: 3 },
    { i: 'tasks', x: 7, y: 4, w: 5, h: 7, minW: 2, minH: 4 },
    { i: 'agenda', x: 0, y: 4, w: 7, h: 10, minW: 3, minH: 5 },
    { i: 'fridge', x: 7, y: 11, w: 5, h: 6, minW: 2, minH: 4 },
    { i: 'notes', x: 0, y: 14, w: 7, h: 2, minW: 2, minH: 2 },
  ],
};

const keyFor = (hid) => `commons.dashboard.${hid || 'default'}`;

export function loadDash(hid) {
  try {
    const raw = localStorage.getItem(keyFor(hid));
    if (raw) {
      const v = JSON.parse(raw);
      if (v?.layouts && Array.isArray(v?.visible)) return v;
    }
  } catch { /* ignore */ }
  return { layouts: DEFAULT_LAYOUT, visible: DEFAULT_VISIBLE };
}

export function saveDash(hid, data) {
  try { localStorage.setItem(keyFor(hid), JSON.stringify(data)); } catch { /* ignore */ }
}

export function resetDash(hid) {
  try { localStorage.removeItem(keyFor(hid)); } catch { /* ignore */ }
}
