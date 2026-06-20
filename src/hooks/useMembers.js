import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';

// Member CRUD for Settings. Reads come from AppContext (the household's member
// list is app-wide state); this hook just wraps the writes and refreshes.
export function useMembers() {
  const { household, members, refresh } = useApp();

  const addMember = useCallback(
    async ({ name, color, role = 'member' }) => {
      const sort_order = members.length;
      const { data, error } = await supabase
        .from('members')
        .insert({ household_id: household.id, name, color, role, sort_order })
        .select()
        .single();
      if (error) throw error;
      await refresh();
      return data;
    },
    [household, members.length, refresh]
  );

  const updateMember = useCallback(
    async (id, patch) => {
      const { error } = await supabase.from('members').update(patch).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  // Soft delete — keep history intact, just drop them off the board.
  const deactivateMember = useCallback(
    async (id) => {
      const { error } = await supabase.from('members').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  return { members, addMember, updateMember, deactivateMember };
}
