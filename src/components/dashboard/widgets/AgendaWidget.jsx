import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useScheduleBlocks } from '../../../hooks/useScheduleBlocks';
import { useEvents, expandEvents } from '../../../hooks/useEvents';
import { useGoogleCalendar } from '../../../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../../../hooks/useWorkSchedule';
import { useCalendars } from '../../../hooks/useCalendars';
import { isoDay } from '../../calendar/FamilyCalendar';
import MemberChip from '../../members/MemberChip';

function fmtClock(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

// Today across every source the calendar shows (blocks + app + Google + work).
export default function AgendaWidget() {
  const { household, members } = useApp();
  const { blocks } = useScheduleBlocks(household?.id);
  const { events: appRaw } = useEvents(household?.id);
  const { calendars } = useCalendars(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const now = new Date();
  const todayIso = isoDay(now.getTime());
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();
  const t1 = t0 + 86_400_000;
  const calById = new Map((calendars || []).map((c) => [c.id, c]));
  const minOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

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

  return (
    <div className="flex h-full flex-col">
      <header className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-text"><CalendarDays className="h-4 w-4" /> Today</h2>
        <Link to="/calendar" className="cd-mono-label hover:text-text">open calendar →</Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
        {agenda.length === 0 && <p className="cd-mono-label py-8 text-center">nothing scheduled today</p>}
        {agenda.map((it) => (
          <div key={it.key} className="flex items-center gap-3 rounded-btn border border-surface-3 bg-surface-0 p-2.5">
            <span className="w-16 shrink-0 font-mono text-xs text-text-2">{it.min != null ? fmtClock(it.min) : 'all day'}</span>
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: it.color || '#7a6f5f' }} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">{it.title}</span>
            {it.member && <MemberChip member={it.member} size={26} />}
          </div>
        ))}
      </div>
    </div>
  );
}
