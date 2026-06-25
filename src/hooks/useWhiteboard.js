import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// The household's shared "fridge" whiteboard. One row per household (upsert on
// household_id). Module cache so the home tile + sign-in popup + editor don't
// each refetch.
const cache = { householdId: null, row: undefined, at: 0 };
const STALE_MS = 30_000;

export function useWhiteboard(householdId) {
  const valid = cache.householdId === householdId && cache.row !== undefined;
  const [board, setBoard] = useState(valid ? cache.row : null);
  const [loading, setLoading] = useState(!valid);
  const inFlight = useRef(false);

  const load = useCallback(
    async ({ background = false } = {}) => {
      if (!householdId || inFlight.current) return;
      inFlight.current = true;
      if (!background && cache.householdId !== householdId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('whiteboards')
          .select('*')
          .eq('household_id', householdId)
          .maybeSingle();
        if (error) throw error;
        cache.householdId = householdId;
        cache.row = data ?? null;
        cache.at = Date.now();
        setBoard(cache.row);
      } catch (e) {
        console.error('[whiteboard] fetch failed:', e.message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [householdId]
  );

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || cache.row === undefined) load();
    else if (Date.now() - cache.at > STALE_MS) load({ background: true });
  }, [householdId, load]);

  const save = useCallback(
    async (strokes, items, memberId) => {
      const row = {
        household_id: householdId,
        strokes,
        items: items || [],
        updated_by: memberId || null,
        updated_at: new Date().toISOString(),
      };
      cache.row = row;
      cache.householdId = householdId;
      setBoard(row);
      const { error } = await supabase.from('whiteboards').upsert(row, { onConflict: 'household_id' });
      if (error) throw error;
      return row;
    },
    [householdId]
  );

  return { board, strokes: board?.strokes || [], items: board?.items || [], loading, save, reload: () => load({ background: true }) };
}
