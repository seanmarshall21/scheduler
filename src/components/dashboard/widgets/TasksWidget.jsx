import { Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTasks } from '../../../hooks/useTasks';
import { isoDay } from '../../calendar/FamilyCalendar';
import MemberChip from '../../members/MemberChip';

export default function TasksWidget() {
  const { household, members } = useApp();
  const { tasks, toggleDone } = useTasks(household?.id);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const todayIso = isoDay(Date.now());
  const open = tasks.filter((t) => !t.done);
  const dueToday = open.filter((t) => t.due_date === todayIso);
  const list = dueToday.length ? dueToday : open.slice(0, 8);

  return (
    <div className="flex h-full flex-col">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-text"><CheckSquare className="h-4 w-4" /> Tasks</h2>
        <Link to="/tasks" className="cd-mono-label hover:text-text">all →</Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
        {!list.length && <p className="cd-mono-label py-6 text-center">all clear 🎉</p>}
        {list.map((t) => {
          const m = memberById.get(t.assigned_to);
          return (
            <button
              key={t.id}
              onClick={() => toggleDone(t)}
              className="flex w-full items-center gap-2.5 rounded-btn border border-surface-3 p-2 text-left transition-colors hover:bg-surface-1"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-surface-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{t.title}</span>
              {m && <MemberChip member={m} size={24} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
