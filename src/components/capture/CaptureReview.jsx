import { useMemo, useState } from 'react';
import { CalendarClock, CheckSquare, ListChecks, StickyNote, X } from 'lucide-react';

const KINDS = [
  { k: 'event', label: 'Event', icon: CalendarClock },
  { k: 'task', label: 'Task', icon: CheckSquare },
  { k: 'list', label: 'List', icon: ListChecks },
  { k: 'note', label: 'Note', icon: StickyNote },
];

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Confirm/adjust what the capture read, then route it to the right place.
export default function CaptureReview({ initial, members, lists, defaultMemberId, handlers, onClose }) {
  const matchedMember = members.find((m) => m.name?.toLowerCase() === (initial.who || '').toLowerCase());
  const matchedList = lists.find((l) => l.title?.toLowerCase() === (initial.listMatch || '').toLowerCase());

  const [kind, setKind] = useState(initial.kind || 'note');
  const [title, setTitle] = useState(initial.title || '');
  const [date, setDate] = useState(initial.date || todayISO());
  const [time, setTime] = useState(initial.time || '09:00');
  const [minutes, setMinutes] = useState(initial.minutes || 60);
  const [notes, setNotes] = useState(initial.notes || (initial.location ? `At ${initial.location}` : ''));
  const [dueDate, setDueDate] = useState(initial.due_date || '');
  const [whoId, setWhoId] = useState(matchedMember?.id || defaultMemberId || members[0]?.id || '');
  const [itemsText, setItemsText] = useState((initial.items || []).join('\n'));
  const [listTarget, setListTarget] = useState(matchedList?.id || '__new__');
  const [body, setBody] = useState(initial.body || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const items = useMemo(() => itemsText.split('\n').map((s) => s.trim()).filter(Boolean), [itemsText]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      if (kind === 'event') {
        const start = new Date(`${date}T${time || '09:00'}`);
        const end = new Date(start.getTime() + (Number(minutes) || 60) * 60_000);
        await handlers.createEvent({ title: title.trim() || 'Event', member_id: whoId || null, starts_at: start.toISOString(), ends_at: end.toISOString(), notes: notes || null });
      } else if (kind === 'task') {
        await handlers.createTask({ title: title.trim() || 'Task', assigned_to: whoId || null, due_date: dueDate || null });
      } else if (kind === 'list') {
        if (!items.length) throw new Error('Add at least one item.');
        if (listTarget === '__new__') await handlers.createList({ title: title.trim() || 'New list', items });
        else await handlers.appendList(listTarget, items);
      } else {
        await handlers.createNote({ title: title.trim() || 'Note', body });
      }
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="cd-dialog-backdrop" onClick={onClose}>
      <div className="cd-dialog max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text">Review capture</h3>
          <button onClick={onClose} className="text-text-3 hover:text-text"><X className="h-5 w-5" /></button>
        </div>

        {/* Type switcher */}
        <div className="mb-3 flex gap-1.5">
          {KINDS.map((o) => (
            <button key={o.k} onClick={() => setKind(o.k)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-btn border px-1 py-2 text-xs transition-colors ${kind === o.k ? 'border-[#e08a3c] bg-surface-1 font-semibold text-text' : 'border-surface-3 text-text-2 hover:bg-surface-1'}`}>
              <o.icon className="h-4 w-4" /> {o.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="cd-input" />

          {kind === 'event' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cd-input !w-auto !py-2" />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="cd-input !w-auto !py-2" />
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="cd-input !w-auto !py-2">
                  {[30, 45, 60, 90, 120, 180, 240].map((n) => (<option key={n} value={n}>{n < 60 ? `${n}m` : `${n / 60}h`}</option>))}
                </select>
              </div>
              <WhoSelect members={members} value={whoId} onChange={setWhoId} />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Details / location" className="cd-input resize-none" />
            </>
          )}

          {kind === 'task' && (
            <div className="flex flex-wrap items-center gap-2">
              <WhoSelect members={members} value={whoId} onChange={setWhoId} />
              <label className="flex items-center gap-2 text-sm text-text-2">due
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="cd-input !w-auto !py-2" />
              </label>
            </div>
          )}

          {kind === 'list' && (
            <>
              <label className="flex items-center gap-2 text-sm text-text">
                <span className="cd-mono-label shrink-0">save to</span>
                <select value={listTarget} onChange={(e) => setListTarget(e.target.value)} className="cd-input min-w-0 flex-1 !py-2">
                  <option value="__new__">➕ New list</option>
                  {lists.map((l) => (<option key={l.id} value={l.id}>{l.title || 'Untitled list'}</option>))}
                </select>
              </label>
              <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={Math.min(12, Math.max(4, items.length + 1))}
                placeholder="One item per line" className="cd-input resize-none font-mono text-sm" />
              <p className="cd-mono-label">{items.length} item{items.length === 1 ? '' : 's'}{listTarget !== '__new__' ? ' → appended' : ''}</p>
            </>
          )}

          {kind === 'note' && (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Note text" className="cd-input resize-none" />
          )}

          {err && <p className="text-sm text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="cd-btn cd-btn--accent cd-btn--kiosk disabled:opacity-60">
            {saving ? 'Saving…' : `Save ${kind}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhoSelect({ members, value, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-text">
      <span className="cd-mono-label shrink-0">who</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cd-input !w-auto !py-2">
        <option value="">Anyone</option>
        {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
      </select>
    </label>
  );
}
