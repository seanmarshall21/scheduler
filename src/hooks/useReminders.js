import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Household reminders. Module-cached; the watcher polls for due ones.
const cache = { householdId: null, items: null, at: 0 };
const STALE_MS = 30_000;

export function useReminders(householdId) {
  const valid = cache.householdId === householdId && cache.items;
  const [reminders, setReminders] = useState(valid ? cache.items : []);
  const inFlight = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!householdId || inFlight.current) return;
    inFlight.current = true;
    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('household_id', householdId)
        .order('remind_at', { ascending: true });
      if (error) throw error;
      cache.items = data ?? [];
      cache.householdId = householdId;
      cache.at = Date.now();
      setReminders(cache.items);
    } catch (e) {
      console.error('[reminders] fetch failed:', e.message);
    } finally {
      inFlight.current = false;
    }
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || !cache.items || Date.now() - cache.at > STALE_MS) fetchAll();
  }, [householdId, fetchAll]);

  const addReminder = useCallback(async ({ text, remind_at, member_id = null, created_by = null }) => {
    const { data, error } = await supabase
      .from('reminders')
      .insert({ household_id: householdId, text, remind_at, member_id, created_by })
      .select()
      .single();
    if (error) throw error;
    cache.items = [...(cache.items ?? []), data].sort((a, z) => new Date(a.remind_at) - new Date(z.remind_at));
    setReminders(cache.items);
    return data;
  }, [householdId]);

  const markFired = useCallback(async (id) => {
    cache.items = (cache.items ?? []).map((r) => (r.id === id ? { ...r, fired: true } : r));
    setReminders(cache.items);
    await supabase.from('reminders').update({ fired: true }).eq('id', id);
  }, []);

  const removeReminder = useCallback(async (id) => {
    cache.items = (cache.items ?? []).filter((r) => r.id !== id);
    setReminders(cache.items);
    await supabase.from('reminders').delete().eq('id', id);
  }, []);

  return { reminders, refetch: fetchAll, addReminder, markFired, removeReminder };
}
