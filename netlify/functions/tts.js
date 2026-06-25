import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/tts  → { audio: base64Mp3 }  (synthesize)
// GET  /.netlify/functions/tts  → { configured, voices: [{id,label,group}] }
//
// Lifelike assistant voices via Google Cloud Text-to-Speech. Auth-gated so the
// TTS quota isn't open to the public.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth), GOOGLE_TTS_API_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TTS_KEY = process.env.GOOGLE_TTS_API_KEY;

const ACCENT = { US: 'US', GB: 'UK', AU: 'Australian', IN: 'Indian', CA: 'Canadian' };
// Voice tiers worth offering, best-first. (Standard is excluded — it's robotic.)
const TIERS = ['Studio', 'Chirp3-HD', 'Chirp-HD', 'Neural2', 'Wavenet', 'News', 'Polyglot'];

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function verify(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  return user || null;
}

// Build a friendly label + group from a Google voice name like "en-US-Neural2-F".
function describe(v) {
  const m = /^([a-z]{2})-([A-Z]{2})-(.+)$/.exec(v.name);
  if (!m) return null;
  const region = m[2];
  const rest = m[3]; // e.g. "Neural2-F" or "Chirp3-HD-Aoede"
  const tier = TIERS.find((t) => rest.startsWith(t));
  if (!tier) return null; // skip Standard / unknown tiers
  const gender = v.ssmlGender === 'MALE' ? 'M' : v.ssmlGender === 'FEMALE' ? 'F' : '';
  const suffix = rest.slice(tier.length).replace(/^-/, '');
  const label = `${tier}${suffix ? ` ${suffix}` : ''}${gender ? ` (${gender})` : ''}`;
  return { id: v.name, label, group: ACCENT[region] || region, tier, region };
}

async function fetchVoices() {
  const r = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${TTS_KEY}`);
  if (!r.ok) throw new Error(`voices ${r.status}`);
  const d = await r.json();
  const regionOrder = ['US', 'UK', 'Australian', 'Indian', 'Canadian'];
  const out = (d.voices || [])
    .filter((v) => v.languageCodes?.some((c) => /^en-/.test(c)) && /^en-/.test(v.name))
    .map(describe)
    .filter(Boolean);
  out.sort((a, z) => {
    const g = regionOrder.indexOf(a.group) - regionOrder.indexOf(z.group);
    if (g !== 0) return (regionOrder.indexOf(a.group) === -1 ? 99 : 0) - (regionOrder.indexOf(z.group) === -1 ? 99 : 0) || g;
    const t = TIERS.indexOf(a.tier) - TIERS.indexOf(z.tier);
    return t !== 0 ? t : a.id.localeCompare(z.id);
  });
  return out.map(({ id, label, group }) => ({ id, label, group }));
}

export const handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await verify(token);
  if (!user) return json(401, { error: 'Unauthorized' });

  if (event.httpMethod === 'GET') {
    if (!TTS_KEY) return json(200, { configured: false, voices: [] });
    try {
      return json(200, { configured: true, voices: await fetchVoices() });
    } catch {
      return json(200, { configured: true, voices: [{ id: 'en-US-Neural2-F', label: 'Neural2-F (F)', group: 'US' }] });
    }
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!TTS_KEY) return json(200, { configured: false });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const text = (body.text || '').slice(0, 1200);
  if (!text) return json(400, { error: 'No text.' });
  const voiceId = /^[a-z]{2}-[A-Z]{2}-/.test(body.voice || '') ? body.voice : 'en-US-Neural2-F';
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
