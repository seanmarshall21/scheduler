import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// App-native shared tasks (NO ClickUp). Assignable between members, with due
// dates and a done flag. Module-cached + optimistic, keyed by household.
const cache = { householdId: null, tasks: null, fetchedAt: 0 };
const STALE_MS = 60_000;
let tempSeq = 0;

export function useTasks(householdId) {
  const valid = cache.householdId === householdId;
  const [tasks, setTasks] = useState(valid ? cache.tasks ?? [] : []);
  const [loading, setLoading] = useState(!valid || !cache.tasks);
  const inFlight = useRef(false);

  const setAll = (next) => {
    cache.tasks = next;
    cache.householdId = householdId;
    setTasks(next);
  };

  const fetchTasks = useCallback(
    async ({ background = false } = {}) => {
      if (!householdId || inFlight.current) return;
      inFlight.current = true;
      if (!background && cache.householdId !== householdId) setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('household_id', householdId)
          .order('done', { ascending: true })
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false });
        if (error) throw error;
        cache.tasks = data ?? [];
        cache.householdId = householdId;
        cache.fetchedAt = Date.now();
        setTasks(cache.tasks);
      } catch (e) {
        console.error('[tasks] fetch failed:', e.message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [householdId]
  );

  useEffect(() => {
    if (!householdId) return;
    if (cache.householdId !== householdId || !cache.tasks) fetchTasks();
    else if (Date.now() - cache.fetchedAt > STALE_MS) fetchTasks({ background: true });
  }, [householdId, fetchTasks]);

  const addTask = useCallback(
    async ({ title, assigned_to = null, created_by = null, due_date = null, notes = null }) => {
      const text = (title || '').trim();
      if (!text) return;
      const tempId = `temp-${++tempSeq}`;
      const optimistic = {
        id: tempId,
        household_id: householdId,
        title: text,
        assigned_to,
        created_by,
        due_date,
        notes,
        done: false,
        done_at: null,
        created_at: new Date().toISOString(),
      };
      setAll([optimistic, ...(cache.tasks ?? [])]);
      const { data, error } = await supabase
        .from('tasks')
        .insert({ household_id: householdId, title: text, assigned_to, created_by, due_date, notes })
        .select()
        .single();
      if (error) {
        setAll((cache.tasks ?? []).filter((t) => t.id !== tempId));
        throw error;
      }
      setAll((cache.tasks ?? []).map((t) => (t.id === tempId ? data : t)));
      return data;
    },
    [householdId]
  );

  const updateTask = useCallback(async (id, patch) => {
    const prev = cache.tasks ?? [];
    setAll(prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase
      .from('tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  const toggleDone = useCallback(
    (task) => updateTask(task.id, { done: !task.done, done_at: task.done ? null : new Date().toISOString() }),
    [updateTask]
  );

  const removeTask = useCallback(async (id) => {
    const prev = cache.tasks ?? [];
    setAll(prev.filter((t) => t.id !== id));
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      setAll(prev);
      throw error;
    }
  }, []);

  return {
    tasks,
    loading,
    refetch: () => fetchTasks({ background: Boolean(cache.tasks) }),
    addTask,
    updateTask,
    toggleDone,
    removeTask,
  };
}
