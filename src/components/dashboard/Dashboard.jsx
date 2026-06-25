import { useState } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { Check, GripVertical, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useApp } from '../../context/AppContext';
import { WIDGETS, DEFAULT_LAYOUT, DEFAULT_VISIBLE, loadDash, saveDash, resetDash } from '../../lib/dashboard';
import ClockWidget from './widgets/ClockWidget';
import AgendaWidget from './widgets/AgendaWidget';
import TasksWidget from './widgets/TasksWidget';
import FridgeWidget from './widgets/FridgeWidget';
import NotesWidget from './widgets/NotesWidget';

const RGL = WidthProvider(Responsive);
const RENDER = { clock: ClockWidget, agenda: AgendaWidget, tasks: TasksWidget, fridge: FridgeWidget, notes: NotesWidget };

// The glanceable, rearrangeable kitchen dashboard. Tap Edit to drag, resize,
// add or remove widgets; the arrangement is saved per device (and per screen
// size) so each screen keeps its own layout.
export default function Dashboard() {
  const { household } = useApp();
  const hid = household?.id;
  const [state, setState] = useState(() => loadDash(hid));
  const [editing, setEditing] = useState(false);

  const { layouts, visible } = state;

  const onLayoutChange = (_current, allLayouts) =>
    setState((s) => ({ ...s, layouts: allLayouts }));

  const addWidget = (k) =>
    setState((s) => {
      if (s.visible.includes(k)) return s;
      const lg = s.layouts.lg || [];
      const maxY = lg.reduce((m, it) => Math.max(m, it.y + it.h), 0);
      const def = DEFAULT_LAYOUT.lg.find((d) => d.i === k) || { i: k, w: 4, h: 5, minW: 2, minH: 3 };
      return {
        visible: [...s.visible, k],
        layouts: { ...s.layouts, lg: [...lg.filter((it) => it.i !== k), { ...def, x: 0, y: maxY }] },
      };
    });

  const removeWidget = (k) => setState((s) => ({ ...s, visible: s.visible.filter((x) => x !== k) }));

  const done = () => { saveDash(hid, state); setEditing(false); };
  const reset = () => { resetDash(hid); setState({ layouts: DEFAULT_LAYOUT, visible: DEFAULT_VISIBLE }); };

  const hidden = Object.keys(WIDGETS).filter((k) => !visible.includes(k));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 md:px-4">
        <span className="cd-mono-label">{editing ? 'editing — drag, resize, add or remove' : ''}</span>
        <div data-tour="dash-edit" className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button onClick={reset} className="cd-btn cd-btn--ghost flex items-center gap-1.5 text-sm"><RotateCcw className="h-4 w-4" /> Reset</button>
              <button onClick={done} className="cd-btn cd-btn--accent flex items-center gap-1.5 text-sm"><Check className="h-4 w-4" /> Done</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="cd-btn cd-btn--secondary flex items-center gap-1.5 text-sm"><Pencil className="h-4 w-4" /> Edit</button>
          )}
        </div>
      </div>

      {editing && hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 pt-1 md:px-4">
          <span className="cd-mono-label">add:</span>
          {hidden.map((k) => (
            <button key={k} onClick={() => addWidget(k)} className="flex items-center gap-1 rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1">
              <Plus className="h-3.5 w-3.5" /> {WIDGETS[k].title}
            </button>
          ))}
        </div>
      )}

      <div className="cd-scroll min-h-0 flex-1 overflow-auto px-1 pb-20 md:pb-2">
        <RGL
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
