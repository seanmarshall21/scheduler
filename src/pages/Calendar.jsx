import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import FamilyCalendar from '../components/calendar/FamilyCalendar';
import MemberChip from '../components/members/MemberChip';

const CATEGORIES = ['home', 'food', 'sport', 'school', 'social', 'travel', 'work'];

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

export default function Calendar() {
  const { household, members, activeMemberId } = useApp();
  const { blocks, addBlock, updateBlock, removeBlock } = useScheduleBlocks(household?.id);
  const { events } = useGoogleCalendar();
  const [hidden, setHidden] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);

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
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

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
      />

      {sheet && (
        <AddBlockSheet
          seed={sheet}
          members={members}
          defaultMemberId={activeMemberId}
          onClose={() => setSheet(null)}
          onSave={(row) => addBlock(row)}
        />
      )}
    </div>
  );
}
