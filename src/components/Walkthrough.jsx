import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';

// Spotlight onboarding tour. Give it `steps` ([{ selector, title, body }]) and it
// dims the page, highlights each target element, and explains it. Clicking the
// dim or "Next" advances; "Done"/X closes. Targets are found by CSS selector
// (use data-tour="…" attributes on the elements you want to point at).
const PAD = 6;
const CARD_W = 300;

export default function Walkthrough({ steps = [], onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = step?.selector ? document.querySelector(step.selector) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    const el = step?.selector ? document.querySelector(step.selector) : null;
    if (el) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      const t = setTimeout(measure, 280);
      return () => clearTimeout(t);
    }
    setRect(null);
  }, [i, step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  if (!step) return null;

  const last = i === steps.length - 1;
  const next = () => (last ? onClose() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  let cardTop;
  let cardLeft;
  if (rect) {
    const below = rect.bottom + 190 < window.innerHeight;
    cardTop = below ? rect.bottom + 12 : Math.max(12, rect.top - 182);
    cardLeft = Math.min(Math.max(12, rect.left), window.innerWidth - CARD_W - 12);
  } else {
    cardTop = window.innerHeight / 2 - 100;
    cardLeft = window.innerWidth / 2 - CARD_W / 2;
  }

  return (
    <div className="fixed inset-0 z-[200]">
      {/* click the dim to advance */}
      <div className="absolute inset-0" onClick={next} />

      {rect && (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-white/90"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(20,20,20,0.6)',
          }}
        />
      )}

      <div
        className="fixed w-[300px] rounded-2xl border border-surface-3 bg-white p-4 shadow-xl"
        style={{ top: cardTop, left: cardLeft }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold text-text">{step.title}</h4>
          <button onClick={onClose} className="text-text-3 hover:text-text" aria-label="Close tour"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-text-2">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="cd-mono-label">{i + 1} / {steps.length}</span>
          <div className="flex items-center gap-2">
            {i > 0 && <button onClick={back} className="cd-btn cd-btn--ghost !py-1.5 text-xs">Back</button>}
            <button onClick={next} className="cd-btn cd-btn--accent !py-1.5 text-xs">{last ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
