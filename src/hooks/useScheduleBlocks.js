import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Family schedule blocks — a titled time block on a day for one member (or the
// whole household). Same speed rules as CRFTD: a module cache paints instantly,
// writes are optimistic and only roll back on failure. Cache is keyed by
// household so switching households (rare) re-fetches cleanly.
const cache = { householdId: null, blocks: null, fetchedAt: 0 };
const STALE_MS = 60_000;
let tempSeq = 0;

export function useScheduleBlocks(householdId) {
  const valid = cache.householdId === householdId;
  const [blocks, setBlocks] = useState(valid ? cache.blocks ?? [] : []);
  const [loading, setLoading] = useState(!valid || !cache.blocks);
  const inFlight = useRef(false);

  const setAll = (next) => {
    cache.blocks = next;
    cache.householdId = householdId;
    setBlocks(next);
  };

  const fetchBlocks = useCallback(
    async ({ background = false } = {}) => {
      if (!householdId || inFlight.current) return;
      inFlight.current = true;
      if (!background && cache.householdId !== householdId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('schedule_blocks')
          .select('*')
          .eq('household_id', householdId)
          .order('day', { ascending: true });
        if (error) throw error;
        cache.blocks = data ?? [];
        cache.householdId = householdId;
        cache.fetchedAt = Date.now();
        setBlocks(cache.blocks);
      } catch (e) {
        console.error('[blocks] fetch failed:', e.message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [householdId]
  );

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || !cache.blocks) fetchBlocks();
    else if (Date.now() - cache.fetchedAt > STALE_MS) fetchBlocks({ background: true });
  }, [householdId, fetchBlocks]);

  const addBlock = useCallback(
    async (row) => {
      const tempId = `temp-${++tempSeq}`;
      const optimistic = { id: tempId, household_id: householdId, minutes: 60, start_min: null, ...row };
      setAll([...(cache.blocks ?? []), optimistic]);
      const { data, error } = await supabase
        .from('schedule_blocks')
        .insert({ household_id: householdId, ...row })
        .select()
        .single();
      if (error) {
        setAll((cache.blocks ?? []).filter((b) => b.id !== tempId));
        throw error;
      }
      setAll((cache.blocks ?? []).map((b) => (b.id === tempId ? data : b)));
      return data;
    },
    [householdId]
  );

  const updateBlock = useCallback(async (id, patch) => {
    const prev = cache.blocks ?? [];
    setAll(prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const { error } = await supabase
      .from('schedule_blocks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  const removeBlock = useCallback(async (id) => {
    const prev = cache.blocks ?? [];
    setAll(prev.filter((b) => b.id !== id));
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  return {
    blocks,
    loading,
    refetch: () => fetchBlocks({ background: Boolean(cache.blocks) }),
    addBlock,
    updateBlock,
    removeBlock,
  };
}
