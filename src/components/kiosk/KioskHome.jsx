import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckSquare, StickyNote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useScheduleBlocks } from '../../hooks/useScheduleBlocks';
import { useTasks } from '../../hooks/useTasks';
import MemberChip from '../members/MemberChip';
import { isoDay } from '../calendar/FamilyCalendar';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtClock(minOfDay) {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

// Glanceable kitchen home — a big clock + today's combined family agenda,
// color-coded per person. Designed to read across a room.
export default function KioskHome() {
  const { household, members } = useApp();
  const { blocks } = useScheduleBlocks(household?.id);
  const { tasks } = useTasks(household?.id);
  const now = useClock();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const todayIso = isoDay(now.getTime());
  const agenda = blocks
    .filter((b) => b.day === todayIso)
    .sort((a, z) => (a.start_min ?? 1e9) - (z.start_min ?? 1e9));

  const openTasks = tasks.filter((t) => !t.done);
  const dueToday = openTasks.filter((t) => t.due_date === todayIso);

  const hh = now.getHours();
  const greeting = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      {/* Clock + greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="cd-mono-label">{greeting}</div>
          <div className="text-6xl font-bold leading-none text-text md:text-7xl">
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
          <div className="mt-1 text-lg font-medium text-text-2">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div className="flex -space-x-1.5">
          {members.map((m) => (
            <MemberChip key={m.id} member={m} size={40} ring />
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        {/* Today's agenda — spans two columns */}
        <section className="cd-card flex min-h-0 flex-col lg:col-span-2">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-text"><CalendarDays className="h-4 w-4" /> Today</h2>
            <Link to="/calendar" className="cd-mono-label hover:text-text">open calendar →</Link>
          </header>
          <div className="cd-scroll flex flex-col gap-1.5">
            {agenda.length === 0 && <p className="cd-mono-label py-8 text-center">nothing scheduled today</p>}
            {agenda.map((b) => {
              const m = memberById.get(b.member_id);
              const color = m?.color || '#7a6f5f';
              return (
                <div key={b.id} className="flex items-center gap-3 rounded-btn border border-surface-3 bg-surface-0 p-2.5">
                  <span className="w-16 shrink-0 font-mono text-xs text-text-2">
                    {b.start_min != null ? fmtClock(b.start_min) : '—'}
                  </span>
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">{b.title}</span>
                  {m && <MemberChip member={m} size={26} />}
                </div>
              );
            })}
          </div>
        </section>

        {/* Right rail: tasks due + quick links */}
        <div className="flex min-h-0 flex-col gap-4">
          <section className="cd-card flex min-h-0 flex-1 flex-col">
            <header className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-text"><CheckSquare className="h-4 w-4" /> Tasks</h2>
              <Link to="/tasks" className="cd-mono-label hover:text-text">all →</Link>
            </header>
            <div className="cd-scroll flex flex-col gap-1.5">
              {dueToday.length === 0 && openTasks.length === 0 && (
                <p className="cd-mono-label py-6 text-center">all clear 🎉</p>
              )}
              {(dueToday.length ? dueToday : openTasks.slice(0, 6)).map((t) => {
                const m = memberById.get(t.assigned_to);
                return (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-btn border border-surface-3 p-2">
                    {m ? <MemberChip member={m} size={24} /> : <span className="h-6 w-6 rounded-squircle bg-surface-3" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{t.title}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <Link to="/notes" className="cd-tile !min-h-0 flex-row items-center justify-start gap-3 !py-4">
            <StickyNote className="h-5 w-5 text-text-2" />
            <span className="text-sm font-bold text-text">Household notes & lists</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
