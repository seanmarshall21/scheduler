import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import MemberChip from '../members/MemberChip';

// ── Multi-person family calendar ────────────────────────────────────────────
// Google-style views, color-coded per member, with member toggles in-frame:
//   • List   → agenda of upcoming days (time + duration + who)
//   • 1D     → one lane PER MEMBER for the day (kitchen glance); drag to reassign
//   • 3D / W → one column per DAY; everyone overlaid, packed + colored per person
//   • M      → month grid with per-day dots; tap a day to open it
// Data shapes:
//   block: { id, member_id, title, category, day:'YYYY-MM-DD', start_min, minutes }
//   event: { id, member_id, summary, start, end, allDay, color }

const VIEWS = [
  { key: 'agenda', label: 'List', days: 0 },
  { key: 'day', label: '1D', days: 1 },
  { key: '3day', label: '3D', days: 3 },
  { key: 'week', label: 'W', days: 7 },
  { key: 'month', label: 'M', days: 0 },
];
const TIMED = new Set(['day', '3day', 'week']);
const CAL_START = 6 * 60; // 6:00
const CAL_END = 22 * 60; // 22:00
const STACK_FROM = 8 * 60;
const ZOOMS = [40, 60, 88]; // px per hour
const DAY_MS = 86_400_000;
const MAX_SLOTS = 3;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap15 = (m) => Math.round(m / 15) * 15;

function fmtClock(minOfDay) {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
}
function durLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
function startOfDayTs(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
function mondayOf(ts) {
  const d = new Date(ts);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return startOfDayTs(d);
}
export function isoDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Greedy lane packing for overlapping items in one column.
function packColumns(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const layout = new Map();
  const clusters = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  const commit = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => e.start >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.end);
      } else laneEnds[lane] = e.end;
      e._lane = lane;
    }
    const total = laneEnds.length;
    for (const e of cluster) layout.set(e.key, { col: e._lane, total });
    clusters.push({ total, items: cluster.map((e) => ({ ...e, col: e._lane })) });
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) commit();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  commit();
  return { layout, clusters };
}
function isOverflow(layout, key) {
  const l = layout.get(key);
  return Boolean(l && l.total > MAX_SLOTS && l.col >= MAX_SLOTS - 1);
}
function colStyle(layout, key) {
  const l = layout.get(key);
  const total = l?.total || 1;
  const col = l?.col || 0;
  const display = Math.min(total, MAX_SLOTS);
  const w = 100 / display;
  return { left: `calc(${col * w}% + 2px)`, width: `calc(${w}% - 4px)` };
}

// Resolve a Google/app event onto a day's minute range (timed events only).
function eventsForDay(events, dayTs, memberId = null) {
  const dayStart = dayTs;
  const dayEnd = dayTs + DAY_MS;
  const out = [];
  for (const ev of events || []) {
    if (ev.allDay) continue;
    if (memberId && ev.member_id !== memberId) continue;
    const s = new Date(ev.start).getTime();
    const e = ev.end ? new Date(ev.end).getTime() : s + 30 * 60_000;
    if (e <= dayStart || s >= dayEnd) continue;
    const sd = new Date(Math.max(s, dayStart));
    const ed = new Date(Math.min(e, dayEnd));
    const startMin = clamp(sd.getHours() * 60 + sd.getMinutes(), CAL_START, CAL_END - 15);
    const endMin = clamp(ed.getHours() * 60 + ed.getMinutes() || CAL_END, startMin + 15, CAL_END);
    out.push({ kind: 'event', id: `ev-${ev.id}`, raw: ev, member_id: ev.member_id, summary: ev.summary, start: startMin, end: endMin, color: ev.color ?? null });
  }
  return out;
}

