import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BringToFront, CalendarClock, Camera, Check, ChevronLeft, ImagePlus, Link2, ListChecks, Pencil, Plus, SendToBack, Trash2, Type, Undo2, X, Hand } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWhiteboard } from '../hooks/useWhiteboard';
import { useNotes } from '../hooks/useNotes';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import { useEvents, expandEvents } from '../hooks/useEvents';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../hooks/useWorkSchedule';
import { useCalendars } from '../hooks/useCalendars';

const listHeader = (raw) => {
  const t = (raw || '').trim();
  const m = t.match(/^#{1,6}\s+(.+?)\s*$/) || t.match(/^\*\*(.+?)\*\*:?\s*$/);
  return m ? m[1] : null;
};
const cleanListItem = (raw) => (raw || '').replace(/^\s*[-*+]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();

// Live grocery/checklist card pinned on the board (references a household list).
function FridgeList({ note, onToggle }) {
  if (!note) return <div className="h-full w-full rounded-[10px] bg-white p-3 text-sm text-text-3 shadow ring-1 ring-surface-3">List removed</div>;
  const items = note.items || [];
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[10px] bg-white p-2.5 shadow ring-1 ring-surface-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text"><ListChecks className="h-4 w-4 shrink-0 text-[#e08a3c]" /> <span className="truncate">{note.title || 'List'}</span></div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
        {!items.length && <span className="text-xs text-text-3">Empty list</span>}
        {items.map((i) => {
          const h = listHeader(i.text);
          if (h) return <div key={i.id} className="mt-1 text-[10px] font-bold uppercase tracking-wide text-text-3">{h}</div>;
          return (
            <button key={i.id} onPointerDown={(e) => { e.stopPropagation(); onToggle(note, i.id); }} className="flex items-center gap-1.5 text-left">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${i.done ? 'border-transparent bg-text text-white' : 'border-surface-4'}`}>{i.done && <Check className="h-2.5 w-2.5" />}</span>
              <span className={`truncate text-xs ${i.done ? 'text-text-3 line-through' : 'text-text'}`}>{cleanListItem(i.text)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A pinned link (double-tap to open).
function FridgeLink({ item }) {
  let host = item.url;
  try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  return (
    <div className="flex h-full w-full items-center gap-2 overflow-hidden rounded-[10px] bg-white p-2.5 shadow ring-1 ring-surface-3">
      <Link2 className="h-4 w-4 shrink-0 text-[#3c8fe0]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-text">{item.title || host}</span>
        <span className="block truncate text-[10px] text-text-3">{host}</span>
      </span>
    </div>
  );
}

// A pinned appointment reminder (snapshot of a scheduled item).
function FridgeEvent({ item }) {
  return (
    <div className="flex h-full w-full items-stretch gap-2 overflow-hidden rounded-[10px] bg-white p-2.5 shadow ring-1 ring-surface-3">
      <span className="w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || '#e08a3c' }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase text-text-3"><CalendarClock className="h-3 w-3" /> {item.when}</div>
        <div className="truncate text-sm font-bold text-text">{item.title}</div>
      </div>
    </div>
  );
}

const PEN_COLORS = ['#37322b', '#e0603c', '#3c8fe0', '#3ca06a', '#9b5de5', '#e0a83c'];
const NOTE_COLORS = ['#ffe9a8', '#ffd0c4', '#cfe6ff', '#d4f0dc', '#e9dcff', '#ffe0ef'];
const VW = 1000;
const VH = 600;
const SEEN_KEY = (hid) => `commons.fridge.seen.${hid}`;
const uid = () => `it-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

// Shrink a picked image so a few can live in the board JSON without bloating it.
function downscale(file, maxDim = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve({ src: c.toDataURL('image/jpeg', quality), ratio: w / h });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function Fridge() {
  const { household, activeMemberId, members } = useApp();
  const { boards, active, loading, save, setActive, createBoard, renameBoard, deleteBoard } = useWhiteboard(household?.id);
  const { notes, toggleItem } = useNotes(household?.id);
  const { blocks } = useScheduleBlocks(household?.id);
  const { events: appRaw } = useEvents(household?.id);
  const { calendars } = useCalendars(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const [strokes, setStrokes] = useState([]);
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('move'); // 'move' | 'draw'
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [curBoardId, setCurBoardId] = useState(null);
  const [picker, setPicker] = useState(null); // 'list' | 'event' | null

  const lists = notes.filter((n) => n.kind === 'list');
  const notesById = new Map(notes.map((n) => [n.id, n]));

  // Upcoming scheduled items (next 14 days) to pin as appointment cards.
  const upcoming = useMemo(() => {
    const memberById = new Map(members.map((m) => [m.id, m]));
    const now = Date.now();
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const t0 = day0.getTime();
    const t1 = now + 14 * 86_400_000;
    const calById = new Map((calendars || []).map((c) => [c.id, c]));
    const fmtWhen = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const out = [];
    for (const b of blocks || []) {
      if (b.start_min == null) continue;
      const ms = new Date(`${b.day}T00:00`).getTime() + b.start_min * 60_000;
      if (ms < now || ms > t1) continue;
      out.push({ key: `b-${b.id}`, ms, title: b.title, color: memberById.get(b.member_id)?.color });
    }
    for (const e of expandEvents(appRaw || [], { fromMs: t0, toMs: t1, calendarsById: calById })) {
      const ms = new Date(e.start).getTime();
      if (e.allDay || ms < now || ms > t1) continue;
      out.push({ key: `a-${e.id || e.summary}-${ms}`, ms, title: e.summary, color: e.color || memberById.get(e.member_id)?.color });
    }
    for (const e of [...(gcalEvents || []), ...(workEvents || [])]) {
      const ms = new Date(e.start).getTime();
      if (e.allDay || ms < now || ms > t1) continue;
      out.push({ key: `g-${e.id || e.summary}-${ms}`, ms, title: e.summary, color: e.color || memberById.get(e.member_id)?.color });
    }
    out.sort((a, z) => a.ms - z.ms);
    return out.slice(0, 40).map((x) => ({ ...x, when: fmtWhen(x.ms) }));
  }, [blocks, appRaw, calendars, gcalEvents, workEvents, members]);

  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const drag = useRef(null);
  const imgInput = useRef(null);
  const photoInput = useRef(null);
  const navigate = useNavigate();

  // Seed local editing state from the active board — and re-seed when you switch
  // boards (dropping any corrupt entries).
  useEffect(() => {
    if (loading || !active) return;
    if (active.id !== curBoardId) {
      setStrokes((active.strokes || []).filter((s) => s && Array.isArray(s.p)));
      setItems((active.items || []).filter(Boolean));
      setCurBoardId(active.id);
      setSelectedId(null);
      setEditingId(null);
    }
  }, [loading, active, curBoardId]);

  // ── Drawing layer ──────────────────────────────────────────────────────────
  // Read live strokes through a ref so the ResizeObserver / redraw callbacks
  // never close over a stale array (which is what blanked the canvas).
  const strokesRef = useRef([]);
  strokesRef.current = strokes;

  const drawStroke = (ctx, s, sx, sy) => {
    if (!s || !Array.isArray(s.p) || s.p.length < 1) return; // skip corrupt strokes
    ctx.beginPath();
    ctx.strokeStyle = s.c || '#37322b';
    ctx.lineWidth = (s.w || 6) * sx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.p.forEach((pt, i) => {
      if (!pt) return;
      const px = pt[0] * sx; const py = pt[1] * sy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  const redrawAll = () => {
    const c = canvasRef.current;
    if (!c || !c.width) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const sx = c.width / VW; const sy = c.height / VH;
    for (const s of strokesRef.current) drawStroke(ctx, s, sx, sy);
    if (drawing.current) drawStroke(ctx, drawing.current, sx, sy); // keep the in-progress line
  };
  const sizeCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return; // ignore transient 0-size layouts
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    redrawAll();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redrawAll(); }, [strokes]);
  useEffect(() => {
    sizeCanvas();
    const ro = new ResizeObserver(() => sizeCanvas());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence (debounced) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!curBoardId) return undefined;
    const t = setTimeout(async () => {
      const row = await save(curBoardId, strokes, items, activeMemberId).catch(() => null);
      if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, items, curBoardId]);

  const toV = (e) => {
    const el = boardRef.current;
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return [0, 0];
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  };
  const clampV = (x, y) => [Math.max(0, Math.min(VW, x)), Math.max(0, Math.min(VH, y))];

  const onPenDown = (e) => {
    if (mode !== 'draw') return;
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
    drawing.current = { c: penColor, w: 6, p: [clampV(...toV(e))] };
  };
  const onPenMove = (e) => {
    if (mode !== 'draw' || !drawing.current) return;
    drawing.current.p.push(clampV(...toV(e)));
    redrawAll();
    e.preventDefault();
  };
  const onPenUp = () => {
    const stroke = drawing.current; // capture before clearing — the state updater runs later
    drawing.current = null;
    if (stroke && stroke.p.length > 1) setStrokes((s) => [...s, stroke]);
  };

  // ── Items ───────────────────────────────────────────────────────────────────
  const updateItem = (id, patch) => setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => { setItems((arr) => arr.filter((it) => it.id !== id)); setSelectedId(null); setEditingId(null); };
  // Layer order = array order (later paints on top); drawings always sit behind.
  const bringToFront = (id) => setItems((arr) => { const it = arr.find((x) => x.id === id); return it ? [...arr.filter((x) => x.id !== id), it] : arr; });
  const sendToBack = (id) => setItems((arr) => { const it = arr.find((x) => x.id === id); return it ? [it, ...arr.filter((x) => x.id !== id)] : arr; });

  const addNote = () => {
    const id = uid();
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
    setItems((arr) => [...arr, { id, type: 'note', text: '', color, x: 360 + Math.random() * 60, y: 180 + Math.random() * 60, w: 260, h: 200, rot: Math.random() * 8 - 4 }]);
    setMode('move'); setSelectedId(id); setEditingId(id);
  };
  const addImageFile = async (file) => {
    if (!file) return;
    try {
      const { src, ratio } = await downscale(file);
      const w = 340; const h = Math.round(w / (ratio || 1));
      const id = uid();
      setItems((arr) => [...arr, { id, type: 'image', src, x: 340, y: 140, w, h, rot: Math.random() * 6 - 3 }]);
      setMode('move'); setSelectedId(id);
    } catch { /* ignore */ }
  };
  const addList = (noteId) => {
    const n = notesById.get(noteId);
    const id = uid();
    setItems((arr) => [...arr, { id, type: 'list', noteId, title: n?.title || 'List', x: 330, y: 130, w: 300, h: 260, rot: Math.random() * 4 - 2 }]);
    setPicker(null); setMode('move'); setSelectedId(id);
  };
  const addEventCard = (ev) => {
    const id = uid();
    setItems((arr) => [...arr, { id, type: 'event', title: ev.title, when: ev.when, color: ev.color || '#e08a3c', x: 350, y: 150, w: 300, h: 110, rot: Math.random() * 4 - 2 }]);
    setPicker(null); setMode('move'); setSelectedId(id);
  };

  const startDrag = (e, it, kind) => {
    e.stopPropagation();
    if (editingId === it.id && kind === 'move') return; // let textarea handle taps while editing
    setSelectedId(it.id);
    const [vx, vy] = toV(e);
    drag.current = { id: it.id, kind, vx, vy, ox: it.x, oy: it.y, ow: it.w, oh: it.h };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onItemMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const [vx, vy] = toV(e);
    if (d.kind === 'move') {
      const [nx, ny] = clampV(d.ox + (vx - d.vx), d.oy + (vy - d.vy));
      updateItem(d.id, { x: nx, y: ny });
    } else {
      updateItem(d.id, { w: Math.max(90, d.ow + (vx - d.vx)), h: Math.max(80, d.oh + (vy - d.vy)) });
    }
  };
  const endDrag = () => { drag.current = null; };

  const done = async () => {
    const row = await save(curBoardId, strokes, items, activeMemberId).catch(() => null);
    if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    navigate('/');
  };

  // ── Multiple boards ─────────────────────────────────────────────────────────
  const flush = () => save(curBoardId, strokes, items, activeMemberId).catch(() => {});
  const switchBoard = async (id) => { if (id === curBoardId) return; await flush(); setActive(id); };
  const newBoard = async () => {
    const name = window.prompt('Name this board', `Board ${boards.length + 1}`);
    if (!name || !name.trim()) return;
    await flush();
    createBoard(name.trim());
  };
  const renameActiveBoard = () => { if (!active) return; const name = window.prompt('Board name', active.name); if (name && name.trim()) renameBoard(active.id, name.trim()); };
  const deleteActiveBoard = () => { if (active && boards.length > 1 && window.confirm(`Delete board “${active.name}”?`)) deleteBoard(active.id); };

  const addLink = () => {
    let url = window.prompt('Paste a link (URL)');
    if (!url || !url.trim()) return;
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const label = (window.prompt('Label (optional)', '') || '').trim();
    const id = uid();
    setItems((arr) => [...arr, { id, type: 'link', url, title: label, x: 340, y: 150, w: 300, h: 90, rot: Math.random() * 4 - 2 }]);
    setMode('move'); setSelectedId(id);
  };

  const pct = (v, span) => `${(v / span) * 100}%`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={done} className="cd-btn cd-btn--ghost flex items-center gap-1.5"><ChevronLeft className="h-4 w-4" /> Done</button>
        <h2 className="text-base font-bold text-text">The fridge</h2>
        <div className="flex items-center gap-1.5">
          {mode === 'draw' && (
            <button onClick={() => setStrokes((s) => s.slice(0, -1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1" aria-label="Undo stroke"><Undo2 className="h-4 w-4" /></button>
          )}
          <button
            onClick={() => { if (window.confirm('Clear the whole fridge?')) { setStrokes([]); setItems([]); setSelectedId(null); } }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:text-red-500"
            aria-label="Clear board"
          ><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Board switcher (saved views) */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => switchBoard(b.id)}
            onDoubleClick={() => { if (b.id === curBoardId) renameActiveBoard(); }}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${b.id === curBoardId ? 'border-[#e08a3c] bg-surface-1 text-text' : 'border-surface-3 text-text-2 hover:bg-surface-1'}`}
          >
            {b.name}
          </button>
        ))}
        <button onClick={newBoard} aria-label="New board" title="New board" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-surface-3 text-text-3 hover:bg-surface-1"><Plus className="h-4 w-4" /></button>
        {boards.length > 1 && (
          <button onClick={deleteActiveBoard} aria-label="Delete board" title="Delete this board" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-surface-3 text-text-3 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-surface-3 p-0.5">
          <button onClick={() => setMode('move')} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${mode === 'move' ? 'bg-text text-white' : 'text-text-2'}`}><Hand className="h-4 w-4" /> Move</button>
          <button onClick={() => { setMode('draw'); setSelectedId(null); setEditingId(null); }} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${mode === 'draw' ? 'bg-text text-white' : 'text-text-2'}`}><Pencil className="h-4 w-4" /> Draw</button>
        </div>
        <button onClick={addNote} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><Type className="h-4 w-4" /> Note</button>
        <button onClick={() => imgInput.current?.click()} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><ImagePlus className="h-4 w-4" /> Image</button>
        <button onClick={() => photoInput.current?.click()} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><Camera className="h-4 w-4" /> Photo</button>
        <button onClick={() => setPicker('list')} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> List</button>
        <button onClick={() => setPicker('event')} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Pin</button>
        <button onClick={addLink} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><Link2 className="h-4 w-4" /> Link</button>

        {mode === 'draw' && (
          <div className="flex items-center gap-1.5">
            {PEN_COLORS.map((c) => (
              <button key={c} onClick={() => setPenColor(c)} className={`h-6 w-6 rounded-full transition-transform ${penColor === c ? 'scale-110 ring-2 ring-offset-2' : ''}`} style={{ backgroundColor: c }} aria-label={`pen ${c}`} />
            ))}
          </div>
        )}
      </div>

      <input ref={imgInput} type="file" accept="image/*" className="hidden" onChange={(e) => { addImageFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addImageFile(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="cd-card flex min-h-0 flex-1 !p-1.5">
        <div
          ref={boardRef}
          onPointerDown={() => { if (mode === 'move') { setSelectedId(null); setEditingId(null); } }}
          className="relative h-full w-full overflow-hidden rounded-lg bg-white"
          style={{ touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPenDown}
            onPointerMove={onPenMove}
            onPointerUp={onPenUp}
            onPointerCancel={onPenUp}
            className="absolute inset-0 h-full w-full"
            style={{ pointerEvents: mode === 'draw' ? 'auto' : 'none', touchAction: 'none' }}
          />

          {items.map((it) => {
            const sel = selectedId === it.id;
            const editing = editingId === it.id;
            return (
              <div
                key={it.id}
                onPointerDown={(e) => startDrag(e, it, 'move')}
                onPointerMove={onItemMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={(e) => { e.stopPropagation(); if (it.type === 'note') setEditingId(it.id); else if (it.type === 'link') window.open(it.url, '_blank', 'noopener'); }}
                className={`absolute ${sel ? 'z-20' : 'z-10'} ${editing ? '' : 'cursor-grab active:cursor-grabbing'} ${sel ? 'outline outline-2 outline-[#e08a3c]' : ''}`}
                style={{
                  left: pct(it.x, VW), top: pct(it.y, VH), width: pct(it.w, VW), height: pct(it.h, VH),
                  transform: `rotate(${it.rot || 0}deg)`,
                  pointerEvents: mode === 'move' ? 'auto' : 'none',
                  touchAction: 'none',
                  borderRadius: 10,
                }}
              >
                {it.type === 'image' ? (
                  <img src={it.src} alt="" draggable={false} className="h-full w-full select-none rounded-[10px] object-cover shadow" />
                ) : it.type === 'list' ? (
                  <FridgeList note={notesById.get(it.noteId)} onToggle={toggleItem} />
                ) : it.type === 'event' ? (
                  <FridgeEvent item={it} />
                ) : it.type === 'link' ? (
                  <FridgeLink item={it} />
                ) : editing ? (
                  <textarea
                    autoFocus
                    value={it.text}
                    onChange={(e) => updateItem(it.id, { text: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder="Write a note…"
                    className="h-full w-full resize-none rounded-[10px] border-none p-3 text-base font-semibold text-[#37322b] shadow outline-none"
                    style={{ backgroundColor: it.color }}
                  />
                ) : (
                  <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words rounded-[10px] p-3 text-base font-semibold text-[#37322b] shadow" style={{ backgroundColor: it.color }}>
                    {it.text || <span className="text-[#37322b]/40">Note</span>}
                  </div>
                )}

                {sel && mode === 'move' && (
                  <>
                    <div className="absolute -left-2 -top-2 flex gap-1">
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); bringToFront(it.id); }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-text text-white shadow"
                        aria-label="Bring to front"
                      ><BringToFront className="h-3.5 w-3.5" /></button>
                      <button
                        onPointerDown={(e) => { e.stopPropagation(); sendToBack(it.id); }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-text shadow ring-1 ring-surface-3"
                        aria-label="Send to back"
                      ><SendToBack className="h-3.5 w-3.5" /></button>
                    </div>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); removeItem(it.id); }}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-text text-white shadow"
                      aria-label="Delete"
                    ><X className="h-3.5 w-3.5" /></button>
                    <span
                      onPointerDown={(e) => startDrag(e, it, 'resize')}
                      className="absolute -bottom-1.5 -right-1.5 h-5 w-5 cursor-se-resize rounded-full border-2 border-white bg-[#e08a3c] shadow"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-text-3">
        {mode === 'draw' ? 'Drawing — pick a color and doodle. Switch to Move to add notes, lists & photos.' : 'Drag to move, corner to resize. Double-tap a note to edit or a link to open. Pin lists, appointments, links & photos. Use the chips above to switch or add boards.'}
      </p>

      {picker && (
        <div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center" onClick={() => setPicker(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative max-h-[75vh] w-full max-w-md overflow-auto rounded-t-2xl border border-surface-3 bg-bg p-3 pb-safe shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-base font-bold text-text">{picker === 'list' ? 'Pin a list' : 'Pin an appointment'}</h3>
              <button onClick={() => setPicker(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><X className="h-4 w-4" /></button>
            </div>
            {picker === 'list' ? (
              <div className="flex flex-col gap-1.5">
                {!lists.length && <p className="cd-mono-label py-6 text-center">no lists yet — make one in Notes &amp; Lists</p>}
                {lists.map((l) => (
                  <button key={l.id} onClick={() => addList(l.id)} className="flex items-center gap-2.5 rounded-btn border border-surface-3 p-2.5 text-left hover:bg-surface-1">
                    <ListChecks className="h-4 w-4 shrink-0 text-[#e08a3c]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">{l.title || 'Untitled list'}</span>
                    <span className="cd-mono-label shrink-0">{(l.items || []).filter((i) => !listHeader(i.text)).length} items</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {!upcoming.length && <p className="cd-mono-label py-6 text-center">nothing scheduled in the next two weeks</p>}
                {upcoming.map((ev) => (
                  <button key={ev.key} onClick={() => addEventCard(ev)} className="flex items-center gap-2.5 rounded-btn border border-surface-3 p-2.5 text-left hover:bg-surface-1">
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ev.color || '#e08a3c' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-text">{ev.title}</span>
                      <span className="font-mono text-[10px] text-text-3">{ev.when}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
