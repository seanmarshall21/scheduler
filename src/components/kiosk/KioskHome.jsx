import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckSquare, PenLine, StickyNote } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useScheduleBlocks } from '../../hooks/useScheduleBlocks';
import { useTasks } from '../../hooks/useTasks';
import { useEvents, expandEvents } from '../../hooks/useEvents';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../../hooks/useWorkSchedule';
import { useCalendars } from '../../hooks/useCalendars';
import { useWhiteboard } from '../../hooks/useWhiteboard';
import MemberChip from '../members/MemberChip';
import WhiteboardPreview from '../fridge/WhiteboardPreview';
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
  const { tasks, toggleDone } = useTasks(household?.id);
  const { events: appRaw } = useEvents(household?.id);
  const { calendars } = useCalendars(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const { strokes: fridgeStrokes, items: fridgeItems } = useWhiteboard(household?.id);
  const now = useClock();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const todayIso = isoDay(now.getTime());
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();
  const t1 = t0 + 86_400_000;
  const calById = new Map((calendars || []).map((c) => [c.id, c]));
  const minOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

  // Everything happening today, across every source the calendar shows.
  const agenda = [];
  for (const b of blocks) {
    if (b.day !== todayIso) continue;
    const m = memberById.get(b.member_id);
    agenda.push({ key: `b-${b.id}`, min: b.start_min ?? null, title: b.title, member: m, color: m?.color });
  }
  for (const e of expandEvents(appRaw || [], { fromMs: t0, toMs: t1, calendarsById: calById })) {
    const s = new Date(e.start).getTime();
    if (isoDay(s) !== todayIso) continue;
    const m = memberById.get(e.member_id);
    agenda.push({ key: `a-${e.id || e.summary}-${s}`, min: e.allDay ? null : minOfDay(s), title: e.summary, member: m, color: e.color || m?.color });
  }
  for (const e of [...(gcalEvents || []), ...(workEvents || [])]) {
    const s = new Date(e.start).getTime();
    if (isoDay(s) !== todayIso) continue;
    const m = memberById.get(e.member_id);
    agenda.push({ key: `g-${e.id || e.summary}-${s}`, min: e.allDay ? null : minOfDay(s), title: e.summary, member: m, color: e.color || m?.color });
  }
  agenda.sort((a, z) => (a.min ?? -1) - (z.min ?? -1));

  const openTasks = tasks.filter((t) => !t.done);
  const dueToday = openTasks.filter((t) => t.due_date === todayIso);

  const hh = now.getHours();
  const greeting = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      {/* Clock + greeting */}
      <div data-tour="home-clock" className="flex flex-wrap items-end justify-between gap-3">
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
        <section data-tour="home-agenda" className="cd-card flex min-h-0 flex-col lg:col-span-2">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-text"><CalendarDays className="h-4 w-4" /> Today</h2>
            <Link to="/calendar" className="cd-mono-label hover:text-text">open calendar →</Link>
          </header>
          <div className="cd-scroll flex flex-col gap-1.5">
            {agenda.length === 0 && <p className="cd-mono-label py-8 text-center">nothing scheduled today</p>}
            {agenda.map((it) => (
              <div key={it.key} className="flex items-center gap-3 rounded-btn border border-surface-3 bg-surface-0 p-2.5">
                <span className="w-16 shrink-0 font-mono text-xs text-text-2">
                  {it.min != null ? fmtClock(it.min) : 'all day'}
                </span>
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: it.color || '#7a6f5f' }} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">{it.title}</span>
                {it.member && <MemberChip member={it.member} size={26} />}
              </div>
            ))}
          </div>
        </section>

        {/* Right rail: tasks due + quick links */}
        <div className="flex min-h-0 flex-col gap-4">
          <section data-tour="home-tasks" className="cd-card flex min-h-0 flex-1 flex-col">
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
          </section>
          <Link to="/fridge" data-tour="home-fridge" className="cd-card flex flex-col gap-1.5 !p-2 transition-shadow hover:ring-2 hover:ring-surface-3">
            <div className="flex items-center justify-between px-1">
              <span className="cd-mono-label">the fridge</span>
              <PenLine className="h-4 w-4 text-text-3" />
            </div>
            <div className="overflow-hidden rounded-lg border border-surface-3 bg-white">
              {fridgeStrokes.length || fridgeItems.length ? (
                <WhiteboardPreview strokes={fridgeStrokes} items={fridgeItems} className="aspect-[5/3] w-full" />
              ) : (
                <div className="flex aspect-[5/3] items-center justify-center">
                  <span className="cd-mono-label">tap to leave a note</span>
                </div>
              )}
            </div>
          </Link>

          <Link to="/notes" className="cd-tile !min-h-0 flex-row items-center justify-start gap-3 !py-4">
            <StickyNote className="h-5 w-5 text-text-2" />
            <span className="text-sm font-bold text-text">Household notes & lists</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
