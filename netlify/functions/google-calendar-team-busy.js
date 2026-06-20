import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/google-calendar-team-busy
//
// Household free/busy: returns every member's Google busy time for a window,
// keyed by member_id, so the family board can show "this person is busy then"
// WITHOUT necessarily exposing private details. When a connection is marked
// `busy_only`, event titles are stripped to null → the UI shows "Busy".
// Otherwise the title comes through.
//
// Reading every member's tokens requires the service role (the refresh tokens
// are sensitive), so this function uses SUPABASE_SERVICE_ROLE_KEY. It is still
// auth-gated: only a signed-in member of the household can call it, and results
// are scoped to that caller's household(s).
//
// Body: { timeMin (ISO), timeMax (ISO) }. Env: VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const isDeclined = (e) => (e.attendees || []).some((a) => a.self && a.responseStatus === 'declined');

// Per-calendar on/off lives in the `calendars` jsonb: [{ id, enabled }].
const disabledCalIds = (conn) =>
  new Set((Array.isArray(conn.calendars) ? conn.calendars : []).filter((c) => c.enabled === false).map((c) => c.id));

async function freshAccessToken(admin, conn) {
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (conn.access_token && expiry > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // can't refresh; try as-is

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description || t.error || 'Token refresh failed.');
  await admin
    .from('google_connections')
    .update({
      access_token: t.access_token,
      token_expiry: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id);
  return t.access_token;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return json(500, { error: 'Server missing Google OAuth config.' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });

  // Gate: must be a real signed-in user (we don't expose this to the public).
  // This client also acts AS the user, so RLS tells us which household(s) they
  // belong to without trusting a client-supplied id.
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await asUser.auth.getUser(userToken);
  if (authErr || !user) return json(401, { error: 'Invalid or expired token.' });

  if (!SERVICE_ROLE_KEY) {
    // Not configured yet — degrade gracefully so the board just shows no overlay.
    return json(200, { configured: false, byPerson: {} });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { timeMin, timeMax } = payload;
  if (!timeMin || !timeMax) return json(400, { error: 'timeMin and timeMax are required.' });

  // Which household(s) does the caller belong to? RLS scopes this read.
  const { data: houses, error: houseErr } = await asUser.from('households').select('id');
  if (houseErr) return json(500, { error: houseErr.message });
  const householdIds = (houses || []).map((h) => h.id);
  if (!householdIds.length) return json(200, { configured: true, byPerson: {} });

  // Service-role client: bypasses RLS so we can read every member's tokens. We
  // restrict it to the caller's household(s) by hand.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: conns, error: connErr } = await admin
    .from('google_connections')
    .select('*')
    .in('household_id', householdIds);
  if (connErr) return json(500, { error: connErr.message });
  if (!conns?.length) return json(200, { configured: true, byPerson: {} });

  const byPerson = {};
  for (const conn of conns) {
    const memberId = conn.member_id;
    if (!memberId) continue;
    try {
      const accessToken = await freshAccessToken(admin, conn);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: auth });
      if (!listRes.ok) continue;
      const listBody = await listRes.json();
      const disabled = disabledCalIds(conn);
      const calendars = (listBody.items || [])
        .filter((c) => c.selected !== false && !disabled.has(c.id))
        .slice(0, 20);

      const perCal = await Promise.all(
        calendars.map(async (cal) => {
          const url =
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events` +
            `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
            `&singleEvents=true&orderBy=startTime&maxResults=250`;
          try {
            const r = await fetch(url, { headers: auth });
            if (!r.ok) return [];
            const b = await r.json();
            return (b.items || [])
              .filter((e) => e.status !== 'cancelled' && !isDeclined(e) && (e.start?.dateTime || e.start?.date))
              .map((e) => ({
                uid: e.iCalUID || null,
                start: e.start.dateTime || e.start.date,
                end: e.end?.dateTime || e.end?.date,
                allDay: Boolean(e.start.date && !e.start.dateTime),
                // Privacy: busy_only connections expose busy time only, never titles.
                summary: conn.busy_only ? null : e.summary || 'Busy',
              }));
          } catch {
            return [];
          }
        })
      );

      (byPerson[memberId] ||= []).push(...perCal.flat());
    } catch {
      /* one bad account shouldn't sink the board */
    }
  }

  // A member with several accounts can have the same meeting on each — dedupe
  // per member so their busy hours aren't inflated by cross-account copies.
  for (const memberId of Object.keys(byPerson)) {
    const seen = new Set();
    byPerson[memberId] = byPerson[memberId].filter((ev) => {
      const key = ev.uid ? `${ev.uid}|${ev.start}` : `${ev.summary}|${ev.start}|${ev.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return json(200, { configured: true, byPerson });
};
