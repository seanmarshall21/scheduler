// Read-only render of the fridge strokes (virtual 1000x600 space) as SVG.
export default function WhiteboardPreview({ strokes = [], className = '' }) {
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" className={className}>
      {strokes.map((s, i) => (
        <polyline
          key={i}
          points={(s.p || []).map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={s.c || '#37322b'}
          strokeWidth={s.w || 6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
