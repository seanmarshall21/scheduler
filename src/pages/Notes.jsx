import { useState } from 'react';
import { Camera, Check, ChevronDown, ChevronRight, ListChecks, Loader2, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNotes } from '../hooks/useNotes';
import { useCapture } from '../context/CaptureContext';
import MarkdownView from '../components/notes/MarkdownView';
import NoteEditor from '../components/notes/NoteEditor';

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
  const editItem = (note, itemId, text) => update(note.id, { items: (note.items || []).map((i) => (i.id === itemId ? { ...i, text } : i)) });
  const [editingNoteId, setEditingNoteId] = useState(null);

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
              <div className="flex shrink-0 items-center gap-1">
                {n.kind === 'note' && editingNoteId !== n.id && (
                  <button onClick={() => setEditingNoteId(n.id)} aria-label="Edit" className="text-text-3 hover:text-text"><Pencil className="h-4 w-4" /></button>
                )}
                <button onClick={() => remove(n.id)} className="text-text-3 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {n.kind === 'note' ? (
              editingNoteId === n.id ? (
                <NoteEditor value={n.body || ''} onSave={(body) => { update(n.id, { body }); setEditingNoteId(null); }} onCancel={() => setEditingNoteId(null)} />
              ) : n.body ? (
                <MarkdownView>{n.body}</MarkdownView>
              ) : (
                <button onClick={() => setEditingNoteId(n.id)} className="text-left text-sm text-text-3">Tap to write…</button>
              )
            ) : (
              <ListBody note={n} onToggle={toggleItem} onAdd={addItem} onRemove={removeItem} onEditItem={editItem} />
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

const COLLAPSE_KEY = 'commons.list.collapsed';
const loadCollapsed = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || []); } catch { return new Set(); } };
const persistCollapsed = (set) => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };

function ListBody({ note, onToggle, onAdd, onRemove, onEditItem }) {
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggleCollapse = (key) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    persistCollapsed(n);
    return n;
  });

  let sectionCollapsed = false; // items after a collapsed header are hidden until the next header
  return (
    <div className="flex flex-col gap-1">
      {(note.items || []).map((it) => {
        const header = headerLabel(it.text);
        if (header) {
          const key = `${note.id}:${it.id}`;
          sectionCollapsed = collapsed.has(key);
          return (
            <div key={it.id} className="mt-2 flex items-center gap-1.5 border-b border-surface-3 pb-1 first:mt-0">
              <button onClick={() => toggleCollapse(key)} aria-label={sectionCollapsed ? 'Expand' : 'Collapse'} className="shrink-0 text-text-3 hover:text-text">
                {sectionCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <input
                key={header}
                defaultValue={header}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== header) onEditItem?.(note, it.id, `## ${v}`); }}
                className="min-w-0 flex-1 bg-transparent text-xs font-bold uppercase tracking-wide text-text-2 focus:outline-none"
              />
              <button onClick={() => onRemove?.(note, it.id)} aria-label="Remove" className="shrink-0 text-text-3/50 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
            </div>
          );
        }
        if (sectionCollapsed) return null;
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
      <div className="mt-1 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Plus className="h-3.5 w-3.5 shrink-0 text-text-3" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) { onAdd(note, text.trim()); setText(''); }
            }}
            placeholder="add item…"
            className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-text-3 focus:outline-none"
          />
        </div>
        <button onClick={() => onAdd(note, '## New section')} className="shrink-0 font-mono text-[10px] uppercase text-text-3 hover:text-text">+ section</button>
      </div>
    </div>
  );
}
