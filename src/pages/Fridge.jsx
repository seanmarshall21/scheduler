import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ChevronLeft, ImagePlus, Pencil, Trash2, Type, Undo2, X, Hand } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWhiteboard } from '../hooks/useWhiteboard';

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
  const { household, activeMemberId } = useApp();
  const { strokes: initStrokes, items: initItems, loading, save } = useWhiteboard(household?.id);
  const [strokes, setStrokes] = useState([]);
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('move'); // 'move' | 'draw'
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [ready, setReady] = useState(false);

  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const drag = useRef(null);
  const imgInput = useRef(null);
  const photoInput = useRef(null);
  const navigate = useNavigate();

  // Seed local state from the loaded board once.
  useEffect(() => {
    if (!loading && !ready) {
      setStrokes(initStrokes || []);
      setItems(initItems || []);
      setReady(true);
    }
  }, [loading, initStrokes, initItems, ready]);

  // ── Drawing layer ──────────────────────────────────────────────────────────
  // Read live strokes through a ref so the ResizeObserver / redraw callbacks
  // never close over a stale array (which is what blanked the canvas).
  const strokesRef = useRef([]);
  strokesRef.current = strokes;

  const drawStroke = (ctx, s, scale) => {
    if (!s.p || s.p.length < 1) return;
    ctx.beginPath();
    ctx.strokeStyle = s.c || '#37322b';
    ctx.lineWidth = (s.w || 6) * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.p.forEach(([x, y], i) => {
      const px = x * scale; const py = y * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  const redrawAll = () => {
    const c = canvasRef.current;
    if (!c || !c.width) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const scale = c.width / VW;
    for (const s of strokesRef.current) drawStroke(ctx, s, scale);
    if (drawing.current) drawStroke(ctx, drawing.current, scale); // keep the in-progress line
  };
  const sizeCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return; // ignore transient 0-size layouts
    const dpr = window.devicePixelRatio || 1;
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
    if (!ready) return undefined;
    const t = setTimeout(async () => {
      const row = await save(strokes, items, activeMemberId).catch(() => null);
      if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, items, ready]);

  const toV = (e) => {
    const r = boardRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  };
  const clampV = (x, y) => [Math.max(0, Math.min(VW, x)), Math.max(0, Math.min(VH, y))];

  const onPenDown = (e) => {
    if (mode !== 'draw') return;
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = { c: penColor, w: 6, p: [clampV(...toV(e))] };
  };
  const onPenMove = (e) => {
    if (mode !== 'draw' || !drawing.current) return;
    drawing.current.p.push(clampV(...toV(e)));
    redrawAll();
    e.preventDefault();
  };
  const onPenUp = () => {
    if (drawing.current && drawing.current.p.length > 1) setStrokes((s) => [...s, drawing.current]);
    drawing.current = null;
  };

  // ── Items ───────────────────────────────────────────────────────────────────
  const updateItem = (id, patch) => setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => { setItems((arr) => arr.filter((it) => it.id !== id)); setSelectedId(null); setEditingId(null); };

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
    const row = await save(strokes, items, activeMemberId).catch(() => null);
    if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    navigate('/');
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-surface-3 p-0.5">
          <button onClick={() => setMode('move')} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${mode === 'move' ? 'bg-text text-white' : 'text-text-2'}`}><Hand className="h-4 w-4" /> Move</button>
          <button onClick={() => { setMode('draw'); setSelectedId(null); setEditingId(null); }} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm ${mode === 'draw' ? 'bg-text text-white' : 'text-text-2'}`}><Pencil className="h-4 w-4" /> Draw</button>
        </div>
        <button onClick={addNote} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><Type className="h-4 w-4" /> Note</button>
        <button onClick={() => imgInput.current?.click()} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><ImagePlus className="h-4 w-4" /> Image</button>
        <button onClick={() => photoInput.current?.click()} className="cd-btn cd-btn--secondary flex items-center gap-1.5"><Camera className="h-4 w-4" /> Photo</button>

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

      <div className="cd-card flex min-h-0 flex-1 items-center justify-center !p-2">
        <div
          ref={boardRef}
          onPointerDown={() => { if (mode === 'move') { setSelectedId(null); setEditingId(null); } }}
          className="relative aspect-[5/3] w-full max-w-[900px] overflow-hidden rounded-lg bg-white"
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
                onDoubleClick={(e) => { e.stopPropagation(); if (it.type === 'note') setEditingId(it.id); }}
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
        {mode === 'draw' ? 'Drawing — pick a color and doodle. Switch to Move to add notes & photos.' : 'Tap an item to select; drag to move, corner to resize, double-tap a note to edit.'}
      </p>
    </div>
  );
}
