import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/assistant
//
// Commons' household assistant. The client passes the conversation + a compact
// context snapshot (members, upcoming schedule, open tasks, shared lists). We
// call Claude with that context + write tools; tool calls are executed
// server-side under the caller's RLS (so writes are scoped to their household).
// Returns the final reply + a list of actions taken.
//
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (auth + writes), ANTHROPIC_API_KEY.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const TOOLS = [
  {
    name: 'add_task',
    description: 'Add a shared to-do task for the household.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        assigned_to: { type: 'string', description: 'member id to assign to, or omit for anyone' },
        due_date: { type: 'string', description: 'YYYY-MM-DD, or omit' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_event',
    description: 'Add a calendar event for a member (lives in Commons).',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        member_id: { type: 'string', description: 'who the event is for' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM 24-hour' },
        minutes: { type: 'number', description: 'duration in minutes (default 60)' },
        repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] },
      },
      required: ['title', 'member_id', 'date', 'time'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done/complete. Use the task_id from the open tasks context.',
    input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
  },
  {
    name: 'update_task',
    description: 'Change an existing task: reassign (assigned_to = member id), reschedule (due_date YYYY-MM-DD), or rename (title). Use the task_id from context.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        assigned_to: { type: 'string', description: 'member id, or "anyone"' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        title: { type: 'string' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task entirely. Use the task_id from context. Confirm only if ambiguous.',
    input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
  },
  {
    name: 'add_list_item',
    description: 'Add an item to an existing shared list (use a note_id from the shared lists context).',
    input_schema: {
      type: 'object',
      properties: { note_id: { type: 'string' }, text: { type: 'string' } },
      required: ['note_id', 'text'],
    },
  },
  {
    name: 'add_note',
    description: 'Create a new note or a new shared list.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['note', 'list'] },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['kind'],
    },
  },
];

async function execTool(supabase, householdId, memberId, name, input) {
  if (name === 'add_task') {
    const { error } = await supabase.from('tasks').insert({
      household_id: householdId, title: input.title, assigned_to: input.assigned_to || null,
      created_by: memberId || null, due_date: input.due_date || null,
    });
    if (error) throw new Error(error.message);
    return `Added task "${input.title}".`;
  }
  if (name === 'add_event') {
    const start = new Date(`${input.date}T${input.time || '09:00'}`);
    const end = new Date(start.getTime() + (input.minutes || 60) * 60_000);
    const { error } = await supabase.from('events').insert({
      household_id: householdId, member_id: input.member_id || null, title: input.title,
      starts_at: start.toISOString(), ends_at: end.toISOString(), repeat: input.repeat || 'none',
      created_by: memberId || null,
    });
    if (error) throw new Error(error.message);
    return `Added event "${input.title}" on ${input.date} at ${input.time}.`;
  }
  if (name === 'complete_task') {
    const { error } = await supabase.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', input.task_id);
    if (error) throw new Error(error.message);
    return 'Marked the task done.';
  }
  if (name === 'update_task') {
    const patch = {};
    if (input.assigned_to) patch.assigned_to = input.assigned_to === 'anyone' ? null : input.assigned_to;
    if (input.due_date) patch.due_date = input.due_date;
    if (input.title) patch.title = input.title;
    if (!Object.keys(patch).length) return 'Nothing to change.';
    const { error } = await supabase.from('tasks').update(patch).eq('id', input.task_id);
    if (error) throw new Error(error.message);
    return 'Updated the task.';
  }
  if (name === 'delete_task') {
    const { error } = await supabase.from('tasks').delete().eq('id', input.task_id);
    if (error) throw new Error(error.message);
    return 'Deleted the task.';
  }
  if (name === 'add_list_item') {
    const { data: note, error: e1 } = await supabase.from('notes').select('items').eq('id', input.note_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    const items = Array.isArray(note?.items) ? note.items : [];
    items.push({ id: `i-${Date.now()}`, text: input.text, done: false });
    const { error } = await supabase.from('notes').update({ items }).eq('id', input.note_id);
    if (error) throw new Error(error.message);
    return `Added "${input.text}" to the list.`;
  }
  if (name === 'add_note') {
    const { error } = await supabase.from('notes').insert({
      household_id: householdId, kind: input.kind || 'note', title: input.title || null,
      body: input.body || null, items: [], created_by: memberId || null,
    });
    if (error) throw new Error(error.message);
    return `Created a new ${input.kind || 'note'}.`;
  }
  return 'Unknown action.';
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return json(200, { reply: "I'm not switched on yet — add ANTHROPIC_API_KEY to enable me.", actions: [], configured: false });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
  if (authErr || !user) return json(401, { error: 'Invalid or expired token.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const { messages = [], context = {} } = payload;
  const householdId = context.householdId;
  const memberId = context.activeMemberId || null;

  const system = `You are Commons, a warm and concise household assistant on a kitchen wall screen and on phones. Today is ${context.today}. You help the household coordinate their shared calendar, tasks, and notes.

Members (use these ids in tools): ${JSON.stringify(context.members || [])}
Upcoming schedule: ${JSON.stringify(context.schedule || [])}
Open tasks: ${JSON.stringify(context.tasks || [])}
Shared lists (with note ids + items): ${JSON.stringify(context.lists || [])}

Answer questions about the schedule and tasks directly and briefly, reasoning over the data above (e.g. for "is there free time Thursday", look at that day's events). To make changes, call the tools, then confirm what you did in one short sentence. Each open task includes a task_id — use it to complete_task, update_task (reschedule via due_date, reassign via assigned_to, or rename), or delete_task. Match the task the user means by its title; if two tasks could match, ask which one. If you don't know who a person is, ask. Don't invent events that aren't in the data. Keep replies short, friendly, and skimmable for a busy kitchen.

CRITICAL: Your replies are spoken aloud and shown as chat bubbles. Reply in plain conversational sentences ONLY. Never use Markdown, code blocks, backticks, asterisks, bullet points, numbered lists, headings, or any formatting symbols. If you need to list a few things, say them in a natural sentence ("You've got soccer at 4 and dinner at 6"). Write the way you'd say it out loud.`;

  const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const actions = [];
  let loops = 0;
  try {
    while (loops < 5) {
      loops += 1;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, tools: TOOLS, messages: apiMessages }),
      });
      if (!res.ok) {
        const t = await res.text();
        return json(502, { error: `Assistant error (${res.status}): ${t.slice(0, 200)}` });
      }
      const data = await res.json();
      const toolUses = (data.content || []).filter((c) => c.type === 'tool_use');
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
      if (data.stop_reason !== 'tool_use' || !toolUses.length) {
        return json(200, { reply: text || 'Done.', actions });
      }
      apiMessages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const tu of toolUses) {
        let resultText;
        try {
          resultText = await execTool(supabase, householdId, memberId, tu.name, tu.input || {});
          actions.push(resultText);
        } catch (e) {
          resultText = `Failed: ${e.message}`;
        }
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: resultText });
      }
      apiMessages.push({ role: 'user', content: results });
    }
    return json(200, { reply: 'I got a bit stuck — try rephrasing?', actions });
  } catch (err) {
    return json(502, { error: `Assistant failed: ${err.message}` });
  }
};
