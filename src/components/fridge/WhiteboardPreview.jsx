// Read-only render of the fridge board (virtual 1000x600 space) as SVG:
// freehand strokes plus placed items (text notes + images/photos).
export default function WhiteboardPreview({ strokes = [], items = [], className = '' }) {
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" className={className}>
      {strokes.map((s, i) => (
        <polyline
          key={`s-${i}`}
          points={(s.p || []).map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={s.c || '#37322b'}
          strokeWidth={s.w || 6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {items.map((it) => {
        const t = `rotate(${it.rot || 0} ${it.x + it.w / 2} ${it.y + it.h / 2})`;
        if (it.type === 'image') {
          return <image key={it.id} href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} transform={t} preserveAspectRatio="xMidYMid slice" />;
        }
        return (
          <g key={it.id} transform={t}>
            <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={10} fill={it.color || '#ffe9a8'} />
            <foreignObject x={it.x} y={it.y} width={it.w} height={it.h}>
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                style={{ padding: 12, font: '600 26px/1.25 "DM Sans", sans-serif', color: '#37322b', wordBreak: 'break-word', overflow: 'hidden', height: '100%' }}
              >
                {it.text}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
