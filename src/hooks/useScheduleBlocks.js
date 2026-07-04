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
      // `member_ids` (multi-person) → one linked row per member, shared group_id.
      const { member_ids, ...rest } = row;
      const ids = Array.isArray(member_ids) && member_ids.length ? member_ids : [rest.member_id ?? null];

      if (ids.length <= 1) {
        const single = { ...rest, member_id: ids[0] ?? rest.member_id ?? null };
        const tempId = `temp-${++tempSeq}`;
        const optimistic = { id: tempId, household_id: householdId, minutes: 60, start_min: null, ...single };
        setAll([...(cache.blocks ?? []), optimistic]);
        const { data, error } = await supabase
          .from('schedule_blocks')
          .insert({ household_id: householdId, ...single })
          .select()
          .single();
        if (error) { setAll((cache.blocks ?? []).filter((b) => b.id !== tempId)); throw error; }
        setAll((cache.blocks ?? []).map((b) => (b.id === tempId ? data : b)));
        return data;
      }

      const groupId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `g-${Date.now()}-${++tempSeq}`;
      const rows = ids.map((mid) => ({ household_id: householdId, ...rest, member_id: mid, group_id: groupId }));
      const optimistic = rows.map((r) => ({ id: `temp-${++tempSeq}`, minutes: 60, start_min: null, ...r }));
      const optIds = new Set(optimistic.map((o) => o.id));
      setAll([...(cache.blocks ?? []), ...optimistic]);
      const { data, error } = await supabase.from('schedule_blocks').insert(rows).select();
      if (error) { setAll((cache.blocks ?? []).filter((b) => !optIds.has(b.id))); throw error; }
      setAll([...(cache.blocks ?? []).filter((b) => !optIds.has(b.id)), ...(data ?? [])]);
      return data;
    },
    [householdId]
  );

  const updateBlock = useCallback(async (id, patch) => {
    const prev = cache.blocks ?? [];
    const gid = prev.find((b) => b.id === id)?.group_id || null;
    // For a joint block, time/title/category edits cascade to the whole group;
    // a member reassignment (member_id) stays on just the dragged instance.
    const { member_id, ...shared } = patch;
    const cascade = gid && Object.keys(shared).length > 0;

    setAll(prev.map((b) => {
      if (b.id === id) return { ...b, ...patch };
      if (cascade && b.group_id === gid) return { ...b, ...shared };
      return b;
    }));

    const stamp = new Date().toISOString();
    const { error } = await supabase.from('schedule_blocks').update({ ...patch, updated_at: stamp }).eq('id', id);
    let error2 = null;
    if (!error && cascade) {
      ({ error: error2 } = await supabase.from('schedule_blocks').update({ ...shared, updated_at: stamp }).eq('group_id', gid).neq('id', id));
    }
    if (error || error2) {
      setAll(prev);
      throw error || error2;
    }
  }, []);

  const removeBlock = useCallback(async (id) => {
    const prev = cache.blocks ?? [];
    const gid = prev.find((b) => b.id === id)?.group_id || null; // joint block → remove the whole group
    const removeIds = new Set((gid ? prev.filter((b) => b.group_id === gid) : prev.filter((b) => b.id === id)).map((b) => b.id));
    setAll(prev.filter((b) => !removeIds.has(b.id)));
    const del = supabase.from('schedule_blocks').delete();
    const { error } = gid ? await del.eq('group_id', gid) : await del.eq('id', id);
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
