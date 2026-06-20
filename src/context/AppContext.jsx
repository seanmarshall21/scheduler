import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// Household + members + the "active member" (who am I) for this device.
//
// - `household` / `members` are loaded once the user is authenticated (RLS
//   scopes them to the household the user belongs to).
// - `activeMemberId` is the kiosk's current person. It's per-DEVICE state
//   (localStorage), NOT tied to the auth user, so the wall display can switch
//   between family members with a tap while staying on one shared login. On a
//   phone it defaults to the member linked to the logged-in user.
const AppContext = createContext(null);

const ACTIVE_KEY = 'commons.activeMemberId';

export function AppProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMemberId, setActiveMemberIdState] = useState(
    () => localStorage.getItem(ACTIVE_KEY) || null
  );

  const load = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // RLS returns only households this user belongs to. Take the first.
    const { data: houses } = await supabase
      .from('households')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);
    const house = houses?.[0] ?? null;
    setHousehold(house);
    if (house) {
      const { data: mem } = await supabase
        .from('members')
        .select('*')
        .eq('household_id', house.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      setMembers(mem ?? []);
      // On a phone, default "who am I" to the member linked to this auth user.
      const mine = (mem ?? []).find((m) => m.user_id === user.id);
      if (mine && !localStorage.getItem(ACTIVE_KEY)) {
        setActiveMemberIdState(mine.id);
        localStorage.setItem(ACTIVE_KEY, mine.id);
      }
    } else {
      setMembers([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const setActiveMember = useCallback((id) => {
    setActiveMemberIdState(id);
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  }, []);

  const createHousehold = useCallback(
    async (name) => {
      const { data, error } = await supabase
        .from('households')
        .insert({ name: name || 'Our Home', created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      // Seed the creator as the first member.
      await supabase.from('members').insert({
        household_id: data.id,
        user_id: user.id,
        name: user.email?.split('@')[0] || 'You',
        color: '#e0603c',
        role: 'adult',
        sort_order: 0,
      });
      await load();
      return data;
    },
    [user, load]
  );

  const activeMember = members.find((m) => m.id === activeMemberId) ?? null;

  return (
    <AppContext.Provider
      value={{
        household,
        members,
        loading: authLoading || loading,
        needsOnboarding: Boolean(user) && !loading && !household,
        activeMemberId,
        activeMember,
        setActiveMember,
        createHousehold,
        refresh: load,
        setMembers,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
