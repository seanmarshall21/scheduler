import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/google-calendar-events
//
// Returns the signed-in user's Google Calendar events for a window, refreshing
// the access token when needed. Used to show personal commitments on the
// schedule and keep auto-plan from booking over them. Auth-gated by Supabase JWT.
//
// Body: { timeMin (ISO), timeMax (ISO) }. Env: VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Meetings the user has declined shouldn't show as busy time.
const isDeclined = (e) => (e.attendees || []).some((a) => a.self && a.responseStatus === 'declined');

async function freshAccessToken(supabase, conn) {
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
  await supabase
    .from('calendar_connections')
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

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(userToken);
  if (authErr || !user) return json(401, { error: 'Invalid or expired token.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const { timeMin, timeMax } = payload;
  if (!timeMin || !timeMax) return json(400, { error: 'timeMin and timeMax are required.' });

  const { data: conns, error: connErr } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('provider', 'google');
  if (connErr) return json(500, { error: connErr.message });
  if (!conns || !conns.length) return json(200, { connected: false, events: [], accounts: [] });

  // Pull from every connected account, each with its own token + calendars.
  const accounts = [];
  const allEvents = [];
  for (const conn of conns) {
    try {
      const accessToken = await freshAccessToken(supabase, conn);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: auth });
      if (!listRes.ok) {
        accounts.push({ email: conn.google_email, treatment: conn.treatment, isPrivate: conn.is_private, calendars: [], error: true });
        continue;
      }
      const listBody = await listRes.json();
      const allCals = (listBody.items || []).filter((c) => c.selected !== false).slice(0, 20);
      // Per-calendar curation: skip the ones the user switched off in Settings.
      const disabled = new Set(conn.disabled_calendars || []);
      const calendars = allCals.filter((c) => !disabled.has(c.id));

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
                id: `${conn.id}:${e.id}`,
                // Handles for write-back (reschedule / remove) — see
                // google-calendar-event-write.
                connId: conn.id,
                calId: cal.id,
                gid: e.id,
                // Present when this is one occurrence of a recurring event — lets
                // the editor offer "this event" vs "all events in the series".
                seriesId: e.recurringEventId || null,
                // Stable across copies of the same meeting on different
                // calendars/accounts — used to dedupe cross-account duplicates.
                uid: e.iCalUID || null,
                // Editable only when the account granted write scope AND this
                // is the user's own event on a writable calendar.
                editable: conn.can_write === true && e.organizer?.self !== false && cal.accessRole !== 'reader',
                summary: e.summary || 'Busy',
                start: e.start.dateTime || e.start.date,
                end: e.end?.dateTime || e.end?.date,
                allDay: Boolean(e.start.date && !e.start.dateTime),
                calendar: cal.summaryOverride || cal.summary,
                color: cal.backgroundColor || null,
                account: conn.google_email,
                treatment: conn.treatment, // per-account: around | ask | show
              }));
          } catch {
            return [];
          }
        })
      );

      allEvents.push(...perCal.flat());
      accounts.push({
        connId: conn.id,
        email: conn.google_email,
        treatment: conn.treatment,
        isPrivate: conn.is_private,
        canWrite: conn.can_write === true,
        // Every calendar on the account + whether it currently feeds the
        // schedule, so Settings can offer per-calendar on/off toggles.
        calendars: allCals.map((c) => ({
          id: c.id,
          name: c.summaryOverride || c.summary,
          color: c.backgroundColor || null,
          enabled: !disabled.has(c.id),
        })),
      });
    } catch (err) {
      accounts.push({ connId: conn.id, email: conn.google_email, treatment: conn.treatment, isPrivate: conn.is_private, calendars: [], error: true });
    }
  }

  // Dedupe the same meeting appearing on multiple accounts/calendars (cross-
  // invites between Sean's own emails, shared calendars, etc.) — one real event
  // shown 5× looks like a 5-way overlap. Key by iCalUID + time; prefer an
  // editable copy and the account whose treatment is most active.
  const TREAT_RANK = { around: 0, ask: 1, show: 2 };
  const byKey = new Map();
  for (const ev of allEvents) {
    const key = ev.uid ? `${ev.uid}|${ev.start}` : `${ev.summary}|${ev.start}|${ev.end}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, ev);
      continue;
    }
    // Keep the more useful copy: editable wins, then the more active treatment.
    const better =
      (ev.editable ? 1 : 0) - (prev.editable ? 1 : 0) ||
      (TREAT_RANK[prev.treatment] ?? 9) - (TREAT_RANK[ev.treatment] ?? 9);
    if (better > 0) byKey.set(key, ev);
  }
  const events = [...byKey.values()];

  return json(200, { connected: true, accounts, events });
};
