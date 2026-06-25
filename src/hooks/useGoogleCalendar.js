import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Client glue for the multi-account Google Calendar integration. The heavy
// lifting (OAuth token exchange, refresh, calendar fetch) lives in the
// netlify/functions/google-* functions; this hook:
//   • kicks off the OAuth connect flow (redirect to Google → back to /settings)
//   • exchanges the returned ?code for tokens (attaching the connection to a
//     household member)
//   • loads everyone's events for a window and normalizes them for FamilyCalendar
//   • toggles per-account "busy only" + per-calendar on/off, and disconnects
//
// Connection metadata (busy_only, calendars, delete) is written directly via the
// Supabase client under household RLS — only event fetching needs the functions.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/calendar email';
const PENDING_MEMBER_KEY = 'commons.gcal.pendingMemberId';
const DAY_MS = 86_400_000;

// Module cache: paint last result instantly across page navigations, revalidate
// in the background, and only hit the Google-backed function when stale (or on a
// mutation). Mirrors useScheduleBlocks.
const cache = { connected: false, accounts: [], events: [], at: 0, has: false };
const STALE_MS = 60_000;

const redirectUri = () => `${window.location.origin}/settings`;

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function callFn(name, body) {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${name} failed (${res.status}).`);
  return json;
}

export function useGoogleCalendar() {
  const [connected, setConnected] = useState(cache.connected);
  const [accounts, setAccounts] = useState(cache.accounts);
  const [events, setEvents] = useState(cache.events);
  const [loading, setLoading] = useState(!cache.has);
  const [error, setError] = useState(null);

  const configured = Boolean(CLIENT_ID);

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    if (!cache.has) setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const timeMin = new Date(now - 7 * DAY_MS).toISOString();
      const timeMax = new Date(now + 35 * DAY_MS).toISOString();
      const { connected: conn, accounts: accts, events: evs } = await callFn(
        'google-calendar-events',
        { timeMin, timeMax }
      );
      // FamilyCalendar reads `member_id`; the function returns `memberId`.
      cache.connected = Boolean(conn);
      cache.accounts = accts || [];
      cache.events = (evs || []).map((e) => ({ ...e, member_id: e.memberId }));
      cache.at = Date.now();
      cache.has = true;
      setConnected(cache.connected);
      setAccounts(cache.accounts);
      setEvents(cache.events);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (!cache.has || Date.now() - cache.at > STALE_MS) load();
  }, [load]);

  // Redirect to Google's consent screen. `memberId` is the family member this
  // account's events belong to; stashed so we can attach it after the redirect.
  const connect = useCallback(
    (memberId) => {
      if (!configured) {
        setError('Google is not configured (missing VITE_GOOGLE_CLIENT_ID).');
        return;
      }
      if (memberId) sessionStorage.setItem(PENDING_MEMBER_KEY, memberId);
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'select_account consent',
        state: 'gcal',
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    [configured]
  );

  // Called on return to /settings with ?code=...&state=gcal.
  const exchangeCode = useCallback(
    async (code) => {
      setError(null);
      const memberId = sessionStorage.getItem(PENDING_MEMBER_KEY) || undefined;
      try {
        await callFn('google-oauth-exchange', { code, redirectUri: redirectUri(), memberId });
        sessionStorage.removeItem(PENDING_MEMBER_KEY);
        await load();
      } catch (e) {
        setError(e.message);
      }
    },
    [load]
  );

  const setBusyOnly = useCallback(
    async (connId, busyOnly) => {
      await supabase.from('google_connections').update({ busy_only: busyOnly }).eq('id', connId);
      await load();
    },
    [load]
  );

  // Persist a per-calendar on/off into the `calendars` jsonb ([{ id, enabled }]).
  const setCalendarEnabled = useCallback(
    async (account, calId, enabled) => {
      const next = (account.calendars || []).map((c) =>
        c.id === calId ? { id: c.id, enabled } : { id: c.id, enabled: c.enabled !== false }
      );
      if (!next.some((c) => c.id === calId)) next.push({ id: calId, enabled });
      await supabase.from('google_connections').update({ calendars: next }).eq('id', account.connId);
      await load();
    },
    [load]
  );

  const disconnect = useCallback(
    async (connId) => {
      await supabase.from('google_connections').delete().eq('id', connId);
      await load();
    },
    [load]
  );

  // Mirror a Commons event into a connected Google calendar. Returns the new
  // Google event id.
  const createGoogleEvent = useCallback(async ({ connId, calId, summary, start, end, recurrence }) => {
    const { gid } = await callFn('google-calendar-event-write', {
      action: 'create',
      connId,
      calId,
      summary,
      start,
      end,
      recurrence,
    });
    return gid;
  }, []);

  return {
    configured,
    loading,
    connected,
    accounts,
    events,
    error,
    connect,
    exchangeCode,
    setBusyOnly,
    setCalendarEnabled,
    disconnect,
    createGoogleEvent,
    reload: load,
  };
}
