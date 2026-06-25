import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWhiteboard } from '../hooks/useWhiteboard';

const COLORS = ['#37322b', '#e0603c', '#3c8fe0', '#3ca06a', '#9b5de5', '#e0a83c'];
const VW = 1000;
const VH = 600;
const SEEN_KEY = (hid) => `commons.fridge.seen.${hid}`;

export default function Fridge() {
  const { household, activeMemberId } = useApp();
  const { strokes: initial, loading, save } = useWhiteboard(household?.id);
  const [strokes, setStrokes] = useState([]);
  const [color, setColor] = useState(COLORS[0]);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const navigate = useNavigate();

  // Seed local strokes from the loaded board once.
  useEffect(() => {
    if (!loading && !ready) {
      setStrokes(initial || []);
      setReady(true);
    }
  }, [loading, initial, ready]);

  const drawStroke = (ctx, s, scale) => {
    if (!s.p || s.p.length < 1) return;
    ctx.beginPath();
    ctx.strokeStyle = s.c || '#37322b';
    ctx.lineWidth = (s.w || 6) * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.p.forEach(([x, y], i) => {
      const px = x * scale;
      const py = y * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const scale = c.width / VW;
    for (const s of strokes) drawStroke(ctx, s, scale);
  };

  const sizeCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width);
    c.height = Math.round(r.height);
    redraw();
  };

  useEffect(() => { redraw(); }); // keep canvas in sync with strokes

  useEffect(() => {
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
    return () => window.removeEventListener('resize', sizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave once seeded.
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(async () => {
      const row = await save(strokes, activeMemberId).catch(() => null);
      if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, ready]);

  const toV = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [
      Math.max(0, Math.min(VW, ((e.clientX - r.left) / r.width) * VW)),
      Math.max(0, Math.min(VH, ((e.clientY - r.top) / r.height) * VH)),
    ];
  };

  const onDown = (e) => {
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = { c: color, w: 6, p: [toV(e)] };
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    const p = toV(e);
    const prev = drawing.current.p[drawing.current.p.length - 1];
    drawing.current.p.push(p);
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    const scale = c.width / VW;
    ctx.strokeStyle = drawing.current.c;
    ctx.lineWidth = drawing.current.w * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev[0] * scale, prev[1] * scale);
    ctx.lineTo(p[0] * scale, p[1] * scale);
    ctx.stroke();
    e.preventDefault();
  };
  const onUp = () => {
    if (drawing.current && drawing.current.p.length > 1) setStrokes((s) => [...s, drawing.current]);
    drawing.current = null;
  };

  const done = async () => {
    const row = await save(strokes, activeMemberId).catch(() => null);
    if (row && household?.id) localStorage.setItem(SEEN_KEY(household.id), row.updated_at);
    navigate('/');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={done} className="cd-btn cd-btn--ghost flex items-center gap-1.5"><ChevronLeft className="h-4 w-4" /> Done</button>
        <h2 className="text-base font-bold text-text">The fridge</h2>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setStrokes((s) => s.slice(0, -1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:bg-surface-1" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button onClick={() => setStrokes([])} className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-3 text-text-2 hover:text-red-500" aria-label="Clear"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-offset-2' : ''}`}
            style={{ backgroundColor: c }} aria-label={`color ${c}`} />
        ))}
      </div>

      <div className="cd-card flex min-h-0 flex-1 items-center justify-center !p-2">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="aspect-[5/3] w-full max-w-[900px] rounded-lg bg-white"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  );
}
