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

// v2: multiple NAMED layouts per device, { activeId, presets: [{id,name,layouts,visible}] }.
const uid = () => `p-${Math.random().toString(36).slice(2, 8)}`;
const V2_KEY = (hid) => `commons.dashboard.v2.${hid || 'default'}`;
const OLD_KEY = (hid) => `commons.dashboard.${hid || 'default'}`;

export function newPreset(name, base) {
  return {
    id: uid(),
    name: name || 'Layout',
    layouts: base?.layouts || DEFAULT_LAYOUT,
    visible: base?.visible || DEFAULT_VISIBLE,
  };
}

export function loadPresets(hid) {
  try {
    const raw = localStorage.getItem(V2_KEY(hid));
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v?.presets) && v.presets.length) return v;
    }
  } catch { /* ignore */ }
  // Migrate a v1 single layout if present, else start from the default.
  let base = { layouts: DEFAULT_LAYOUT, visible: DEFAULT_VISIBLE };
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY(hid)) || 'null');
    if (old?.layouts && Array.isArray(old?.visible)) base = { layouts: old.layouts, visible: old.visible };
  } catch { /* ignore */ }
  const preset = { id: 'default', name: 'Default', ...base };
  return { activeId: preset.id, presets: [preset] };
}

export function savePresets(hid, data) {
  try { localStorage.setItem(V2_KEY(hid), JSON.stringify(data)); } catch { /* ignore */ }
}
