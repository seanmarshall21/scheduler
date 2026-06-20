import { createClient } from '@supabase/supabase-js';

// POST /.netlify/functions/crftd-schedule
//
// Bridges the user's CRFTD work schedule into Commons. CRFTD's `schedule_blocks`
// table stores only WHEN/WHO (task_id, clickup_user_id, day, start_min, minutes)
// — the title + color live in ClickUp. So this function:
//   1. verifies the caller's Commons Supabase JWT,
//   2. maps their email → ClickUp user id,
//   3. reads their schedule_blocks from CRFTD's Supabase (service role),
//   4. resolves each block's ClickUp task → { title, brand color },
//   5. returns enriched blocks for Commons to drop on the family board.
//
// Env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (verify caller — Commons'
// own), CRFTD_SUPABASE_URL + CRFTD_SUPABASE_SERVICE_ROLE_KEY (read CRFTD blocks),
// CLICKUP_API_TOKEN (task titles/colors), CLICKUP_USER_MAP (JSON email→id).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const CRFTD_URL = process.env.CRFTD_SUPABASE_URL;
const CRFTD_SERVICE_KEY = process.env.CRFTD_SUPABASE_SERVICE_ROLE_KEY;
const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;

// Folder id → brand color, copied from CRFTD's _shared/clickup.js so Commons can
// resolve a task's color without depending on CRFTD's code.
const BRANDS = {
  '90146188130': '#58C470', '90147024760': '#E8388A', '90147144356': '#303064',
  '90147144380': '#3F5196', '90146189583': '#6DD0D9', '90147468985': '#6C5CE7',
  '90147024773': '#E8A020', '90147024703': '#C0703A', '90149212855': '#2BB3C0',
  '90147144365': '#8C7BD8', '90147144369': '#4A9D7E', '90149730627': '#B5485A',
  '90147144384': '#636E72',
};
const UNKNOWN_BRAND_COLOR = '#9699A6';
const brandColor = (folderId) => BRANDS[String(folderId)] ?? UNKNOWN_BRAND_COLOR;

// Email → ClickUp user id. Overridable via CLICKUP_USER_MAP env (JSON).
const DEFAULT_USER_MAP = { 'sean@crssd.com': '82354110' };

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function clickupIdFor(email) {
  let parsed = {};
  try { parsed = JSON.parse(process.env.CLICKUP_USER_MAP || '{}'); } catch { /* ignore */ }
  const map = { ...DEFAULT_USER_MAP, ...parsed };
  return map[(email || '').toLowerCase()] || null;
}

async function fetchTaskMeta(taskId) {
  try {
    const res = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: CLICKUP_TOKEN },
    });
    if (!res.ok) return null;
    const t = await res.json();
    const folderId = t?.folder?.id ?? t?.project?.id ?? null;
    return { title: t?.name ?? 'Task', color: brandColor(folderId) };
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(500, { error: 'Server missing Supabase config.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const userToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userToken) return json(401, { error: 'Missing bearer token.' });

  // Gate: must be a signed-in Commons user.
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await asUser.auth.getUser(userToken);
  if (authErr || !user) return json(401, { error: 'Invalid or expired token.' });

  // Not wired up yet — degrade gracefully so the board just shows no work blocks.
  if (!CRFTD_URL || !CRFTD_SERVICE_KEY || !CLICKUP_TOKEN) {
    return json(200, { configured: false, blocks: [] });
  }

  const clickupUserId = clickupIdFor(user.email);
  if (!clickupUserId) return json(200, { configured: true, blocks: [], note: 'No ClickUp id mapped for this user.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON body.' }); }
  const dayOf = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);
  const minDay = dayOf(payload.timeMin);
  const maxDay = dayOf(payload.timeMax);

  try {
    // 1. Read this user's CRFTD blocks (service role bypasses CRFTD's RLS).
    const crftd = createClient(CRFTD_URL, CRFTD_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let q = crftd.from('schedule_blocks').select('*').eq('clickup_user_id', String(clickupUserId));
    if (minDay) q = q.gte('day', minDay);
    if (maxDay) q = q.lte('day', maxDay);
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) return json(502, { error: `CRFTD read failed: ${rowsErr.message}` });
    if (!rows?.length) return json(200, { configured: true, blocks: [] });

    // 2. Resolve each unique task → title + color (ClickUp).
    const taskIds = [...new Set(rows.map((r) => r.task_id).filter(Boolean))];
    const metaEntries = await Promise.all(
      taskIds.map(async (id) => [id, await fetchTaskMeta(id)])
    );
    const meta = new Map(metaEntries);

    // 3. Enrich.
    const blocks = rows.map((r) => {
      const m = meta.get(r.task_id);
      return {
        id: r.id,
        taskId: r.task_id,
        day: r.day,
        startMin: r.start_min,
        minutes: r.minutes,
        title: m?.title ?? 'Work',
        color: m?.color ?? UNKNOWN_BRAND_COLOR,
      };
    });

    return json(200, { configured: true, blocks });
  } catch (err) {
    return json(502, { error: `Work schedule sync failed: ${err.message}` });
  }
};
