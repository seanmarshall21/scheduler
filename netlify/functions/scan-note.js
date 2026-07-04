import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/scan-note
// Body: { image: dataURL, kind: 'auto' | 'list' | 'note' }
// Reads a photo of a handwritten/printed list or notes and returns a clean,
// organized structure to drop straight into a Commons note or checklist.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth), ANTHROPIC_API_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const TOOL = {
  name: 'save_capture',
  description: 'Return the transcribed and organized content from the photo.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['list', 'note'], description: 'list = checklist of items; note = prose/paragraphs' },
      title: { type: 'string', description: 'a short, descriptive title' },
      items: { type: 'array', items: { type: 'string' }, description: 'checklist items, cleaned/deduped/logically ordered (only for kind=list)' },
      body: { type: 'string', description: 'organized note text (only for kind=note)' },
    },
    required: ['kind', 'title'],
  },
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return json(200, { error: 'Scanning is not switched on yet (missing ANTHROPIC_API_KEY).' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json(401, { error: 'Missing bearer token.' });
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json(401, { error: 'Invalid or expired token.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const { image, kind = 'auto' } = payload;
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(image || '');
  if (!m) return json(400, { error: 'Send an image as a base64 data URL.' });
  const [, mediaType, data] = m;

  const forced = kind === 'list' || kind === 'note'
    ? `The user wants this saved as a ${kind}, so set kind="${kind}".`
    : 'Decide kind: use "list" for anything that reads as discrete items (packing, groceries, to-dos, steps); use "note" for prose/paragraphs.';

  const prompt = `This is a photo of handwritten or printed content. Transcribe it accurately, then organize it. ${forced} For a list: give a short title and a cleaned "items" array — one entry per item, fix obvious spelling, drop duplicates, and order/group them sensibly (e.g. by category). For a note: give a title and an organized "body" preserving the meaning, tidied into readable lines/paragraphs. Do not invent content that isn't there. Call save_capture with the result.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'save_capture' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json(502, { error: `Scan failed (${res.status}): ${t.slice(0, 200)}` });
    }
    const body = await res.json();
    const tool = (body.content || []).find((c) => c.type === 'tool_use' && c.name === 'save_capture');
    if (!tool) return json(502, { error: "Couldn't read that photo — try a clearer, well-lit shot." });
    const out = tool.input || {};
    return json(200, {
      kind: out.kind === 'note' ? 'note' : 'list',
      title: (out.title || 'Scanned').toString().slice(0, 120),
      items: Array.isArray(out.items) ? out.items.map((s) => String(s)).filter(Boolean).slice(0, 200) : [],
      body: out.body ? String(out.body) : '',
    });
  } catch (err) {
    return json(502, { error: `Scan error: ${err.message}` });
  }
};
