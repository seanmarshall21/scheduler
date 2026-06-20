import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import MemberChip from './MemberChip';

// "Who's home / who am I" picker for the kiosk. Big tap targets so anyone can
// switch the active person from across the kitchen. Two modes:
//   - variant="overlay": fullscreen pick screen (shown when no one is active)
//   - variant="bar": a compact horizontal strip for the top of the app shell
export default function MemberSwitcher({ variant = 'bar' }) {
  const { members, activeMemberId, setActiveMember } = useApp();
  const [open, setOpen] = useState(false);

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-8 bg-bg p-8 animate-fade-in">
        <div className="text-center">
          <div className="cd-mono-label">Hearth</div>
          <h1 className="mt-1 text-3xl font-bold text-text">Who's using this?</h1>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveMember(m.id)}
              className="flex flex-col items-center gap-3 rounded-card p-4 transition-transform active:scale-95 hover:bg-surface-1"
            >
              <MemberChip member={m} size={96} />
              <span className="text-lg font-bold text-text">{m.name}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setActiveMember('__guest__')} className="cd-btn cd-btn--ghost">
          Just looking — skip
        </button>
      </div>
    );
  }

  // Compact bar with a popover.
  const active = members.find((m) => m.id === activeMemberId);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-surface-3 bg-surface-0 py-1 pl-1 pr-3 shadow-sm transition-colors hover:bg-surface-1"
      >
        {active ? <MemberChip member={active} size={32} /> : (
          <span className="flex h-8 w-8 items-center justify-center rounded-squircle bg-surface-3 text-text-2">?</span>
        )}
        <span className="text-sm font-bold text-text">{active ? active.name : 'Who am I?'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-surface-3 bg-white p-2 shadow-md">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveMember(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-btn p-2 text-left transition-colors hover:bg-surface-1"
              >
                <MemberChip member={m} size={32} />
                <span className="flex-1 text-sm font-medium text-text">{m.name}</span>
                {m.id === activeMemberId && <Check className="h-4 w-4 text-text-2" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
