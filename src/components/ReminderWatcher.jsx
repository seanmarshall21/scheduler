import { useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useReminders } from '../hooks/useReminders';
import { speak } from '../lib/speech';

export const REMINDER_SPEAK_KEY = 'commons.reminders.speak';

// Fires reminders while Commons is open (perfect for the always-on kitchen
// screen): an on-screen card, an OS notification if allowed, and — by default —
// the reminder spoken aloud. Background delivery (app closed) is a later add.
export default function ReminderWatcher() {
  const { household } = useApp();
  const { reminders, refetch, markFired } = useReminders(household?.id);
  const [toasts, setToasts] = useState([]);
  const firedLocal = useRef(new Set());

  useEffect(() => {
    const fire = (r) => {
      setToasts((cur) => (cur.some((t) => t.id === r.id) ? cur : [...cur, r]));
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Commons reminder', { body: r.text });
        }
      } catch { /* ignore */ }
      if (localStorage.getItem(REMINDER_SPEAK_KEY) !== '0') speak(`Reminder. ${r.text}`);
    };
    const tick = () => {
      const now = Date.now();
      for (const r of reminders) {
        if (r.fired || firedLocal.current.has(r.id)) continue;
        if (new Date(r.remind_at).getTime() <= now) {
          firedLocal.current.add(r.id);
          markFired(r.id);
          fire(r);
        }
      }
    };
    tick();
    const t = setInterval(tick, 20_000);
    const t2 = setInterval(() => refetch(), 60_000); // pick up reminders set on other devices
    return () => { clearInterval(t); clearInterval(t2); };
  }, [reminders, markFired, refetch]);

  const dismiss = (id) => setToasts((cur) => cur.filter((t) => t.id !== id));

  if (!toasts.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-[120] flex flex-col items-center gap-2 px-3 md:bottom-8">
      {toasts.map((t) => (
        <div key={t.id} className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-[#e0b07c] bg-gradient-to-r from-[#f7dcab] to-[#e9a44d] px-4 py-3 shadow-xl">
          <BellRing className="h-5 w-5 shrink-0 text-text" />
          <span className="min-w-0 flex-1 text-sm font-bold text-text">{t.text}</span>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-black/10"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
