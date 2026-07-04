import { useRef, useState } from 'react';
import { Camera, Check, ListChecks, Loader2, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNotes } from '../hooks/useNotes';
import { useTasks } from '../hooks/useTasks';
import { useEvents } from '../hooks/useEvents';
import { supabase } from '../lib/supabase';
import { downscaleImage } from '../lib/image';
import CaptureReview from '../components/capture/CaptureReview';

// Household notes + shared checklists everyone can add to / check off.
export default function Notes() {
  const { household, activeMemberId, members } = useApp();
  const { notes, add, update, toggleItem, addItem, remove } = useNotes(household?.id);
  const { addTask } = useTasks(household?.id);
  const { addEvent } = useEvents(household?.id);
  const [draft, setDraft] = useState('');
  const [scanning, setScanning] = useState(false);
  const [capture, setCapture] = useState(null);
  const scanInput = useRef(null);

  const mkItems = (arr) => arr.map((text, i) => ({ id: `i-${Date.now()}-${i}`, text, done: false }));

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

  // Snap a photo/screenshot of ANYTHING → classify → review sheet → route.
  const onScan = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanning(true);
    try {
      const image = await downscaleImage(file, 1600, 0.8);
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/.netlify/functions/capture', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          context: {
            today: new Date().toISOString().slice(0, 10),
            members: members.map((m) => ({ name: m.name })),
            lists: notes.filter((n) => n.kind === 'list').map((n) => ({ title: n.title })),
          },
        }),
      });
      const out = await res.json();
      if (out.error) { window.alert(out.error); return; }
      setCapture(out);
    } catch {
      window.alert('Scan failed — try again with a clearer photo.');
    } finally {
      setScanning(false);
    }
  };

  const captureHandlers = {
    createEvent: (row) => addEvent({ ...row, created_by: activeMemberId || null }),
    createTask: (row) => addTask({ ...row, created_by: activeMemberId || null }),
    createList: ({ title, items }) => add({ kind: 'list', title, items: mkItems(items), created_by: activeMemberId || null }),
    appendList: (noteId, items) => {
      const note = notes.find((n) => n.id === noteId);
      return update(noteId, { items: [...(note?.items || []), ...mkItems(items)] });
    },
    createNote: ({ title, body }) => add({ kind: 'note', title, body, created_by: activeMemberId || null }),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div data-tour="note-add" className="cd-card flex items-center gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Jot a note or start a list…"
          className="cd-input flex-1" onKeyDown={(e) => e.key === 'Enter' && addNote('note')} />
        <input ref={scanInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onScan} />
        <button onClick={() => scanInput.current?.click()} disabled={scanning} className="cd-btn cd-btn--secondary shrink-0 disabled:opacity-60" title="Scan anything — a list, note, plan, or to-do">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
        <button onClick={() => addNote('note')} className="cd-btn cd-btn--secondary shrink-0" title="Add note"><StickyNote className="h-4 w-4" /></button>
        <button onClick={() => addNote('list')} className="cd-btn cd-btn--accent shrink-0" title="Start list"><ListChecks className="h-4 w-4" /></button>
      </div>
      {scanning && <p className="cd-mono-label -mt-1 px-1">reading your photo…</p>}
      {capture && (
        <CaptureReview
          initial={capture}
          members={members}
          lists={notes.filter((n) => n.kind === 'list')}
          defaultMemberId={activeMemberId}
          handlers={captureHandlers}
          onClose={() => setCapture(null)}
        />
      )}

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
              <ListBody note={n} onToggle={toggleItem} onAdd={addItem} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListBody({ note, onToggle, onAdd }) {
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-1">
      {(note.items || []).map((it) => (
        <button key={it.id} onClick={() => onToggle(note, it.id)} className="flex items-center gap-2 rounded-md p-1 text-left hover:bg-surface-1">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${it.done ? 'border-transparent bg-text text-white' : 'border-surface-4'}`}>
            {it.done && <Check className="h-3 w-3" />}
          </span>
          <span className={`text-sm ${it.done ? 'text-text-3 line-through' : 'text-text'}`}>{it.text}</span>
        </button>
      ))}
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
