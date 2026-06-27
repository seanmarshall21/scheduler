import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/tts  → { audio: base64Mp3 }  (synthesize)
// GET  /.netlify/functions/tts  → { configured, voices: [{id,label,group}] }
//
// Lifelike assistant voices via Google Cloud TTS and/or ElevenLabs. Auth-gated.
// Voice ids prefixed `el:` route to ElevenLabs; bare Google voice names go to
// Google. Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth),
//      GOOGLE_TTS_API_KEY (optional), ELEVENLABS_API_KEY (optional).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TTS_KEY = process.env.GOOGLE_TTS_API_KEY;
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

const ACCENT = { US: 'US', GB: 'UK', AU: 'Australian', IN: 'Indian', CA: 'Canadian' };
const TIERS = ['Studio', 'Chirp3-HD', 'Chirp-HD', 'Neural2', 'Wavenet', 'News', 'Polyglot'];

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function verify(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  return user || null;
}

// ── Google Cloud voices ──────────────────────────────────────────────────────
function describe(v) {
  const m = /^([a-z]{2})-([A-Z]{2})-(.+)$/.exec(v.name);
  if (!m) return null;
  const region = m[2];
  const rest = m[3];
  const tier = TIERS.find((t) => rest.startsWith(t));
  if (!tier) return null;
  const gender = v.ssmlGender === 'MALE' ? 'M' : v.ssmlGender === 'FEMALE' ? 'F' : '';
  const suffix = rest.slice(tier.length).replace(/^-/, '');
  const label = `${tier}${suffix ? ` ${suffix}` : ''}${gender ? ` (${gender})` : ''}`;
  return { id: v.name, label, group: `${ACCENT[region] || region} · Google`, tier, region: ACCENT[region] || region };
}

async function googleVoices() {
  if (!TTS_KEY) return [];
  const r = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${TTS_KEY}`);
  if (!r.ok) throw new Error(`google voices ${r.status}`);
  const d = await r.json();
  const order = ['US', 'UK', 'Australian', 'Indian', 'Canadian'];
  const out = (d.voices || [])
    .filter((v) => v.languageCodes?.some((c) => /^en-/.test(c)) && /^en-/.test(v.name))
    .map(describe)
    .filter(Boolean);
  out.sort((a, z) => {
    const g = (order.indexOf(a.region) + 1 || 99) - (order.indexOf(z.region) + 1 || 99);
    if (g !== 0) return g;
    const t = TIERS.indexOf(a.tier) - TIERS.indexOf(z.tier);
    return t !== 0 ? t : a.id.localeCompare(z.id);
  });
  return out.map(({ id, label, group }) => ({ id, label, group }));
}

// ── ElevenLabs voices ────────────────────────────────────────────────────────
async function elevenVoices() {
  if (!ELEVEN_KEY) return [];
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': ELEVEN_KEY } });
  if (!r.ok) throw new Error(`eleven voices ${r.status}`);
  const d = await r.json();
  return (d.voices || []).map((v) => ({ id: `el:${v.voice_id}`, label: v.name, group: 'ElevenLabs' }));
}

async function synthGoogle(text, voice) {
  const voiceId = /^[a-z]{2}-[A-Z]{2}-/.test(voice || '') ? voice : 'en-US-Neural2-F';
  const languageCode = voiceId.split('-').slice(0, 2).join('-');
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode, name: voiceId }, audioConfig: { audioEncoding: 'MP3' } }),
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).audioContent;
}

async function synthEleven(text, voice) {
  const voiceId = voice.slice(3); // strip "el:"
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

export const handler = async (event) => {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await verify(token);
  if (!user) return json(401, { error: 'Unauthorized' });

  const configured = Boolean(TTS_KEY || ELEVEN_KEY);

  if (event.httpMethod === 'GET') {
    if (!configured) return json(200, { configured: false, voices: [] });
    const results = await Promise.allSettled([elevenVoices(), googleVoices()]);
    const voices = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    return json(200, { configured: true, voices: voices.length ? voices : [{ id: 'en-US-Neural2-F', label: 'Neural2-F (F)', group: 'US · Google' }] });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!configured) return json(200, { configured: false });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const text = (body.text || '').slice(0, 1200);
  if (!text) return json(400, { error: 'No text.' });
  const voice = body.voice || '';
  const useEleven = voice.startsWith('el:') ? ELEVEN_KEY : null;

  try {
    const audio = useEleven ? await synthEleven(text, voice) : (TTS_KEY ? await synthGoogle(text, voice) : await synthEleven(text, voice));
    return json(200, { audio });
  } catch (err) {
    return json(502, { error: `TTS error: ${err.message}` });
  }
};
