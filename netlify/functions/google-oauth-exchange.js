import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/google-oauth-exchange
//
// Completes the Google Calendar OAuth handshake: trades the auth `code` for
// tokens (needs the client secret, server-only), reads the connected email, and
// stores the connection for a household MEMBER. Tokens are written to
// google_connections under the caller's RLS (any member of the household can
// edit). Auth-gated by Supabase JWT.
//
// Body: { code, redirectUri, memberId? }
//   - memberId: the member this Google account belongs to. Defaults to the
//     member linked to the signed-in auth user (phone sign-in). The kiosk, which
//     runs as one shared login, must pass the active memberId explicitly.
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

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return json(500, { error: 'Server missing Google OAuth config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  // Client that acts AS the user, so RLS (household scoping) applies.
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
  const { code, redirectUri, memberId } = payload;
  if (!code || !redirectUri) return json(400, { error: 'code and redirectUri are required.' });

  // Resolve which member this connection belongs to (and its household). RLS
  // only returns members in the caller's household, so this also validates that
  // the caller is allowed to attach a connection to that member.
  let memberQuery = supabase.from('members').select('id, household_id');
  memberQuery = memberId ? memberQuery.eq('id', memberId) : memberQuery.eq('user_id', user.id);
  const { data: member, error: memberErr } = await memberQuery.maybeSingle();
  if (memberErr) return json(500, { error: memberErr.message });
  if (!member) {
    return json(400, {
      error: memberId
        ? 'Member not found in your household.'
        : 'No member is linked to your account — pass a memberId to connect.',
    });
  }

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

    // 2. Who did they connect? google_email is NOT NULL + part of the unique
    //    key, so we require it.
    let email = null;
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) email = (await infoRes.json()).email ?? null;
    } catch {
      /* email is best-effort */
    }
    if (!email) return json(502, { error: 'Could not read the Google account email — try connecting again.' });

    // 3. Store the connection (refresh_token only present on first consent).
    //    Each distinct Google account gets its own row per member.
    const row = {
      household_id: member.household_id,
      member_id: member.id,
      google_email: email,
      access_token: tokens.access_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) row.refresh_token = tokens.refresh_token;

    const { error: upErr } = await supabase
      .from('google_connections')
      .upsert(row, { onConflict: 'member_id,google_email' });
    if (upErr) return json(500, { error: `Save failed: ${upErr.message}` });

    return json(200, { ok: true, email, memberId: member.id });
  } catch (err) {
    return json(502, { error: `Connect failed: ${err.message}` });
  }
};
