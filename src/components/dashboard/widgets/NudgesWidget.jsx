import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckSquare } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTasks } from '../../../hooks/useTasks';
import { useScheduleBlocks } from '../../../hooks/useScheduleBlocks';
import { useEvents, expandEvents } from '../../../hooks/useEvents';
import { useGoogleCalendar } from '../../../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../../../hooks/useWorkSchedule';
import { useCalendars } from '../../../hooks/useCalendars';
import { isoDay } from '../../calendar/FamilyCalendar';

const DAY = 86_400_000;

// Proactive "heads up" — spots double-bookings (next 3 days) and surfaces
// overdue / due-today tasks, all derived from real data. No AI, no setup.
export default function NudgesWidget() {
  const { household, members } = useApp();
  const { tasks } = useTasks(household?.id);
  const { blocks } = useScheduleBlocks(household?.id);
  const { events: appRaw } = useEvents(household?.id);
  const { calendars } = useCalendars(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id) => memberById.get(id)?.name || 'Someone';

  const now = Date.now();
  const todayIso = isoDay(now);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();
  const t1 = t0 + 3 * DAY; // today + next 2 days
  const calById = new Map((calendars || []).map((c) => [c.id, c]));
  const dayTsOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  // Collect timed intervals per member.
  const intervals = [];
  const push = (s, e, mid, title) => {
    if (mid == null || s < t0 || s >= t1) return;
    intervals.push({ s, e: e > s ? e : s + 3_600_000, mid, title });
  };
  for (const b of blocks) {
    if (b.start_min == null) continue;
    const ds = new Date(`${b.day}T00:00`).getTime();
    const s = ds + b.start_min * 60_000;
    push(s, s + (b.minutes || 60) * 60_000, b.member_id, b.title);
  }
  for (const ev of expandEvents(appRaw || [], { fromMs: t0, toMs: t1, calendarsById: calById })) {
    if (ev.allDay) continue;
    push(new Date(ev.start).getTime(), new Date(ev.end || ev.start).getTime(), ev.member_id, ev.summary);
  }
  for (const ev of [...(gcalEvents || []), ...(workEvents || [])]) {
    if (ev.allDay) continue;
    push(new Date(ev.start).getTime(), new Date(ev.end || ev.start).getTime(), ev.member_id, ev.summary);
  }

  // Overlaps per member → conflicts.
  const byMember = new Map();
  for (const it of intervals) {
    if (!byMember.has(it.mid)) byMember.set(it.mid, []);
    byMember.get(it.mid).push(it);
  }
  const conflicts = [];
  for (const [mid, list] of byMember) {
    list.sort((a, z) => a.s - z.s);
    for (let i = 1; i < list.length; i++) {
      if (list[i].s < list[i - 1].e) conflicts.push({ mid, a: list[i - 1], b: list[i], dayTs: dayTsOf(list[i].s) });
    }
  }

  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due_date && t.due_date < todayIso);
  const dueToday = open.filter((t) => t.due_date === todayIso);

  const nudges = [];
  for (const c of conflicts.slice(0, 3)) {
    const when = c.dayTs === t0 ? 'today' : new Date(c.dayTs).toLocaleDateString(undefined, { weekday: 'long' });
    nudges.push({ kind: 'warn', icon: AlertTriangle, text: `${nameOf(c.mid)} is double-booked ${when}: “${c.a.title}” overlaps “${c.b.title}.”` });
  }
  if (overdue.length) nudges.push({ kind: 'warn', icon: CheckSquare, text: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue.`, to: '/tasks' });
  if (dueToday.length) nudges.push({ kind: 'info', icon: CalendarClock, text: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today.`, to: '/tasks' });

  return (
    <div className="flex h-full flex-col">
      <header className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-text" />
        <h2 className="text-base font-bold text-text">Heads up</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
        {!nudges.length && <p className="cd-mono-label py-6 text-center">all good — no conflicts 👍</p>}
        {nudges.map((n, i) => {
          const body = (
            <div className={`flex items-start gap-2.5 rounded-btn border p-2.5 ${n.kind === 'warn' ? 'border-[#e0a99a] bg-[#fbeceb]' : 'border-surface-3 bg-surface-0'}`}>
              <n.icon className={`mt-0.5 h-4 w-4 shrink-0 ${n.kind === 'warn' ? 'text-[#c0492f]' : 'text-text-2'}`} />
              <span className="min-w-0 flex-1 text-sm text-text">{n.text}</span>
            </div>
          );
          return n.to ? <Link key={i} to={n.to}>{body}</Link> : <div key={i}>{body}</div>;
        })}
      </div>
    </div>
  );
}
