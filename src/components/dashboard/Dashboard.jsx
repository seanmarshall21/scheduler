import { useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Check, GripVertical, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useApp } from '../../context/AppContext';
import { WIDGETS, DEFAULT_LAYOUT, DEFAULT_VISIBLE, loadPresets, savePresets, newPreset } from '../../lib/dashboard';
import ClockWidget from './widgets/ClockWidget';
import AgendaWidget from './widgets/AgendaWidget';
import TasksWidget from './widgets/TasksWidget';
import NudgesWidget from './widgets/NudgesWidget';
import FridgeWidget from './widgets/FridgeWidget';
import NotesWidget from './widgets/NotesWidget';

const RGL = WidthProvider(Responsive);
const RENDER = { clock: ClockWidget, agenda: AgendaWidget, tasks: TasksWidget, nudges: NudgesWidget, fridge: FridgeWidget, notes: NotesWidget };

// The kitchen dashboard — multiple NAMED layouts per device you can switch
// between (e.g. Morning / Kiosk / Weekend). Tap Edit to drag/resize/add/remove;
// changes save live to the active layout.
export default function Dashboard() {
  const { household } = useApp();
  const hid = household?.id;
  const [store, setStore] = useState(() => loadPresets(hid)); // { activeId, presets }
  const [editing, setEditing] = useState(false);

  const { presets } = store;
  const active = presets.find((p) => p.id === store.activeId) || presets[0];
  const { layouts, visible } = active;

  const commit = (next) => { setStore(next); savePresets(hid, next); };
  const updateActive = (patch) => commit({ ...store, presets: presets.map((p) => (p.id === active.id ? { ...p, ...patch } : p)) });

  const onLayoutChange = (_current, allLayouts) => updateActive({ layouts: allLayouts });

  const addWidget = (k) => {
    if (visible.includes(k)) return;
    const lg = layouts.lg || [];
    const maxY = lg.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    const def = DEFAULT_LAYOUT.lg.find((d) => d.i === k) || { i: k, w: 4, h: 5, minW: 2, minH: 3 };
    updateActive({ visible: [...visible, k], layouts: { ...layouts, lg: [...lg.filter((it) => it.i !== k), { ...def, x: 0, y: maxY }] } });
  };
  const removeWidget = (k) => updateActive({ visible: visible.filter((x) => x !== k) });

  const switchTo = (id) => commit({ ...store, activeId: id });
  const addLayout = () => { const p = newPreset(`Layout ${presets.length + 1}`, active); commit({ activeId: p.id, presets: [...presets, p] }); setEditing(true); };
  const renameActive = () => { const name = window.prompt('Layout name', active.name); if (name && name.trim()) updateActive({ name: name.trim() }); };
  const deleteActive = () => { if (presets.length <= 1) return; const rest = presets.filter((p) => p.id !== active.id); commit({ activeId: rest[0].id, presets: rest }); };
  const resetActive = () => updateActive({ layouts: DEFAULT_LAYOUT, visible: DEFAULT_VISIBLE });

  const hidden = Object.keys(WIDGETS).filter((k) => !visible.includes(k));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Named-layout switcher + edit toggle */}
      <div className="flex items-center gap-2 px-3 pt-3 md:px-4">
        <div className="cd-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => switchTo(p.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${p.id === active.id ? 'border-[#e08a3c] bg-surface-1 text-text' : 'border-surface-3 text-text-2 hover:bg-surface-1'}`}
            >
              {p.name}
            </button>
          ))}
          <button onClick={addLayout} aria-label="New layout" title="New layout" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-surface-3 text-text-3 hover:bg-surface-1"><Plus className="h-4 w-4" /></button>
        </div>
        <div data-tour="dash-edit" className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <button onClick={() => setEditing(false)} className="cd-btn cd-btn--accent flex items-center gap-1.5 text-sm"><Check className="h-4 w-4" /> Done</button>
          ) : (
            <button onClick={() => setEditing(true)} className="cd-btn cd-btn--secondary flex items-center gap-1.5 text-sm"><Pencil className="h-4 w-4" /> Edit</button>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 pt-2 md:px-4">
          <span className="cd-mono-label">“{active.name}” —</span>
          <button onClick={renameActive} className="rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1">rename</button>
          <button onClick={resetActive} className="flex items-center gap-1 rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1"><RotateCcw className="h-3 w-3" /> reset</button>
          {presets.length > 1 && (
            <button onClick={deleteActive} className="flex items-center gap-1 rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1 hover:text-red-500"><Trash2 className="h-3 w-3" /> delete</button>
          )}
          {hidden.length > 0 && (
            <>
              <span className="cd-mono-label ml-1">add:</span>
              {hidden.map((k) => (
                <button key={k} onClick={() => addWidget(k)} className="flex items-center gap-1 rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1">
                  <Plus className="h-3.5 w-3.5" /> {WIDGETS[k].title}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="cd-scroll min-h-0 flex-1 overflow-auto px-1 pb-20 md:pb-2">
        <RGL
          key={active.id}
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={40}
          margin={[12, 12]}
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag"
          onLayoutChange={onLayoutChange}
          compactType="vertical"
        >
          {visible.map((k) => {
            const W = RENDER[k];
            if (!W) return null;
            return (
              <div key={k} className={`cd-card flex min-h-0 flex-col !p-0 ${editing ? 'ring-1 ring-[#e08a3c]/50' : ''}`}>
                {editing && (
                  <div className="widget-drag flex shrink-0 cursor-move items-center justify-between gap-2 rounded-t-card border-b border-surface-3 bg-surface-1 px-2 py-1">
                    <span className="flex items-center gap-1 text-xs font-bold text-text"><GripVertical className="h-3.5 w-3.5 text-text-3" /> {WIDGETS[k].title}</span>
                    <button onClick={() => removeWidget(k)} aria-label="Remove" className="flex h-6 w-6 items-center justify-center rounded-full text-text-3 hover:bg-surface-2 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                <div className={`min-h-0 flex-1 overflow-auto p-3 ${editing ? 'pointer-events-none select-none opacity-95' : ''}`}>
                  <W />
                </div>
              </div>
            );
          })}
        </RGL>
      </div>
    </div>
  );
}
