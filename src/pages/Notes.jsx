import { useState } from 'react';
import { Camera, Check, ListChecks, Loader2, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNotes } from '../hooks/useNotes';
import { useCapture } from '../context/CaptureContext';

// Household notes + shared checklists everyone can add to / check off.
export default function Notes() {
  const { household, activeMemberId } = useApp();
  const { notes, add, update, toggleItem, addItem, remove } = useNotes(household?.id);
  const { openCapture, scanning } = useCapture();
  const [draft, setDraft] = useState('');

  const addNote = (kind) => {
    if (kind === 'note' && !draft.trim()) return;
    add({
      kind,
      title: kind === 'list' ? draft.trim() || 'New list' : null,
      body: kind === 'note' ? draft.trim() : null,
      items: [],
      created_by: activeMemberId || null,
    });
    setDraft('');
  };

  const removeItem = (note, itemId) => update(note.id, { items: (note.items || []).filter((i) => i.id !== itemId) });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div data-tour="note-add" className="cd-card flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Jot a note or start a list…"
          className="cd-input flex-1" onKeyDown={(e) => e.key === 'Enter' && addNote('note')} />
        <button onClick={openCapture} disabled={scanning} className="cd-btn cd-btn--secondary shrink-0 disabled:opacity-60" title="Scan anything — a photo or screenshot of a list, note, plan, or to-do">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
        <button onClick={() => addNote('note')} className="cd-btn cd-btn--secondary shrink-0" title="Add note"><StickyNote className="h-4 w-4" /></button>
        <button onClick={() => addNote('list')} className="cd-btn cd-btn--accent shrink-0" title="Start list"><ListChecks className="h-4 w-4" /></button>
      </div>

      <div data-tour="note-grid" className="cd-scroll grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.length === 0 && <p className="cd-mono-label col-span-full py-10 text-center">nothing here yet</p>}
        {notes.map((n) => (
          <div key={n.id} className="cd-card flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              {n.kind === 'list' ? (
                <input
                  defaultValue={n.title || ''}
                  onBlur={(e) => e.target.value !== n.title && update(n.id, { title: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-text focus:outline-none"
                />
              ) : (
                <span className="cd-mono-label">note</span>
              )}
              <button onClick={() => remove(n.id)} className="text-text-3 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>

            {n.kind === 'note' ? (
              <textarea
                defaultValue={n.body || ''}
                onBlur={(e) => e.target.value !== n.body && update(n.id, { body: e.target.value })}
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-text focus:outline-none"
              />
            ) : (
              <ListBody note={n} onToggle={toggleItem} onAdd={addItem} onRemove={removeItem} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// A markdown-header line ("## Section" or a whole-line "**Section**") becomes a
// section separator, not a checkable item.
const headerLabel = (raw) => {
  const t = (raw || '').trim();
  const atx = t.match(/^#{1,6}\s+(.+?)\s*$/);
  if (atx) return atx[1];
  const bold = t.match(/^\*\*(.+?)\*\*:?\s*$/);
  if (bold) return bold[1];
  return null;
};
// Strip inline markdown emphasis / bullets for clean checklist display.
const cleanItem = (raw) => (raw || '')
  .replace(/^\s*[-*+]\s+/, '')
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .trim();

function ListBody({ note, onToggle, onAdd, onRemove }) {
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-1">
      {(note.items || []).map((it) => {
        const header = headerLabel(it.text);
        if (header) {
          return (
            <div key={it.id} className="mt-2 flex items-center gap-2 first:mt-0">
              <span className="cd-mono-label whitespace-nowrap">{header}</span>
              <span className="h-px flex-1 bg-surface-3" />
              <button onClick={() => onRemove?.(note, it.id)} aria-label="Remove" className="text-text-3/50 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          );
        }
        return (
          <div key={it.id} className="flex items-center gap-2 rounded-md p-1 hover:bg-surface-1">
            <button onClick={() => onToggle(note, it.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${it.done ? 'border-transparent bg-text text-white' : 'border-surface-4'}`}>
                {it.done && <Check className="h-3 w-3" />}
              </span>
              <span className={`text-sm ${it.done ? 'text-text-3 line-through' : 'text-text'}`}>{cleanItem(it.text)}</span>
            </button>
            <button onClick={() => onRemove?.(note, it.id)} aria-label="Remove" className="shrink-0 text-text-3/40 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
          </div>
        );
      })}
      <div className="mt-1 flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5 text-text-3" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onAdd(note, text.trim());
              setText('');
            }
          }}
          placeholder="add item…"
          className="flex-1 bg-transparent text-sm text-text placeholder:text-text-3 focus:outline-none"
        />
      </div>
    </div>
  );
}
