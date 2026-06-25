import { useRef, useState } from 'react';
import { Mic, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useScheduleBlocks } from '../../hooks/useScheduleBlocks';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar';
import { useWorkSchedule } from '../../hooks/useWorkSchedule';
import { useCalendars } from '../../hooks/useCalendars';
import { useEvents, expandEvents } from '../../hooks/useEvents';
import { useTasks } from '../../hooks/useTasks';
import { useNotes } from '../../hooks/useNotes';
import { isoDay } from '../calendar/FamilyCalendar';

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function Assistant({ onClose }) {
  const { household, members, activeMemberId } = useApp();
  const { blocks, refetch: refetchBlocks } = useScheduleBlocks(household?.id);
  const { events: gcalEvents } = useGoogleCalendar();
  const { events: workEvents } = useWorkSchedule();
  const { calendars } = useCalendars(household?.id);
  const { events: appRaw, refetch: refetchEvents } = useEvents(household?.id);
  const { tasks, refetch: refetchTasks } = useTasks(household?.id);
  const { notes, refetch: refetchNotes } = useNotes(household?.id);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const scrollRef = useRef(null);

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'someone';

  const buildContext = () => {
    const t0 = startOfToday();
    const toMs = Date.now() + 10 * DAY_MS;
    const inWin = (ts) => ts >= t0 && ts <= toMs;
    const entries = [];
    for (const b of blocks || []) {
      const ts = new Date(`${b.day}T00:00`).getTime();
      if (!inWin(ts)) continue;
      entries.push({ day: b.day, time: b.start_min != null ? fmtMin(b.start_min) : 'unset', title: b.title, who: nameOf(b.member_id) });
    }
    const calById = new Map((calendars || []).map((c) => [c.id, c]));
    for (const e of expandEvents(appRaw, { fromMs: t0, toMs, calendarsById: calById })) {
      const s = new Date(e.start);
      entries.push({ day: isoDay(s.getTime()), time: hm(s), title: e.summary, who: nameOf(e.member_id) });
    }
    for (const e of [...(gcalEvents || []), ...(workEvents || [])]) {
      if (e.allDay) continue;
      const s = new Date(e.start).getTime();
      if (!inWin(s)) continue;
      entries.push({ day: isoDay(s), time: hm(new Date(s)), title: e.summary, who: nameOf(e.member_id) });
    }
    entries.sort((a, z) => a.day.localeCompare(z.day) || a.time.localeCompare(z.time));
    return {
      householdId: household?.id,
      activeMemberId,
      today: isoDay(Date.now()),
      members: members.map((m) => ({ id: m.id, name: m.name })),
      schedule: entries.slice(0, 80),
      tasks: (tasks || []).filter((t) => !t.done).map((t) => ({ title: t.title, who: t.assigned_to ? nameOf(t.assigned_to) : 'anyone', due: t.due_date || null })),
      lists: (notes || []).filter((n) => n.kind === 'list').map((n) => ({ note_id: n.id, title: n.title, items: (n.items || []).map((i) => i.text) })),
    };
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/.netlify/functions/assistant', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context: buildContext() }),
      });
      const json = await res.json();
      const reply = json.reply || json.error || 'Hmm, something went wrong.';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
      if (json.actions?.length) {
        refetchTasks?.();
        refetchEvents?.();
        refetchNotes?.();
        refetchBlocks?.();
      }
      if (speak && reply && window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'I couldn’t reach the assistant.' }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
    }
  };

  const micAvailable = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => { setListening(false); send(e.results[0][0].transcript); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const suggestions = ['Anything on Thursday?', "What's due today?", 'Add milk to the groceries'];

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-surface-3 bg-bg shadow-xl sm:h-[70vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-surface-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: '#e08a3c' }} />
            <h3 className="text-base font-bold text-text">Ask Commons</h3>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSpeak((s) => !s)} title="Speak replies aloud" className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1">
              {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-text-3 hover:bg-surface-1"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div ref={scrollRef} className="cd-scroll flex-1 space-y-3 p-4">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3 pt-6 text-center">
              <p className="text-sm text-text-2">Ask about the schedule, or tell me to add a task, event, or list item.</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border border-surface-3 px-3 py-1 text-xs text-text-2 hover:bg-surface-1">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-text text-white' : 'bg-surface-1 text-text'}`}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="flex justify-start"><div className="rounded-2xl bg-surface-1 px-3 py-2 text-sm text-text-3 animate-pulse">…</div></div>}
        </div>

        <div className="flex items-center gap-2 border-t border-surface-3 p-3">
          {micAvailable && (
            <button onClick={toggleMic} aria-label="Speak" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-[#e0603c] text-white' : 'border border-surface-3 text-text-2'}`}>
              <Mic className="h-5 w-5" />
            </button>
          )}
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask or tell Commons…" className="cd-input flex-1" />
          <button onClick={() => send()} disabled={busy || !input.trim()} className="cd-btn cd-btn--accent flex h-10 w-10 shrink-0 items-center justify-center !p-0"><Send className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
