import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTasks } from '../hooks/useTasks';
import MemberChip from '../components/members/MemberChip';

// Shared, assignable tasks. Make a task FOR someone — pick who it's assigned to,
// give it a due date, check it off together.
export default function Tasks() {
  const { household, members, activeMemberId } = useApp();
  const { tasks, addTask, toggleDone, removeTask, updateTask } = useTasks(household?.id);
  const [title, setTitle] = useState('');
  const [assignTo, setAssignTo] = useState(activeMemberId || '');
  const [due, setDue] = useState('');
  const [filter, setFilter] = useState('all'); // all | mine | open

  const memberById = new Map(members.map((m) => [m.id, m]));

  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({ title, assigned_to: assignTo || null, created_by: activeMemberId || null, due_date: due || null });
    setTitle('');
    setDue('');
  };

  const shown = tasks.filter((t) => {
    if (filter === 'open') return !t.done;
    if (filter === 'mine') return t.assigned_to === activeMemberId;
    return true;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <form data-tour="task-add" onSubmit={add} className="cd-card flex flex-col gap-2">
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for someone…" className="cd-input flex-1" />
          <button type="submit" className="cd-btn cd-btn--accent shrink-0"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="cd-input !w-auto !py-2">
            <option value="">Anyone</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="cd-input !w-auto !py-2" />
        </div>
      </form>

      <div data-tour="task-filter" className="flex gap-1.5">
        {['all', 'open', 'mine'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase transition-colors ${filter === f ? 'bg-text text-white' : 'bg-surface-1 text-text-2'}`}>
            {f}
          </button>
        ))}
      </div>

      <div data-tour="task-list" className="cd-scroll flex flex-col gap-1.5">
        {shown.length === 0 && <p className="cd-mono-label py-10 text-center">no tasks</p>}
        {shown.map((t) => {
          const m = memberById.get(t.assigned_to);
          const overdue = !t.done && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-btn border border-surface-3 bg-surface-0 p-2.5">
              <button onClick={() => toggleDone(t)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${t.done ? 'border-transparent bg-text text-white' : 'border-surface-4'}`}>
                {t.done && <Check className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${t.done ? 'text-text-3 line-through' : 'text-text'}`}>{t.title}</p>
                {t.due_date && (
                  <span className={`font-mono text-[10px] ${overdue ? 'text-red-500' : 'text-text-3'}`}>due {t.due_date}</span>
                )}
              </div>
              <select
                value={t.assigned_to || ''}
                onChange={(e) => updateTask(t.id, { assigned_to: e.target.value || null })}
                className="rounded-full border border-surface-3 bg-surface-0 py-0.5 pl-0.5 pr-2 text-xs"
                title="Reassign"
              >
                <option value="">—</option>
                {members.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}
              </select>
              {m && <MemberChip member={m} size={26} />}
              <button onClick={() => removeTask(t.id)} className="text-text-3 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