// Resolve blocks onto a day. Timed blocks sit at their clock time; untimed
// blocks stack from STACK_FROM.
function blocksForDay(blocks, dayTs, memberId = null) {
  const dayIso = isoDay(dayTs);
  const day = blocks.filter((b) => b.day === dayIso && (!memberId || b.member_id === memberId));
  const out = [];
  for (const b of day.filter((x) => x.start_min != null)) {
    const start = clamp(b.start_min, CAL_START, CAL_END - 30);
    out.push({ kind: 'block', id: `bl-${b.id}`, raw: b, member_id: b.member_id, start, end: Math.min(start + Math.max(30, b.minutes), CAL_END) });
  }
  let cursor = STACK_FROM;
  for (const b of day.filter((x) => x.start_min == null).sort((a, z) => z.minutes - a.minutes)) {
    const dur = Math.max(30, b.minutes);
    if (cursor + 30 > CAL_END) continue;
    out.push({ kind: 'block', id: `bl-${b.id}`, raw: b, member_id: b.member_id, start: cursor, end: Math.min(cursor + dur, CAL_END), unplaced: true });
    cursor += dur + 15;
  }
  return out;
}

export default function FamilyCalendar({
  members = [],
  blocks = [],
  events = [],
  activeMemberId = null,
  visibleMemberIds = null, // null = all
  defaultView = '3day',
  onToggleMember, // (id) — toggle a member's visibility (chips live in-frame)
  onAddEvent, // () — open the new-event sheet
  onAddBlock, // ({ member_id, day, start_min })
  onUpdateBlock, // (id, patch)
  onRemoveBlock, // (id)
  onEventClick, // (event occurrence) — tap an event
  className = '',
}) {
  const [view, setView] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : defaultView
  );
  const [anchor, setAnchor] = useState(() => startOfDayTs());
  const [zoom, setZoom] = useState(1);
  const [agendaMode, setAgendaMode] = useState('time'); // 'time' | 'person' (List view)
  const [editId, setEditId] = useState(null); // raw block id being quick-edited
  const [drag, setDrag] = useState(null);
  const scrollRef = useRef(null);
  const pressRef = useRef(null);

  const hourPx = ZOOMS[zoom];
  const calH = ((CAL_END - CAL_START) / 60) * hourPx;
  const viewDef = VIEWS.find((v) => v.key === view) || VIEWS[2];
  const baseTs = view === 'week' ? mondayOf(anchor) : anchor;
  const today = startOfDayTs();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const shown = useMemo(
    () => (visibleMemberIds ? members.filter((m) => visibleMemberIds.includes(m.id)) : members),
    [members, visibleMemberIds]
  );
  const colorOf = (memberId) => memberById.get(memberId)?.color || '#7a6f5f';
  const itemColor = (it) => (it.kind === 'event' && it.color) || colorOf(it.member_id);

  // Timed-grid columns (day = per-member; multi-day = per-day overlaid).
  const columns = useMemo(() => {
    const visIds = shown.map((m) => m.id);
    const within = (memberId) => memberId == null || visIds.includes(memberId);
    if (view === 'day') {
      return shown.map((m) => ({
        key: `m-${m.id}`,
        dayTs: baseTs,
        member: m,
        items: [...blocksForDay(blocks, baseTs, m.id), ...eventsForDay(events, baseTs, m.id)],
      }));
    }
    if (!TIMED.has(view)) return [];
    return Array.from({ length: viewDef.days }, (_, i) => {
      const ts = baseTs + i * DAY_MS;
      const items = [
        ...blocksForDay(blocks, ts).filter((it) => within(it.member_id)),
        ...eventsForDay(events, ts).filter((it) => within(it.member_id)),
      ];
      return { key: `d-${ts}`, dayTs: ts, member: null, items };
    });
  }, [view, shown, blocks, events, baseTs, viewDef.days]);

  // Month grid (6 weeks) with per-day items.
  const monthInfo = useMemo(() => {
    if (view !== 'month') return null;
    const d = new Date(anchor);
    const gridStart = mondayOf(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
    const visIds = shown.map((m) => m.id);
    const within = (mid) => mid == null || visIds.includes(mid);
    const cells = Array.from({ length: 42 }, (_, i) => {
      const ts = gridStart + i * DAY_MS;
      const items = [
        ...blocksForDay(blocks, ts).filter((it) => within(it.member_id)),
        ...eventsForDay(events, ts).filter((it) => within(it.member_id)),
      ];
      return { ts, items, inMonth: new Date(ts).getMonth() === d.getMonth() };
    });
    return { cells };
  }, [view, anchor, shown, blocks, events]);

  // Agenda (next 14 days that have anything).
  const agendaDays = useMemo(() => {
    if (view !== 'agenda') return null;
    const start = startOfDayTs(new Date(anchor));
    const visIds = shown.map((m) => m.id);
    const within = (mid) => mid == null || visIds.includes(mid);
    const days = [];
    for (let i = 0; i < 14; i++) {
      const ts = start + i * DAY_MS;
      const items = [
        ...blocksForDay(blocks, ts).filter((it) => within(it.member_id)),
        ...eventsForDay(events, ts).filter((it) => within(it.member_id)),
      ].sort((a, z) => a.start - z.start);
      if (items.length) days.push({ ts, items });
    }
    return days;
  }, [view, anchor, shown, blocks, events]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = ((STACK_FROM - CAL_START) / 60) * hourPx - 12;
  }, [view, hourPx]);

  const move = (dir) => {
    if (view === 'month') {
      const d = new Date(anchor);
      setAnchor(new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime());
    } else if (view === 'agenda') {
      setAnchor(startOfDayTs(new Date(anchor)) + dir * 14 * DAY_MS);
    } else {
      setAnchor(baseTs + dir * viewDef.days * DAY_MS);
    }
  };

  const rangeLabel =
    view === 'month'
      ? new Date(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'agenda'
        ? 'Upcoming'
        : viewDef.days === 1
          ? new Date(baseTs).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
          : `${new Date(baseTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(baseTs + (viewDef.days - 1) * DAY_MS).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const hours = [];
  for (let m = CAL_START; m <= CAL_END; m += 60) hours.push(m);

  // Compact agenda card used in the per-person columns of List view.
  const compactItem = (it) => {
    const color = itemColor(it);
    const label = it.kind === 'event' ? it.summary : it.raw.title;
    const clickable = it.kind === 'event' && onEventClick;
    return (
      <button
        key={it.id}
        onClick={clickable ? () => onEventClick(it.raw) : undefined}
        className="flex flex-col gap-0.5 rounded-btn border border-surface-3 bg-surface-0 p-2 text-left"
        style={{ cursor: clickable ? 'pointer' : 'default' }}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-text">{label}</span>
        </span>
        <span className="pl-3 font-mono text-[10px] text-text-3">{fmtClock(it.start)} · {durLabel(it.end - it.start)}</span>
      </button>
    );
  };

  // ── Pointer drag/resize (mouse + touch) ───────────────────────────────────
  const startGesture = (e, cfg, mode) => {
    if (!onUpdateBlock) return;
    if (e.button != null && e.button !== 0) return;
    const info = {
      id: cfg.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      originStart: cfg.originStart,
      originMinutes: Math.max(30, cfg.originMinutes),
      originDayTs: cfg.originDayTs,
      originMemberId: cfg.originMemberId,
      curStart: cfg.originStart,
      curMinutes: Math.max(30, cfg.originMinutes),
      curDayTs: cfg.originDayTs,
      curMemberId: cfg.originMemberId,
      color: cfg.color,
      name: cfg.name,
      pointerType: e.pointerType,
      active: false,
      moved: false,
      longTimer: null,
    };
    const sync = () =>
      setDrag({
        id: info.id,
        mode: info.mode,
        curStart: info.curStart,
        curMinutes: info.curMinutes,
        curDayTs: info.curDayTs,
        curMemberId: info.curMemberId,
        originDayTs: info.originDayTs,
        color: info.color,
        name: info.name,
      });
    const lift = () => {
      info.active = true;
      setEditId(null);
      sync();
      if (info.pointerType === 'touch' && navigator.vibrate) {
        try { navigator.vibrate(12); } catch { /* haptics optional */ }
      }
    };
    const onMove = (ev) => {
      const dx = ev.clientX - info.startX;
      const dy = ev.clientY - info.startY;
      if (!info.active) {
        if (info.mode === 'move' && info.pointerType === 'touch') {
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            clearTimeout(info.longTimer);
            finish(false);
          }
          return;
        }
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) lift();
        else return;
      }
      const deltaMin = (dy / hourPx) * 60;
      if (info.mode === 'resize') {
        info.curMinutes = clamp(snap15(info.originMinutes + deltaMin), 30, CAL_END - info.originStart);
      } else {
        info.curStart = clamp(snap15(info.originStart + deltaMin), CAL_START, CAL_END - 30);
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const colEl = el && el.closest && el.closest('[data-col]');
        if (colEl) {
          const dts = colEl.getAttribute('data-day-ts');
          const mid = colEl.getAttribute('data-member-id');
          if (dts) info.curDayTs = Number(dts);
          if (mid) info.curMemberId = mid === '__none__' ? info.originMemberId : mid;
        }
      }
      info.moved = true;
      sync();
      if (ev.cancelable) ev.preventDefault();
    };
    const finish = (commit) => {
      clearTimeout(info.longTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (commit && info.active && info.moved) {
        if (info.mode === 'resize') {
          onUpdateBlock(cfg.rawId, { minutes: info.curMinutes });
        } else {
          const patch = { start_min: info.curStart, day: isoDay(info.curDayTs) };
          if (view === 'day' && info.curMemberId !== info.originMemberId) patch.member_id = info.curMemberId;
          onUpdateBlock(cfg.rawId, patch);
        }
      } else if (commit && !info.active && info.mode === 'move') {
        setEditId((cur) => (cur === cfg.rawId ? null : cfg.rawId));
      }
      if (pressRef.current === info) pressRef.current = null;
      setDrag(null);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    pressRef.current = info;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (mode === 'resize') lift();
    else if (e.pointerType === 'touch') {
      info.longTimer = setTimeout(() => {
        if (pressRef.current === info && !info.active) lift();
      }, 280);
    }
  };

  const colTemplate = `3rem repeat(${Math.max(columns.length, 1)}, minmax(8rem, 1fr))`;

  return (
    <section className={`cd-card flex min-h-0 flex-col gap-2 ${className}`}>
      <header className="flex flex-col gap-2">
        {/* Member toggles (in-frame) + add event */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div data-tour="cal-filter" className="flex flex-wrap items-center gap-1.5">
            {members.map((m) => {
              const on = !visibleMemberIds || visibleMemberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => onToggleMember?.(m.id)}
                  className={`flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs transition-all ${on ? 'border-surface-3 bg-surface-0' : 'border-surface-3 bg-surface-1 opacity-40'}`}
                >
                  <MemberChip member={m} size={20} />
                  <span className="font-medium text-text">{m.name}</span>
                </button>
              );
            })}
          </div>
          {onAddEvent && (
            <button data-tour="cal-add-event" onClick={onAddEvent} className="cd-btn cd-btn--accent flex items-center gap-1 !py-1 text-sm">
              <Plus className="h-4 w-4" /> Event
            </button>
          )}
        </div>

        {/* Range label + view toggles + nav */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="cd-mono-label">{rangeLabel}</div>
          <div className="flex items-center gap-1.5">
            <div data-tour="cal-views" className="flex rounded-full border border-surface-3 bg-surface-1 p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`rounded-full px-2 py-1 font-mono text-[10px] uppercase transition-colors ${view === v.key ? 'bg-text text-white' : 'text-text-2 hover:text-text'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {view === 'agenda' && (
              <div className="flex rounded-full border border-surface-3 bg-surface-1 p-0.5">
                {[['time', 'By time'], ['person', 'By person']].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setAgendaMode(k)}
                    className={`rounded-full px-2 py-1 font-mono text-[10px] uppercase transition-colors ${agendaMode === k ? 'bg-text text-white' : 'text-text-2 hover:text-text'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {TIMED.has(view) && (
              <>
                <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Zoom out"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1 disabled:opacity-30">
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1 disabled:opacity-30">
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button onClick={() => move(-1)} aria-label="Previous"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setAnchor(startOfDayTs())}
              className="rounded-full border border-surface-3 px-2.5 py-1 font-mono text-[10px] uppercase text-text-2 hover:bg-surface-1">
              today
            </button>
            <button onClick={() => move(1)} aria-label="Next"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── List / Agenda ────────────────────────────────────────────────── */}
      {view === 'agenda' && (
        <div className="cd-scroll min-h-[420px] flex-1 overflow-auto">
          {(!agendaDays || !agendaDays.length) && (
            <p className="cd-mono-label py-12 text-center">nothing scheduled in the next two weeks</p>
          )}
          <div className="flex flex-col gap-4">
            {agendaDays?.map((day) => {
              const isToday = day.ts === today;
              return (
                <div key={day.ts}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`text-sm font-bold ${isToday ? 'text-text' : 'text-text-2'}`}>
                      {new Date(day.ts).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </span>
                    {isToday && <span className="cd-mono-label" style={{ color: '#e08a3c' }}>today</span>}
                  </div>
                  {agendaMode === 'person' ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {shown.map((m) => {
                        const mine = day.items.filter((it) => it.member_id === m.id);
                        return (
                          <div key={m.id} className="w-44 shrink-0">
                            <div className="mb-1 flex items-center gap-1.5">
                              <MemberChip member={m} size={20} />
                              <span className="truncate text-xs font-bold text-text">{m.name}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              {!mine.length && <p className="py-2 text-center font-mono text-[10px] text-text-3">—</p>}
                              {mine.map((it) => compactItem(it))}
                            </div>
                          </div>
                        );
                      })}
                      {day.items.some((it) => it.member_id == null) && (
                        <div className="w-44 shrink-0">
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-squircle bg-surface-3 text-[10px] font-bold text-text-2">·</span>
                            <span className="truncate text-xs font-bold text-text-2">Shared</span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {day.items.filter((it) => it.member_id == null).map((it) => compactItem(it))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {day.items.map((it) => {
                        const color = itemColor(it);
                        const m = memberById.get(it.member_id);
                        const label = it.kind === 'event' ? it.summary : it.raw.title;
                        const clickable = it.kind === 'event' && onEventClick;
                        return (
                          <button
                            key={it.id}
                            onClick={clickable ? () => onEventClick(it.raw) : undefined}
                            className="flex items-center gap-3 rounded-btn border border-surface-3 bg-surface-0 p-2.5 text-left"
                            style={{ cursor: clickable ? 'pointer' : 'default' }}
                          >
                            <span className="w-24 shrink-0 font-mono text-[10px] text-text-2">{fmtClock(it.start)}–{fmtClock(it.end)}</span>
                            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-text">{label}</span>
                              <span className="font-mono text-[10px] text-text-3">{durLabel(it.end - it.start)}</span>
                            </span>
                            {m && <MemberChip member={m} size={24} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Month ─────────────────────────────────────────────────────────── */}
      {view === 'month' && monthInfo && (
        <div className="cd-scroll flex min-h-[420px] flex-1 flex-col overflow-auto">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((d) => (
              <div key={d} className="border-b border-surface-3 pb-1 text-center font-mono text-[10px] uppercase text-text-3">{d}</div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 grid-rows-6">
            {monthInfo.cells.map((cell) => {
              const isToday = cell.ts === today;
              const d = new Date(cell.ts);
              const colors = [...new Set(cell.items.map(itemColor))].slice(0, 4);
              return (
                <button
                  key={cell.ts}
                  onClick={() => { setAnchor(cell.ts); setView('day'); }}
                  className={`flex flex-col items-start gap-1 border-b border-l border-surface-2 p-1.5 text-left transition-colors hover:bg-surface-1 ${cell.inMonth ? '' : 'opacity-35'} ${isToday ? 'bg-accent2/10' : ''}`}
                >
                  <span className={`font-mono text-xs ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full font-bold text-white' : 'text-text-2'}`}
                    style={isToday ? { backgroundColor: '#e08a3c' } : undefined}>
                    {d.getDate()}
                  </span>
                  {cell.items.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-[10px] font-bold text-text-2">{cell.items.length}</span>
                      <span className="flex gap-0.5">
                        {colors.map((c, i) => (<span key={i} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />))}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Timed grid (1D / 3D / W) ──────────────────────────────────────── */}
      {TIMED.has(view) && (
        <div className="relative min-h-[420px] flex-1">
          <div ref={scrollRef} className="cd-pan absolute inset-0 overflow-auto">
            <div className="grid min-w-fit" style={{ gridTemplateColumns: colTemplate }}>
              {/* corner */}
              <div className="sticky left-0 top-0 z-30 bg-white" />
              {/* column headers */}
              {columns.map((c) => {
                const isToday = c.dayTs === today;
                const d = new Date(c.dayTs);
                return (
                  <div key={`h-${c.key}`} className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-surface-3 bg-white px-2 pb-1.5 pt-0.5">
                    {c.member ? (
                      <>
                        <MemberChip member={c.member} size={26} />
                        <span className="truncate text-xs font-bold text-text">{c.member.name}</span>
                      </>
                    ) : (
                      <span className={`text-xs font-bold ${isToday ? 'text-text' : 'text-text-2'}`}>
                        {d.toLocaleDateString(undefined, { weekday: 'short' })} {d.getDate()}
                        {isToday && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#e08a3c' }} />}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* hour gutter */}
              <div className="sticky left-0 z-20 bg-white" style={{ height: calH }}>
                <div className="relative h-full">
                  {hours.map((m) => (
                    <span key={m} className="absolute right-1.5 -translate-y-1/2 font-mono text-[9px] text-text-3"
                      style={{ top: ((m - CAL_START) / 60) * hourPx }}>
                      {fmtClock(m)}
                    </span>
                  ))}
                </div>
              </div>

              {/* day/member columns */}
              {columns.map((c) => {
                const { layout, clusters } = packColumns(
                  c.items.map((it) => ({ key: it.id, start: it.start, end: it.end }))
                );
                const targetMemberId = c.member ? c.member.id : activeMemberId;
                const dropHere = drag && (
                  (view === 'day' && drag.curMemberId === c.member?.id) ||
                  (view !== 'day' && drag.curDayTs === c.dayTs)
                ) && (drag.originDayTs !== c.dayTs || (view === 'day' && drag.curMemberId !== c.member?.id));
                return (
                  <div
                    key={c.key}
                    data-col
                    data-day-ts={c.dayTs}
                    data-member-id={c.member ? c.member.id : '__none__'}
                    className={`relative border-l border-surface-2 ${dropHere ? 'bg-accent2/10' : ''}`}
                    style={{ height: calH }}
                  >
                    {hours.map((m) => (
                      <div key={m} className="absolute inset-x-0 border-t border-surface-2" style={{ top: ((m - CAL_START) / 60) * hourPx }} />
                    ))}

                    {/* tap empty space → add a block */}
                    {onAddBlock && (
                      <div
                        className="absolute inset-0 z-0"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const raw = CAL_START + ((e.clientY - rect.top) / hourPx) * 60;
                          const start_min = clamp(Math.round(raw / 30) * 30, CAL_START, CAL_END - 30);
                          setEditId(null);
                          onAddBlock({ member_id: targetMemberId, day: isoDay(c.dayTs), start_min });
                        }}
                      />
                    )}

                    {c.items.map((it) => {
                      const isDragged = drag && drag.id === it.id;
                      if (isDragged) {
                        const ok = view === 'day' ? drag.curMemberId === c.member?.id : drag.curDayTs === c.dayTs;
                        if (!ok) return null;
                      }
                      if (!isDragged && isOverflow(layout, it.id)) return null;
                      const color = itemColor(it);
                      const sMin = isDragged ? drag.curStart : it.start;
                      const dur = isDragged ? drag.curMinutes : it.end - it.start;
                      const eMin = Math.min(CAL_END, sMin + Math.max(30, dur));
                      const top = ((sMin - CAL_START) / 60) * hourPx;
                      const height = Math.max(24, ((eMin - sMin) / 60) * hourPx - 2);
                      const place = isDragged ? { left: '3px', width: 'calc(100% - 6px)' } : colStyle(layout, it.id);
                      const isEvent = it.kind === 'event';
                      const editable = it.kind === 'block' && onUpdateBlock;
                      const label = isEvent ? it.summary : it.raw.title;
                      const rawId = it.kind === 'block' ? it.raw.id : null;
                      const isEditing = editId === rawId;
                      return (
                        <div key={it.id}>
                          <div
                            onPointerDown={editable ? (e) => startGesture(e, {
                              id: it.id, rawId,
                              originStart: it.start, originMinutes: it.end - it.start,
                              originDayTs: c.dayTs, originMemberId: it.member_id,
                              color, name: label,
                            }, 'move') : undefined}
                            onClick={isEvent && onEventClick ? () => onEventClick(it.raw) : undefined}
                            className={`absolute flex select-none flex-col gap-0.5 overflow-hidden rounded-lg px-1.5 py-1 ${
                              isEvent ? 'border-l-[3px]' : ''
                            } ${isDragged ? 'z-30 shadow-lg ring-2 ring-text/30' : isEditing ? 'z-20 ring-2 ring-text/25' : 'z-10'} ${
                              it.unplaced ? 'border border-dashed' : ''
                            }`}
                            style={{
                              top, height, ...place,
                              backgroundColor: isEvent ? 'white' : `color-mix(in srgb, ${color} 16%, white)`,
                              borderLeftColor: isEvent ? color : undefined,
                              borderColor: it.unplaced ? `color-mix(in srgb, ${color} 40%, white)` : undefined,
                              cursor: editable ? (isDragged ? 'grabbing' : 'grab') : isEvent && onEventClick ? 'pointer' : 'default',
                              touchAction: isDragged ? 'none' : 'auto',
                              pointerEvents: isDragged ? 'none' : 'auto',
                            }}
                            title={label}
                          >
                            <span className="truncate text-[11px] font-bold" style={{ color: `color-mix(in srgb, ${color} 80%, black)` }}>
                              {label}
                            </span>
                            <span className="font-mono text-[9px] text-text-3">{fmtClock(sMin)}–{fmtClock(eMin)}</span>
                            {editable && !isDragged && (
                              <div
                                onPointerDown={(e) => { e.stopPropagation(); startGesture(e, {
                                  id: it.id, rawId,
                                  originStart: it.start, originMinutes: it.end - it.start,
                                  originDayTs: c.dayTs, originMemberId: it.member_id, color, name: label,
                                }, 'resize'); }}
                                className="absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize items-center justify-center"
                                style={{ touchAction: 'none' }}
                              >
                                <span className="h-1 w-6 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, white)` }} />
                              </div>
                            )}
                          </div>
                          {isEditing && editable && !drag && (
                            <div className="absolute left-1 right-1 z-40 flex items-center gap-1 rounded-lg border border-surface-3 bg-white p-1 shadow-md"
                              style={{ top: top + height + 4 }}>
                              <span className="flex-1 truncate px-1 text-[11px] font-medium text-text">{label}</span>
                              <button onClick={() => onUpdateBlock(rawId, { minutes: Math.max(30, it.raw.minutes - 30) })}
                                className="rounded-md px-2 py-1 font-mono text-[10px] text-text-2 hover:bg-surface-1">−30</button>
                              <button onClick={() => onUpdateBlock(rawId, { minutes: it.raw.minutes + 30 })}
                                className="rounded-md px-2 py-1 font-mono text-[10px] text-text-2 hover:bg-surface-1">+30</button>
                              {onRemoveBlock && (
                                <button onClick={() => { onRemoveBlock(rawId); setEditId(null); }}
                                  className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                              )}
                              <button onClick={() => setEditId(null)} className="rounded-md px-1.5 py-1 text-text-3 hover:bg-surface-1"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* "+N more" overflow badges */}
                    {clusters.filter((cl) => cl.total > MAX_SLOTS).map((cl, i) => {
                      const hiddenItems = cl.items.filter((it) => it.col >= MAX_SLOTS - 1);
                      if (!hiddenItems.length) return null;
                      const start = Math.min(...hiddenItems.map((h) => h.start));
                      const end = Math.max(...hiddenItems.map((h) => h.end));
                      const w = 100 / MAX_SLOTS;
                      return (
                        <div key={`ov-${i}`} className="absolute z-10 flex items-center justify-center rounded-lg border border-surface-3 bg-surface-2/90"
                          style={{ top: ((start - CAL_START) / 60) * hourPx, height: Math.max(24, ((end - start) / 60) * hourPx - 4), left: `calc(${(MAX_SLOTS - 1) * w}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                          <span className="font-mono text-[10px] font-bold text-text-2">+{hiddenItems.length}</span>
                        </div>
                      );
                    })}

                    {/* now line */}
                    {c.dayTs === today && nowMin >= CAL_START && nowMin <= CAL_END && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center gap-1 pl-0.5" style={{ top: ((nowMin - CAL_START) / 60) * hourPx }}>
                        <span className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: '#e08a3c' }} />
                        <span className="h-px flex-1" style={{ backgroundColor: '#e08a3c' }} />
                      </div>
                    )}
                    {!c.items.length && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="cd-mono-label">nothing scheduled</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
