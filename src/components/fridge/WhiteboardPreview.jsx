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
        if (it.type === 'list' || it.type === 'event') {
          return (
            <g key={it.id} transform={t}>
              <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={10} fill="#ffffff" stroke="#e4ddd0" />
              <rect x={it.x} y={it.y} width={10} height={it.h} rx={5} fill={it.color || '#e08a3c'} />
              <foreignObject x={it.x + 16} y={it.y} width={Math.max(20, it.w - 24)} height={it.h}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ padding: '10px 4px', color: '#37322b', overflow: 'hidden', height: '100%' }}>
                  <div style={{ font: '700 26px/1.2 "DM Sans", sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.type === 'list' ? `📋 ${it.title || 'List'}` : it.title}
                  </div>
                  {it.type === 'event' && <div style={{ font: '600 20px "DM Mono", monospace', color: '#8a8172', marginTop: 4 }}>{it.when}</div>}
                </div>
              </foreignObject>
            </g>
          );
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
