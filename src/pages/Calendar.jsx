import { useMemo, useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../hooks/useWorkSchedule';
import { useCalendars } from '../hooks/useCalendars';
import { useEvents, expandEvents } from '../hooks/useEvents';
import FamilyCalendar from '../components/calendar/FamilyCalendar';
import MemberChip from '../components/members/MemberChip';

const CATEGORIES = ['home', 'food', 'sport', 'school', 'social', 'travel', 'work'];
const CAL_COLORS = ['#3c8fe0', '#e0603c', '#3ca06a', '#9b5de5', '#e0a83c', '#e05c9e', '#3ca6a0'];
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function AddBlockSheet({ seed, members, defaultMemberId, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [memberId, setMemberId] = useState(seed.member_id || defaultMemberId || members[0]?.id || null);
  const [category, setCategory] = useState('home');
  const [minutes, setMinutes] = useState(60);

  const save = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), member_id: memberId, category, day: seed.day, start_min: seed.start_min, minutes });
    onClose();
  };

  return (
    <div className="cd-dialog-backdrop" onClick={onClose}>
      <div className="cd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text">New block</h3>
          <button onClick={onClose} className="text-text-3 hover:text-text"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Groceries, soccer practice…"
            className="cd-input" onKeyDown={(e) => e.key === 'Enter' && save()} />
          <div>
            <label className="cd-mono-label">Who</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {members.map((m) => (
                <button key={m.id} onClick={() => setMemberId(m.id)}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 transition-colors ${memberId === m.id ? 'border-text' : 'border-surface-3'}`}>
                  <MemberChip member={m} size={24} />
                  <span className="text-xs font-medium text-text">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="cd-mono-label">Category</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${category === c ? 'border-text bg-surface-1 text-text' : 'border-surface-3 text-text-2'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="cd-mono-label">Length</label>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="cd-input !w-auto !py-2">
              {[30, 45, 60, 90, 120, 180, 240].map((n) => (
                <option key={n} value={n}>{n < 60 ? `${n}m` : `${n / 60}h`}</option>
              ))}
            </select>
            <span className="cd-mono-label ml-auto">{seed.day}</span>
          </div>
          <button onClick={save} className="cd-btn cd-btn--accent cd-btn--kiosk">Add to calendar</button>
        </div>
      </div>
    </div>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');

function AddEventSheet({ event, calendars, members, defaultMemberId, addCalendar, addEvent, updateEvent, removeEvent, onClose }) {
  const editing = Boolean(event);
  const seedStart = editing ? new Date(event.starts_at) : null;
  const seedMinutes = editing && event.ends_at
    ? Math.max(15, Math.round((new Date(event.ends_at) - seedStart) / 60_000))
    : 60;

  const [title, setTitle] = useState(event?.title || '');
  const [calendarId, setCalendarId] = useState(event?.calendar_id || calendars[0]?.id || '__new__');
  const [newCalName, setNewCalName] = useState('');
  const [newCalColor, setNewCalColor] = useState(CAL_COLORS[0]);
  const [memberId, setMemberId] = useState(event?.member_id || defaultMemberId || members[0]?.id || null);
  const [date, setDate] = useState(editing ? `${seedStart.getFullYear()}-${pad2(seedStart.getMonth() + 1)}-${pad2(seedStart.getDate())}` : todayISO());
  const [time, setTime] = useState(editing ? `${pad2(seedStart.getHours())}:${pad2(seedStart.getMinutes())}` : '09:00');
  const [minutes, setMinutes] = useState(seedMinutes);
  const [repeat, setRepeat] = useState(event?.repeat || 'none');
  const [until, setUntil] = useState(event?.repeat_until || '');
  const [notes, setNotes] = useState(event?.notes || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const creatingCal = calendarId === '__new__';
  const lengthOptions = [...new Set([15, 30, 45, 60, 90, 120, 180, 240, minutes])].sort((a, b) => a - b);

  const save = async () => {
    if (!title.trim() || !memberId) return;
    setBusy(true);
    setErr(null);
    try {
      let calId = calendarId;
      if (creatingCal) {
        const cal = await addCalendar({ name: newCalName.trim() || 'Calendar', color: newCalColor, member_id: null });
        calId = cal.id;
      }
      const startsAt = new Date(`${date}T${time}`);
      const ends = new Date(startsAt.getTime() + minutes * 60_000);
      const row = {
        calendar_id: calId,
        member_id: memberId,
        title: title.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: ends.toISOString(),
        repeat,
        repeat_until: repeat !== 'none' && until ? until : null,
        notes: notes.trim() || null,
      };
      if (editing) await updateEvent(event.id, row);
      else await addEvent(row);
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    setBusy(true);
    setErr(null);
    try {
      await removeEvent(event.id);
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not delete.');
      setBusy(false);
    }
  };

  return (
    <div className="cd-dialog-backdrop" onClick={onClose}>
      <div className="cd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text">{editing ? 'Edit event' : 'New event'}</h3>
          <button onClick={onClose} className="text-text-3 hover:text-text"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Doctor appointment…" className="cd-input" />

          <div>
            <label className="cd-mono-label">Calendar</label>
            <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="cd-input mt-1.5">
              {calendars.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              <option value="__new__">+ New calendar…</option>
            </select>
          </div>
          {creatingCal && (
            <div className="flex items-center gap-2">
              <input value={newCalName} onChange={(e) => setNewCalName(e.target.value)} placeholder="Calendar name (e.g. Kids)" className="cd-input flex-1" />
              <div className="flex gap-1">
                {CAL_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewCalColor(c)}
                    className={`h-6 w-6 rounded-full ${newCalColor === c ? 'ring-2 ring-offset-1' : ''}`} style={{ backgroundColor: c }} aria-label={`color ${c}`} />
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="cd-mono-label">Who</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {members.map((m) => (
                <button key={m.id} onClick={() => setMemberId(m.id)}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 transition-colors ${memberId === m.id ? 'border-text' : 'border-surface-3'}`}>
                  <MemberChip member={m} size={24} />
                  <span className="text-xs font-medium text-text">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="cd-input !w-auto !py-2" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="cd-input !w-auto !py-2" />
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="cd-input !w-auto !py-2">
              {lengthOptions.map((n) => (<option key={n} value={n}>{n < 60 ? `${n}m` : `${n / 60}h`}</option>))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="cd-mono-label">Repeats</label>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className="cd-input !w-auto !py-2">
              {REPEATS.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
            {repeat !== 'none' && (
              <>
                <span className="cd-mono-label">until</span>
                <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="cd-input !w-auto !py-2" />
              </>
            )}
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className="cd-input" />

          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy || !title.trim() || (creatingCal && !newCalName.trim())} className="cd-btn cd-btn--accent cd-btn--kiosk flex-1">
              {busy ? 'Saving…' : editing ? 'Update event' : 'Add event'}
            </button>
            {editing && (
              <button onClick={del} disabled={busy} className="cd-btn cd-btn--ghost flex items-center gap-1.5 text-red-500 hover:text-red-600">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const { household, members, activeMemberId } = useApp();
  const { blocks, addBlock, updateBlock, removeBlock } = useScheduleBlocks(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const { calendars, addCalendar } = useCalendars(household?.id);
  const { events: appRaw, addEvent, updateEvent, removeEvent } = useEvents(household?.id);
  const calendarsById = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const appEvents = useMemo(() => {
    const now = Date.now();
    return expandEvents(appRaw, { fromMs: now - 7 * 86_400_000, toMs: now + 60 * 86_400_000, calendarsById });
  }, [appRaw, calendarsById]);
  const events = useMemo(
    () => [...gcalEvents, ...workEvents, ...appEvents],
    [gcalEvents, workEvents, appEvents]
  );
  const [hidden, setHidden] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);
  const [showEvent, setShowEvent] = useState(false);
  const [editEvent, setEditEvent] = useState(null);

  // Tap an app-native event on the board → open it for edit/delete. (Google /
  // work events aren't editable here.)
  const onEventClick = (occ) => {
    if (occ?.source !== 'app') return;
    const raw = appRaw.find((e) => e.id === occ.eventId);
    if (raw) setEditEvent(raw);
  };

  const visibleMemberIds = useMemo(
    () => members.filter((m) => !hidden.has(m.id)).map((m) => m.id),
    [members, hidden]
  );

  const toggleMember = (id) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      {/* Per-person filter chips */}
      <div data-tour="cal-filter" className="flex flex-wrap items-center gap-2">
        {members.map((m) => {
          const on = !hidden.has(m.id);
          return (
            <button key={m.id} onClick={() => toggleMember(m.id)}
              className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 transition-all ${on ? 'border-surface-3 bg-surface-0' : 'border-surface-3 bg-surface-1 opacity-40'}`}>
              <MemberChip member={m} size={24} />
              <span className="text-xs font-medium text-text">{m.name}</span>
            </button>
          );
        })}
        <button data-tour="cal-add-event" onClick={() => setShowEvent(true)} className="cd-btn cd-btn--accent ml-auto flex items-center gap-1.5 !py-1.5">
          <Plus className="h-4 w-4" /> Event
        </button>
      </div>

      <div data-tour="cal-grid" className="flex min-h-0 flex-1 flex-col">
        <FamilyCalendar
          className="min-h-0 flex-1"
          members={members}
          blocks={blocks}
          events={events}
          activeMemberId={activeMemberId}
          visibleMemberIds={visibleMemberIds}
          onAddBlock={(seed) => setSheet(seed)}
          onUpdateBlock={updateBlock}
          onRemoveBlock={removeBlock}
          onEventClick={onEventClick}
        />
      </div>

      {sheet && (
        <AddBlockSheet
          seed={sheet}
          members={members}
          defaultMemberId={activeMemberId}
          onClose={() => setSheet(null)}
          onSave={(row) => addBlock(row)}
        />
      )}

      {(showEvent || editEvent) && (
        <AddEventSheet
          event={editEvent}
          calendars={calendars}
          members={members}
          defaultMemberId={activeMemberId}
          addCalendar={addCalendar}
          addEvent={addEvent}
          updateEvent={updateEvent}
          removeEvent={removeEvent}
          onClose={() => { setShowEvent(false); setEditEvent(null); }}
        />
      )}
    </div>
  );
}
