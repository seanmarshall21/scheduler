import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// App-native events that live in Commons. CRUD here; recurrence is expanded into
// individual calendar occurrences by `expandEvents` (below) for a view window.
const cache = { householdId: null, rows: null, fetchedAt: 0 };
const STALE_MS = 60_000;
const DAY_MS = 86_400_000;

export function useEvents(householdId) {
  const valid = cache.householdId === householdId;
  const [events, setEvents] = useState(valid ? cache.rows ?? [] : []);
  const [loading, setLoading] = useState(!valid || !cache.rows);
  const inFlight = useRef(false);

  const setAll = (next) => {
    cache.rows = next;
    cache.householdId = householdId;
    setEvents(next);
  };

  const fetchRows = useCallback(
    async ({ background = false } = {}) => {
      if (!householdId || inFlight.current) return;
      inFlight.current = true;
      if (!background && cache.householdId !== householdId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('household_id', householdId)
          .order('starts_at', { ascending: true });
        if (error) throw error;
        cache.rows = data ?? [];
        cache.householdId = householdId;
        cache.fetchedAt = Date.now();
        setEvents(cache.rows);
      } catch (e) {
        console.error('[events] fetch failed:', e.message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [householdId]
  );

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || !cache.rows) fetchRows();
    else if (Date.now() - cache.fetchedAt > STALE_MS) fetchRows({ background: true });
  }, [householdId, fetchRows]);

  const addEvent = useCallback(
    async (row) => {
      const { data, error } = await supabase
        .from('events')
        .insert({ household_id: householdId, ...row })
        .select()
        .single();
      if (error) throw error;
      setAll([...(cache.rows ?? []), data]);
      return data;
    },
    [householdId]
  );

  const updateEvent = useCallback(async (id, patch) => {
    const prev = cache.rows ?? [];
    setAll(prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const { error } = await supabase
      .from('events')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  const removeEvent = useCallback(async (id) => {
    const prev = cache.rows ?? [];
    setAll(prev.filter((e) => e.id !== id));
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  return {
    events,
    loading,
    refetch: () => fetchRows({ background: true }),
    addEvent,
    updateEvent,
    removeEvent,
  };
}

function addStep(date, repeat) {
  const d = new Date(date);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d;
}

function toOccurrence(ev, startDate, durMs, color, idx) {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + durMs);
  return {
    id: `appev-${ev.id}-${idx}`,
    member_id: ev.member_id,
    summary: ev.title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: Boolean(ev.all_day),
    color,
    source: 'app',
    eventId: ev.id,
  };
}

// Expand app-native events into FamilyCalendar occurrences for [fromMs, toMs].
// Honors per-calendar color + visibility; expands simple recurrence.
export function expandEvents(events, { fromMs, toMs, calendarsById }) {
  const out = [];
  for (const ev of events || []) {
    const cal = calendarsById?.get(ev.calendar_id);
    if (cal && cal.is_visible === false) continue;
    const color = cal?.color || '#3c8fe0';
    const baseStart = new Date(ev.starts_at);
    const durMs = ev.ends_at
      ? Math.max(0, new Date(ev.ends_at) - baseStart)
      : ev.all_day
      ? DAY_MS
      : 60 * 60_000;
    const untilMs = ev.repeat_until ? new Date(`${ev.repeat_until}T23:59:59`).getTime() : Infinity;

    if (!ev.repeat || ev.repeat === 'none') {
      const s = baseStart.getTime();
      if (s + durMs >= fromMs && s <= toMs) out.push(toOccurrence(ev, baseStart, durMs, color, 0));
      continue;
    }

    let cur = new Date(baseStart);
    // Fast-forward daily/weekly to the window so a long-running repeat is cheap.
    if (ev.repeat === 'daily' || ev.repeat === 'weekly') {
      const stepMs = (ev.repeat === 'daily' ? 1 : 7) * DAY_MS;
      if (cur.getTime() < fromMs - durMs) {
        const jumps = Math.floor((fromMs - durMs - cur.getTime()) / stepMs);
        if (jumps > 0) cur = new Date(cur.getTime() + jumps * stepMs);
      }
    }
    let guard = 0;
    while (cur.getTime() <= toMs && cur.getTime() <= untilMs && guard < 800) {
      guard += 1;
      const s = cur.getTime();
      if (s + durMs >= fromMs && s <= toMs) out.push(toOccurrence(ev, cur, durMs, color, guard));
      cur = addStep(cur, ev.repeat);
    }
  }
  return out;
}
