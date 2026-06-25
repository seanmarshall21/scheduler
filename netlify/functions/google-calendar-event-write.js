import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/google-calendar-event-write
//
// Reschedule or remove one personal Google Calendar event from inside Commons —
// e.g. moving a personal event off the family board, or deleting it. Acts AS the
// signed-in user, so RLS scopes the connection to the caller's household.
// Requires the read/write calendar scope (calendar.events) on the connection.
//
// Body: { connId, calId, action: 'create'|'patch'|'delete', gid?, start?, end?, summary?, recurrence? }
//   - 'create' adds an event to the calendar (Commons → Google mirror).
//   - 'patch' moves/edits; 'delete' removes. gid required for patch/delete.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function freshAccessToken(supabase, conn) {
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (conn.access_token && expiry > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

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
  const { connId, calId, gid, seriesId, scope, action, start, end, summary, recurrence } = payload;
  if (!connId || !calId) return json(400, { error: 'connId and calId are required.' });
  if (!['create', 'patch', 'delete'].includes(action)) return json(400, { error: 'action must be create, patch or delete.' });
  if (action !== 'create' && !gid) return json(400, { error: 'gid is required for patch/delete.' });
  if (action === 'create' && (!summary || !start || !end)) return json(400, { error: 'create needs summary, start and end.' });
  // scope 'series' targets the whole recurring event (the master); default is
  // just this occurrence.
  const targetId = scope === 'series' && seriesId ? seriesId : gid;

  // RLS limits this to connections in the caller's household.
  const { data: conn, error: connErr } = await supabase
    .from('google_connections')
    .select('*')
    .eq('id', connId)
    .maybeSingle();
  if (connErr) return json(500, { error: connErr.message });
  if (!conn) return json(404, { error: 'Connection not found.' });

  try {
    const accessToken = await freshAccessToken(supabase, conn);
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const calBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;

    if (action === 'create') {
      const body = { summary: summary || 'Event', start: { dateTime: start }, end: { dateTime: end } };
      if (Array.isArray(recurrence) && recurrence.length) body.recurrence = recurrence;
      const r = await fetch(calBase, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 403) return json(403, { error: 'No write access — reconnect this calendar to grant edit permission.' });
        return json(502, { error: `Create failed (${r.status}): ${t.slice(0, 200)}` });
      }
      const out = await r.json();
      return json(200, { ok: true, action: 'create', gid: out.id });
    }

    const base = `${calBase}/${encodeURIComponent(targetId)}`;

    if (action === 'delete') {
      const r = await fetch(base, { method: 'DELETE', headers });
      // 410 = already gone; treat as success (idempotent).
      if (!r.ok && r.status !== 410 && r.status !== 404) {
        const t = await r.text();
        if (r.status === 403)
          return json(403, { error: 'No write access — reconnect this calendar to grant edit permission.' });
        return json(502, { error: `Remove failed (${r.status}): ${t.slice(0, 200)}` });
      }
      return json(200, { ok: true, action: 'delete' });
    }

    // patch — only the provided fields (time and/or title)
    const patchBody = {};
    if (start) patchBody.start = { dateTime: start };
    if (end) patchBody.end = { dateTime: end };
    if (summary != null) patchBody.summary = summary;
    if (!Object.keys(patchBody).length) return json(400, { error: 'patch needs start/end and/or summary.' });

    const r = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify(patchBody) });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 403)
        return json(403, { error: 'No write access — reconnect this calendar to grant edit permission.' });
      return json(502, { error: `Update failed (${r.status}): ${t.slice(0, 200)}` });
    }
    const out = await r.json();
    return json(200, { ok: true, action: 'patch', start: out.start, end: out.end, summary: out.summary });
  } catch (err) {
    return json(502, { error: `Calendar write failed: ${err.message}` });
  }
};
