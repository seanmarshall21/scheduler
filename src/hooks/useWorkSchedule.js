import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

// Pulls the signed-in user's CRFTD work schedule (via the crftd-schedule
// function) and shapes it as FamilyCalendar events tagged to their member.
// "Busy only" (per-device pref) hides the task title — just shows blocked time.
const DAY_MS = 86_400_000;
const BUSY_KEY = 'commons.work.busyOnly';

// day 'YYYY-MM-DD' + minutes-from-midnight → ISO (local clock preserved).
function toISO(day, minOfDay) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minOfDay / 60), minOfDay % 60, 0, 0).toISOString();
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useWorkSchedule() {
  const { members, activeMemberId } = useApp();
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyOnly, setBusyOnlyState] = useState(() => localStorage.getItem(BUSY_KEY) === '1');

  // The member this user's work belongs to (their own member, else active).
  const workMemberId = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.id || activeMemberId || null,
    [members, user, activeMemberId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await accessToken();
      if (!token) return;
      const now = Date.now();
      const res = await fetch('/.netlify/functions/crftd-schedule', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeMin: new Date(now - 7 * DAY_MS).toISOString(),
          timeMax: new Date(now + 35 * DAY_MS).toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      setConfigured(Boolean(json.configured));
      setBlocks(json.blocks || []);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setBusyOnly = useCallback((v) => {
    setBusyOnlyState(v);
    localStorage.setItem(BUSY_KEY, v ? '1' : '0');
  }, []);

  // Timed blocks → events on the board. (Untimed/unplaced blocks are skipped for
  // now — they have no clock slot.)
  const events = useMemo(
    () =>
      blocks
        .filter((b) => b.startMin != null && workMemberId)
        .map((b) => ({
          id: `work-${b.id}`,
          member_id: workMemberId,
          summary: busyOnly ? 'Work' : b.title,
          start: toISO(b.day, b.startMin),
          end: toISO(b.day, b.startMin + Math.max(30, b.minutes)),
          allDay: false,
          color: b.color,
          source: 'crftd',
        })),
    [blocks, busyOnly, workMemberId]
  );

  return { events, loading, configured, busyOnly, setBusyOnly, reload: load };
}
