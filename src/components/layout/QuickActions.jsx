import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Camera, Check, CheckSquare, ChevronDown, ChevronUp, ListChecks, Pencil, PenLine, Plus, Sparkles, StickyNote, X, Zap } from 'lucide-react';
import { useCapture } from '../../context/CaptureContext';

// Registry of everything Quick Actions can do. `run(ctx)` gets navigate +
// openCapture + onAssistant.
const ALL = {
  capture: { title: 'Capture', sub: 'Photo or screenshot → event, list, task or note', Icon: Camera, run: (c) => c.openCapture() },
  ask: { title: 'Ask Commons', sub: 'Talk or type to your assistant', Icon: Sparkles, run: (c) => c.onAssistant() },
  event: { title: 'New event', sub: 'Add to the calendar', Icon: CalendarPlus, run: (c) => c.navigate('/calendar') },
  task: { title: 'New task', sub: 'Add a shared to-do', Icon: CheckSquare, run: (c) => c.navigate('/tasks') },
  list: { title: 'New list or note', sub: 'Jot or start a checklist', Icon: ListChecks, run: (c) => c.navigate('/notes') },
  note: { title: 'Household notes', sub: 'Open notes & lists', Icon: StickyNote, run: (c) => c.navigate('/notes') },
  fridge: { title: 'The fridge', sub: 'Draw or leave a note', Icon: PenLine, run: (c) => c.navigate('/fridge') },
};
const DEFAULT_KEYS = ['capture', 'ask', 'event', 'task', 'list'];
const QA_KEY = 'commons.quickActions';

function loadKeys() {
  try {
    const raw = JSON.parse(localStorage.getItem(QA_KEY));
    if (Array.isArray(raw) && raw.length) return raw.filter((k) => ALL[k]);
  } catch { /* ignore */ }
  return DEFAULT_KEYS;
}
function saveKeys(keys) {
  try { localStorage.setItem(QA_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
}

// Center-footer "Quick actions" drawer — customizable per device.
export default function QuickActions({ open, onClose, onAssistant }) {
  const navigate = useNavigate();
  const { openCapture } = useCapture();
  const [keys, setKeys] = useState(loadKeys);
  const [editing, setEditing] = useState(false);

  if (!open) return null;

  const ctx = { navigate, openCapture, onAssistant };
  const run = (key) => { onClose(); ALL[key].run(ctx); };
  const disabled = Object.keys(ALL).filter((k) => !keys.includes(k));

  const move = (i, dir) => setKeys((cur) => {
    const j = i + dir;
    if (j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const removeKey = (k) => setKeys((cur) => cur.filter((x) => x !== k));
  const addKey = (k) => setKeys((cur) => [...cur, k]);
  const done = () => { saveKeys(keys); setEditing(false); };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={editing ? undefined : onClose} />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-auto rounded-t-2xl border border-surface-3 bg-bg p-3 pb-safe shadow-xl sm:mb-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-base font-bold text-text">
            <Zap className="h-4 w-4" style={{ color: '#e08a3c' }} /> {editing ? 'Edit quick actions' : 'Quick actions'}
          </h3>
          <div className="flex items-center gap-1">
            {editing ? (
              <button onClick={done} className="cd-btn cd-btn--accent flex items-center gap-1 !py-1 text-sm"><Check className="h-4 w-4" /> Done</button>
            ) : (
              <button onClick={() => setEditing(true)} aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><Pencil className="h-4 w-4" /></button>
            )}
            <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {!editing ? (
          <div className="flex flex-col gap-1.5">
            {keys.map((key) => {
              const a = ALL[key];
              return (
                <button key={key} onClick={() => run(key)} className="flex items-center gap-3 rounded-btn border border-surface-3 p-3 text-left transition-colors hover:bg-surface-1">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-1"><a.Icon className="h-5 w-5 text-text" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-text">{a.title}</span>
                    <span className="block truncate text-xs text-text-2">{a.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {keys.map((key, i) => {
                const a = ALL[key];
                return (
                  <div key={key} className="flex items-center gap-2 rounded-btn border border-surface-3 p-2">
                    <a.Icon className="h-4 w-4 shrink-0 text-text-2" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{a.title}</span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-surface-1 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === keys.length - 1} className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-surface-1 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                    <button onClick={() => removeKey(key)} aria-label="Remove" className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-surface-1 hover:text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
            {disabled.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-surface-2 pt-2">
                <span className="cd-mono-label">add:</span>
                {disabled.map((k) => (
                  <button key={k} onClick={() => addKey(k)} className="flex items-center gap-1 rounded-full border border-surface-3 px-2.5 py-1 text-xs text-text-2 hover:bg-surface-1">
                    <Plus className="h-3.5 w-3.5" /> {ALL[k].title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
