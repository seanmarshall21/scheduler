import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import MemberChip from '../members/MemberChip';

// ── Multi-person family calendar ────────────────────────────────────────────
// Adapted from CRFTD's CalendarTile engine (same time-grid geometry, overlap
// column-packing, pointer drag/resize gestures, "+N more" overflow) but made
// MULTI-PERSON and color-coded per member:
//   • DAY view   → one lane PER MEMBER for the day (the kitchen glance). Drag a
//                  block sideways to reassign it to another person.
//   • 3-DAY / WEEK → one column per DAY; everyone's items overlaid, packed
//                  side-by-side and colored per person. Drag sideways to move
//                  the block to another day.
// Data shapes:
//   block: { id, member_id, title, category, day:'YYYY-MM-DD', start_min, minutes }
//   event: { id, member_id, summary, start, end, allDay, color }  (Google, later)

const VIEWS = [
  { key: 'day', label: '1D', days: 1 },
  { key: '3day', label: '3D', days: 3 },
  { key: 'week', label: 'W', days: 7 },
];
const CAL_START = 6 * 60; // 6:00
const CAL_END = 22 * 60; // 22:00
const STACK_FROM = 8 * 60;
const ZOOMS = [40, 60, 88]; // px per hour
const DAY_MS = 86_400_000;
const MAX_SLOTS = 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap15 = (m) => Math.round(m / 15) * 15;

function fmtClock(minOfDay) {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
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

// Resolve a Google event onto a day's minute range (timed events only).
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
  const [editId, setEditId] = useState(null); // raw block id being quick-edited
  const [drag, setDrag] = useState(null);
  const scrollRef = useRef(null);
  const pressRef = useRef(null);

  const hourPx = ZOOMS[zoom];
  const calH = ((CAL_END - CAL_START) / 60) * hourPx;
  const viewDef = VIEWS.find((v) => v.key === view);
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

  // Build the columns for the current view.
  //  - day view: one column per shown member (single day)
  //  - multi-day: one column per day (all shown members overlaid)
  const columns = useMemo(() => {
    const visIds = shown.map((m) => m.id);
    const within = (memberId) => memberId == null || visIds.includes(memberId);
    if (view === 'day') {
      return shown.map((m) => {
        const items = [
          ...blocksForDay(blocks, baseTs, m.id),
          ...eventsForDay(events, baseTs, m.id),
        ];
        return { key: `m-${m.id}`, dayTs: baseTs, member: m, items };
      });
    }
    return Array.from({ length: viewDef.days }, (_, i) => {
      const ts = baseTs + i * DAY_MS;
      const items = [
        ...blocksForDay(blocks, ts).filter((it) => within(it.member_id)),
        ...eventsForDay(events, ts).filter((it) => within(it.member_id)),
      ];
      return { key: `d-${ts}`, dayTs: ts, member: null, items };
    });
  }, [view, shown, blocks, events, baseTs, viewDef.days]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = ((STACK_FROM - CAL_START) / 60) * hourPx - 12;
  }, [view, hourPx]);

  const move = (dir) => setAnchor(baseTs + dir * viewDef.days * DAY_MS);

  const rangeLabel =
    viewDef.days === 1
      ? new Date(baseTs).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
      : `${new Date(baseTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(
          baseTs + (viewDef.days - 1) * DAY_MS
        ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const hours = [];
  for (let m = CAL_START; m <= CAL_END; m += 60) hours.push(m);

  // ── Pointer drag/resize (mouse + touch), ported from CRFTD ────────────────
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

  const colTemplate = `3rem repeat(${columns.length}, minmax(8rem, 1fr))`;

  return (
    <section className={`cd-card flex min-h-0 flex-col gap-3 ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="leading-tight">
          <h2 className="text-base font-bold text-text">Shared calendar</h2>
          <div className="cd-mono-label mt-0.5">{rangeLabel}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-full border border-surface-3 bg-surface-1 p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase transition-colors ${
                  view === v.key ? 'bg-text text-white' : 'text-text-2 hover:text-text'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1 disabled:opacity-30">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1 disabled:opacity-30">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
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
      </header>

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
                    // Calendar events use their own calendar/source color; draggable
                    // blocks stay in the member's color.
                    const color = (it.kind === 'event' && it.color) || colorOf(it.member_id);
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
                    const hidden = cl.items.filter((it) => it.col >= MAX_SLOTS - 1);
                    if (!hidden.length) return null;
                    const start = Math.min(...hidden.map((h) => h.start));
                    const end = Math.max(...hidden.map((h) => h.end));
                    const w = 100 / MAX_SLOTS;
                    return (
                      <div key={`ov-${i}`} className="absolute z-10 flex items-center justify-center rounded-lg border border-surface-3 bg-surface-2/90"
                        style={{ top: ((start - CAL_START) / 60) * hourPx, height: Math.max(24, ((end - start) / 60) * hourPx - 4), left: `calc(${(MAX_SLOTS - 1) * w}% + 2px)`, width: `calc(${w}% - 4px)` }}>
                        <span className="font-mono text-[10px] font-bold text-text-2">+{hidden.length}</span>
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
    </section>
  );
}
