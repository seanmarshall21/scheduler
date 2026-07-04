import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/capture
// Body: { image: dataURL, context: { today, members:[{name}], lists:[{title}] } }
// Reads a photo/screenshot of ANYTHING (a plan/text about a date, a handwritten
// list, notes, a to-do) and classifies + extracts it into event | task | list |
// note. The client shows a review sheet before saving.
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth), ANTHROPIC_API_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const TOOL = {
  name: 'capture',
  description: 'Return the one best structured interpretation of the image.',
  input_schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['event', 'task', 'list', 'note'] },
      title: { type: 'string', description: 'short descriptive title' },
      date: { type: 'string', description: 'event date YYYY-MM-DD' },
      time: { type: 'string', description: 'event start HH:MM 24-hour' },
      minutes: { type: 'number', description: 'event duration minutes (default 60)' },
      location: { type: 'string', description: 'event location if mentioned' },
      notes: { type: 'string', description: 'extra event details' },
      due_date: { type: 'string', description: 'task due date YYYY-MM-DD if any' },
      who: { type: 'string', description: 'a person name if one is clearly responsible/attending' },
      items: { type: 'array', items: { type: 'string' }, description: 'checklist items (kind=list), cleaned + deduped + grouped' },
      listMatch: { type: 'string', description: 'exact title of an existing list this clearly extends, else omit' },
      body: { type: 'string', description: 'organized note text (kind=note)' },
    },
    required: ['kind', 'title'],
  },
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return json(200, { error: 'Capture is not switched on yet (missing ANTHROPIC_API_KEY).' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return json(401, { error: 'Missing bearer token.' });
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json(401, { error: 'Invalid or expired token.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const { image, context = {} } = payload;
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.*)$/s.exec(image || '');
  if (!m) return json(400, { error: 'Send an image as a base64 data URL.' });
  const [, mediaType, data] = m;

  const members = (context.members || []).map((x) => x.name).filter(Boolean);
  const listTitles = (context.lists || []).map((x) => x.title).filter(Boolean);

  const prompt = `Read this photo or screenshot and turn it into ONE structured item for a household hub. Today is ${context.today || 'unknown'}.
Classify kind:
- "event": a plan tied to a date/time (e.g. a text like "dinner Saturday 7pm at Mario's"). Extract date, time, minutes, location, notes.
- "task": a single actionable to-do, possibly with a deadline → due_date.
- "list": multiple items to check off (packing, groceries, steps). Extract items[] cleaned, deduped, sensibly grouped/ordered. Keep each item as PLAIN text — no bullets, no markdown emphasis. If the list has sections/categories, put each section title as its own item prefixed with "## " (e.g. "## Car items") — these render as dividers, not checkboxes. If it clearly extends an existing list, set listMatch to its exact title.
- "note": prose/paragraph info worth keeping → organized body.
Household members: ${members.join(', ') || '(none)'} — if a person is clearly responsible or attending, set "who" to their name. Existing lists: ${listTitles.join(', ') || '(none)'}.
Resolve relative dates ("this Saturday", "tomorrow") against today into absolute YYYY-MM-DD. Don't invent details that aren't present. Call capture with your single best interpretation.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'capture' },
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
      return json(502, { error: `Capture failed (${res.status}): ${t.slice(0, 200)}` });
    }
    const body = await res.json();
    const tool = (body.content || []).find((c) => c.type === 'tool_use' && c.name === 'capture');
    if (!tool) return json(502, { error: "Couldn't read that image — try a clearer, well-lit shot." });
    const out = tool.input || {};
    const kind = ['event', 'task', 'list', 'note'].includes(out.kind) ? out.kind : 'note';
    return json(200, {
      kind,
      title: String(out.title || 'Scanned').slice(0, 140),
      date: out.date || '',
      time: out.time || '',
      minutes: Number(out.minutes) || 60,
      location: out.location || '',
      notes: out.notes || '',
      due_date: out.due_date || '',
      who: out.who || '',
      items: Array.isArray(out.items) ? out.items.map((s) => String(s)).filter(Boolean).slice(0, 200) : [],
      listMatch: out.listMatch || '',
      body: out.body ? String(out.body) : '',
    });
  } catch (err) {
    return json(502, { error: `Capture error: ${err.message}` });
  }
};
