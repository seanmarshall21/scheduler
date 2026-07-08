import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

// The household's "fridge" — now MULTIPLE boards (saved views). Module-cached so
// the home tile + sign-in popup + editor share one fetch. The active board is
// remembered per device. Read-only consumers use `strokes`/`items`/`board`
// (the active board); the editor uses the board list + management + `save`.
const cache = { householdId: null, boards: undefined, at: 0 };
const STALE_MS = 30_000;
const activeKey = (hid) => `commons.fridge.active.${hid || 'default'}`;

export function useWhiteboard(householdId) {
  const { activeMemberId } = useApp();
  const valid = cache.householdId === householdId && cache.boards !== undefined;
  const [boards, setBoards] = useState(valid ? cache.boards : []);
  const [activeId, setActiveIdState] = useState(() => {
    try { return localStorage.getItem(activeKey(householdId)); } catch { return null; }
  });
  const [loading, setLoading] = useState(!valid);
  const inFlight = useRef(false);

  const setAll = (next) => { cache.boards = next; cache.householdId = householdId; setBoards(next); };

  const load = useCallback(async ({ background = false } = {}) => {
    if (!householdId || inFlight.current) return;
    inFlight.current = true;
    if (!background && cache.householdId !== householdId) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fridge_boards')
        .select('*')
        .eq('household_id', householdId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      let rows = data ?? [];
      if (!rows.length) {
        const { data: made } = await supabase.from('fridge_boards').insert({ household_id: householdId, name: 'Fridge' }).select().single();
        if (made) rows = [made];
      }
      cache.boards = rows; cache.householdId = householdId; cache.at = Date.now();
      setBoards(rows);
    } catch (e) {
      console.error('[fridge] fetch failed:', e.message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || cache.boards === undefined) load();
    else if (Date.now() - cache.at > STALE_MS) load({ background: true });
  }, [householdId, load]);

  // Member-scoped visibility (soft): household boards for all; private/shared only
  // for their owner / listed members (based on the active "who am I" member).
  const canSee = (b) => b.visibility === 'household' || !b.owner_id
    || (activeMemberId && (b.owner_id === activeMemberId || (b.shared_with || []).includes(activeMemberId)));
  const visibleBoards = boards.filter(canSee);
  const active = visibleBoards.find((b) => b.id === activeId) || visibleBoards[0] || null;

  const setActive = useCallback((id) => {
    setActiveIdState(id);
    try { localStorage.setItem(activeKey(householdId), id); } catch { /* ignore */ }
  }, [householdId]);

  const createBoard = useCallback(async (name) => {
    const sort = (cache.boards ?? []).reduce((m, b) => Math.max(m, b.sort_order || 0), 0) + 1;
    const { data, error } = await supabase.from('fridge_boards')
      .insert({ household_id: householdId, name: name || 'Board', sort_order: sort, owner_id: activeMemberId || null })
      .select().single();
    if (error) throw error;
    setAll([...(cache.boards ?? []), data]);
    setActive(data.id);
    return data;
  }, [householdId, activeMemberId, setActive]);

  const setVisibility = useCallback(async (id, { visibility, shared_with }) => {
    const patch = { visibility, shared_with: shared_with || [] };
    setAll((cache.boards ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)));
    await supabase.from('fridge_boards').update(patch).eq('id', id);
  }, []);

  const renameBoard = useCallback(async (id, name) => {
    setAll((cache.boards ?? []).map((b) => (b.id === id ? { ...b, name } : b)));
    await supabase.from('fridge_boards').update({ name }).eq('id', id);
  }, []);

  const deleteBoard = useCallback(async (id) => {
    const rest = (cache.boards ?? []).filter((b) => b.id !== id);
    setAll(rest);
    if (activeId === id && rest[0]) setActive(rest[0].id);
    await supabase.from('fridge_boards').delete().eq('id', id);
  }, [activeId, setActive]);

  // Save strokes+items to a specific board (the editor passes the board it edits).
  const save = useCallback(async (boardId, strokes, items, memberId) => {
    if (!boardId) return null;
    const patch = { strokes, items: items || [], updated_by: memberId || null, updated_at: new Date().toISOString() };
    setAll((cache.boards ?? []).map((b) => (b.id === boardId ? { ...b, ...patch } : b)));
    const { error } = await supabase.from('fridge_boards').update(patch).eq('id', boardId);
    if (error) throw error;
    return { id: boardId, ...patch };
  }, []);

  return {
    boards: visibleBoards,
    loading,
    active,
    activeId: active?.id || null,
    setActive,
    createBoard,
    renameBoard,
    deleteBoard,
    setVisibility,
    save,
    reload: () => load({ background: true }),
    // active-board content for read-only consumers (home tile, sign-in popup)
    strokes: active?.strokes || [],
    items: active?.items || [],
    board: active,
  };
}
