import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useNotes } from '../hooks/useNotes';
import { useTasks } from '../hooks/useTasks';
import { useEvents } from '../hooks/useEvents';
import { supabase } from '../lib/supabase';
import { downscaleImage } from '../lib/image';
import CaptureReview from '../components/capture/CaptureReview';

// App-wide "capture anything" — a photo OR screenshot from the gallery goes to
// Claude, which classifies it (event / task / list / note) and extracts details;
// the review sheet confirms + routes it. Available anywhere via useCapture().
const Ctx = createContext({ openCapture: () => {}, scanning: false });
export const useCapture = () => useContext(Ctx);

export function CaptureProvider({ children }) {
  const { household, activeMemberId, members } = useApp();
  const { notes, add, update } = useNotes(household?.id);
  const { addTask } = useTasks(household?.id);
  const { addEvent } = useEvents(household?.id);
  const inputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [capture, setCapture] = useState(null);

  const mkItems = (arr) => arr.map((text, i) => ({ id: `i-${Date.now()}-${i}`, text, done: false }));
  const openCapture = useCallback(() => inputRef.current?.click(), []);

  const onFile = async (e) => {
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

  const handlers = {
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
    <Ctx.Provider value={{ openCapture, scanning }}>
      {children}
      {/* No `capture` attr → the picker offers camera OR photo library (screenshots). */}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {scanning && (
        <div className="fixed inset-x-0 bottom-28 z-[130] flex justify-center px-4">
          <span className="rounded-full bg-text px-4 py-2 text-sm font-medium text-white shadow-lg">Reading your photo…</span>
        </div>
      )}
      {capture && (
        <CaptureReview
          initial={capture}
          members={members}
          lists={notes.filter((n) => n.kind === 'list')}
          defaultMemberId={activeMemberId}
          handlers={handlers}
          onClose={() => setCapture(null)}
        />
      )}
    </Ctx.Provider>
  );
}
