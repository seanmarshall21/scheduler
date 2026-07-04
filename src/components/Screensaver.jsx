import { useEffect, useRef, useState } from 'react';
import { getScreensaver } from '../lib/screensaver';
import { useApp } from '../context/AppContext';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import { useEvents, expandEvents } from '../hooks/useEvents';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../hooks/useWorkSchedule';
import { useCalendars } from '../hooks/useCalendars';
import { isoDay } from './calendar/FamilyCalendar';
import MemberChip from './members/MemberChip';

const DAY = 86_400_000;
const fmtClock = (min) => { const h = Math.floor(min / 60); const m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`; };

// Kiosk screen-saver: after inactivity, a big glanceable clock + today's agenda
// that wakes on any touch. Reads prefs live (toggling in Settings applies at once).
export default function Screensaver() {
  const [cfg, setCfg] = useState(getScreensaver);
  const [active, setActive] = useState(false);
  const [now, setNow] = useState(new Date());
  const timer = useRef(null);

  const { household, members } = useApp();
  const { blocks } = useScheduleBlocks(household?.id);
  const { events: appRaw } = useEvents(household?.id);
  const { calendars } = useCalendars(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();

  useEffect(() => {
    const onPref = () => setCfg(getScreensaver());
    window.addEventListener('commons:screensaver', onPref);
    return () => window.removeEventListener('commons:screensaver', onPref);
  }, []);

  useEffect(() => {
    if (!cfg.enabled) { setActive(false); return undefined; }
    const reset = () => {
      setActive(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(true), cfg.minutes * 60_000);
    };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { evs.forEach((e) => window.removeEventListener(e, reset)); clearTimeout(timer.current); };
  }, [cfg.enabled, cfg.minutes]);

  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, [active]);

  if (!cfg.enabled || !active) return null;

  const memberById = new Map(members.map((m) => [m.id, m]));
  const todayIso = isoDay(now.getTime());
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();
  const calById = new Map((calendars || []).map((c) => [c.id, c]));
  const minOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

  const agenda = [];
  for (const b of blocks) {
    if (b.day !== todayIso) continue;
    const m = memberById.get(b.member_id);
    agenda.push({ key: `b-${b.id}`, min: b.start_min ?? null, title: b.title, member: m, color: m?.color });
  }
  for (const e of expandEvents(appRaw || [], { fromMs: t0, toMs: t0 + DAY, calendarsById: calById })) {
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

  const hh = now.getHours();
  const greet = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-between bg-bg p-8 md:p-14" onPointerDown={() => setActive(false)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="cd-mono-label">{greet}</div>
          <div className="text-[18vw] font-bold leading-none text-text md:text-[12vw]">
            {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </div>
          <div className="mt-2 text-2xl font-medium text-text-2 md:text-4xl">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div className="flex -space-x-2">
          {members.map((m) => (<MemberChip key={m.id} member={m} size={48} ring />))}
        </div>
      </div>

      <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-hidden">
        <div className="cd-mono-label">today</div>
        {agenda.length === 0 && <p className="text-xl text-text-3">Nothing scheduled — enjoy the day.</p>}
        {agenda.slice(0, 8).map((it) => (
          <div key={it.key} className="flex items-center gap-4">
            <span className="w-24 shrink-0 font-mono text-lg text-text-2 md:text-xl">{it.min != null ? fmtClock(it.min) : 'all day'}</span>
            <span className="h-8 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.color || '#7a6f5f' }} />
            <span className="min-w-0 flex-1 truncate text-xl font-bold text-text md:text-2xl">{it.title}</span>
            {it.member && <MemberChip member={it.member} size={32} />}
          </div>
        ))}
      </div>

      <div className="text-center"><span className="cd-mono-label">tap anywhere to wake</span></div>
    </div>
  );
}
