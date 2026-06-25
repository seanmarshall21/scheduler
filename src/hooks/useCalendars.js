import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// App-native calendars (your own named, colored calendars that live in Commons).
// Module cache keyed by household, mirroring useScheduleBlocks.
const cache = { householdId: null, rows: null, fetchedAt: 0 };
const STALE_MS = 60_000;

export function useCalendars(householdId) {
  const valid = cache.householdId === householdId;
  const [calendars, setCalendars] = useState(valid ? cache.rows ?? [] : []);
  const [loading, setLoading] = useState(!valid || !cache.rows);
  const inFlight = useRef(false);

  const setAll = (next) => {
    cache.rows = next;
    cache.householdId = householdId;
    setCalendars(next);
  };

  const fetchRows = useCallback(
    async ({ background = false } = {}) => {
      if (!householdId || inFlight.current) return;
      inFlight.current = true;
      if (!background && cache.householdId !== householdId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('calendars')
          .select('*')
          .eq('household_id', householdId)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        cache.rows = data ?? [];
        cache.householdId = householdId;
        cache.fetchedAt = Date.now();
        setCalendars(cache.rows);
      } catch (e) {
        console.error('[calendars] fetch failed:', e.message);
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

  const addCalendar = useCallback(
    async (row) => {
      const { data, error } = await supabase
        .from('calendars')
        .insert({ household_id: householdId, sort_order: cache.rows?.length ?? 0, ...row })
        .select()
        .single();
      if (error) throw error;
      setAll([...(cache.rows ?? []), data]);
      return data;
    },
    [householdId]
  );

  const updateCalendar = useCallback(async (id, patch) => {
    const prev = cache.rows ?? [];
    setAll(prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase
      .from('calendars')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  const removeCalendar = useCallback(async (id) => {
    const prev = cache.rows ?? [];
    setAll(prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('calendars').delete().eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  return {
    calendars,
    loading,
    refetch: () => fetchRows({ background: true }),
    addCalendar,
    updateCalendar,
    removeCalendar,
  };
}
