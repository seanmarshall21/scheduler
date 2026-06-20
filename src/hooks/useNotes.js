import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Shared household notes + checklists (kind 'note' | 'list'). member_id null =
// shared with the whole house; otherwise it's that member's note. Adapted from
// CRFTD's notes shape — module-cached + optimistic, keyed by household.
const cache = { householdId: null, notes: null };

let tempSeq = 0;

export function useNotes(householdId) {
  const valid = cache.householdId === householdId;
  const [notes, setNotes] = useState(valid ? cache.notes ?? [] : []);
  const [loading, setLoading] = useState(!valid || cache.notes === null);

  const setAll = (next) => {
    cache.notes = next;
    cache.householdId = householdId;
    setNotes(next);
  };

  const load = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase
      .from('notes')
      .select('*')
      .eq('household_id', householdId)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    cache.notes = data ?? [];
    cache.householdId = householdId;
    setNotes(cache.notes);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || cache.notes === null) load();
    else setLoading(false);
  }, [householdId, load]);

  const add = useCallback(
    async ({ kind = 'note', title = null, body = null, items = [], member_id = null, created_by = null }) => {
      const tempId = `temp-${++tempSeq}`;
      const optimistic = {
        id: tempId,
        household_id: householdId,
        kind,
        title,
        body,
        items,
        member_id,
        created_by,
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setAll([optimistic, ...(cache.notes ?? [])]);
      const { data } = await supabase
        .from('notes')
        .insert({ household_id: householdId, kind, title, body, items, member_id, created_by })
        .select()
        .single();
      if (data) setAll((cache.notes ?? []).map((n) => (n.id === tempId ? data : n)));
      return data;
    },
    [householdId]
  );

  const update = useCallback(async (id, patch) => {
    const prev = cache.notes ?? [];
    setAll(prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    const { error } = await supabase
      .from('notes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) setAll(prev);
  }, []);

  // Convenience for checklist notes: toggle one item by id.
  const toggleItem = useCallback(
    (note, itemId) => {
      const items = (note.items || []).map((it) => (it.id === itemId ? { ...it, done: !it.done } : it));
      return update(note.id, { items });
    },
    [update]
  );

  const addItem = useCallback(
    (note, text) => {
      const items = [...(note.items || []), { id: `i-${Date.now()}`, text, done: false }];
      return update(note.id, { items });
    },
    [update]
  );

  const remove = useCallback(async (id) => {
    const prev = cache.notes ?? [];
    setAll(prev.filter((n) => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  }, []);

  return { notes, loading, add, update, toggleItem, addItem, remove, refetch: load };
}
