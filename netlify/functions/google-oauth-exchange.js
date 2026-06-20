import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/google-oauth-exchange
//
// Completes the Google Calendar OAuth handshake: trades the auth `code` for
// tokens (needs the client secret, server-only), reads the connected email, and
// stores the connection for the signed-in user (memory: craftd-schedule-blender,
// personal life as input). Tokens are written to calendar_connections under the
// user's own RLS. Auth-gated by Supabase JWT.
//
// Body: { code, redirectUri }. Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return json(500, { error: 'Server missing Google OAuth config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  // Client that acts AS the user, so RLS (user_id = auth.uid()) applies.
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
  const { code, redirectUri } = payload;
  if (!code || !redirectUri) return json(400, { error: 'code and redirectUri are required.' });

  try {
    // 1. Exchange the auth code for tokens.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) return json(502, { error: tokens.error_description || tokens.error || 'Token exchange failed.' });

    // 2. Who did they connect?
    let email = null;
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) email = (await infoRes.json()).email ?? null;
    } catch {
      /* email is best-effort */
    }

    // Did they grant write access? (full calendar or calendar.events scope) —
    // editing personal events is optional and only enabled when granted.
    const grantedScopes = (tokens.scope || '').split(/\s+/);
    const canWrite =
      grantedScopes.includes('https://www.googleapis.com/auth/calendar') ||
      grantedScopes.includes('https://www.googleapis.com/auth/calendar.events');

    // 3. Store the connection (refresh_token only present on first consent).
    const row = {
      user_id: user.id,
      provider: 'google',
      google_email: email,
      access_token: tokens.access_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      can_write: canWrite,
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) row.refresh_token = tokens.refresh_token;

    // Each distinct Google account gets its own row (multi-account: Sean has 5).
    const { error: upErr } = await supabase
      .from('calendar_connections')
      .upsert(row, { onConflict: 'user_id,provider,google_email' });
    if (upErr) return json(500, { error: `Save failed: ${upErr.message}` });

    return json(200, { ok: true, email });
  } catch (err) {
    return json(502, { error: `Connect failed: ${err.message}` });
  }
};
