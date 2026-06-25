import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/tts  → { audio: base64Mp3 }  (synthesize)
// GET  /.netlify/functions/tts  → { configured, voices }  (is cloud TTS on + voice list)
//
// Lifelike assistant voices via Google Cloud Text-to-Speech. Auth-gated so the
// TTS quota isn't open to the public.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth), GOOGLE_TTS_API_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TTS_KEY = process.env.GOOGLE_TTS_API_KEY;

// A curated set of natural Google Neural2 voices.
const VOICES = [
  { id: 'en-US-Neural2-F', label: 'US · Warm (F)' },
  { id: 'en-US-Neural2-C', label: 'US · Bright (F)' },
  { id: 'en-US-Neural2-D', label: 'US · Calm (M)' },
  { id: 'en-US-Neural2-A', label: 'US · Neutral (M)' },
  { id: 'en-GB-Neural2-A', label: 'British (F)' },
  { id: 'en-GB-Neural2-B', label: 'British (M)' },
  { id: 'en-AU-Neural2-A', label: 'Australian (F)' },
];

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function verify(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  return user || null;
}

export const handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await verify(token);
  if (!user) return json(401, { error: 'Unauthorized' });

  if (event.httpMethod === 'GET') {
    return json(200, { configured: Boolean(TTS_KEY), voices: VOICES });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!TTS_KEY) return json(200, { configured: false });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const text = (body.text || '').slice(0, 1200);
  if (!text) return json(400, { error: 'No text.' });
  const voiceId = VOICES.some((v) => v.id === body.voice) ? body.voice : 'en-US-Neural2-F';
  const languageCode = voiceId.split('-').slice(0, 2).join('-');

  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode, name: voiceId },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json(502, { error: `TTS failed (${res.status}): ${t.slice(0, 200)}` });
    }
    const data = await res.json();
    return json(200, { audio: data.audioContent });
  } catch (err) {
    return json(502, { error: `TTS error: ${err.message}` });
  }
};
