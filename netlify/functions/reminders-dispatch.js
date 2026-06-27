import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Scheduled every minute: deliver due reminders via Web Push when Commons is
// closed. A 60s grace lets an OPEN app (the kiosk) fire it in-app + aloud first
// (it marks `fired`); this is the backstop for closed devices.
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
//      VAPID_PRIVATE_KEY, VAPID_SUBJECT.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:sean@crssd.com';

export const config = { schedule: '* * * * *' };

export default async () => {
  if (!SERVICE_KEY || !VAPID_PRIVATE || !SUPABASE_URL) {
    return new Response('not configured', { status: 200 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: due, error } = await sb
    .from('reminders')
    .select('*')
    .eq('fired', false)
    .lte('remind_at', cutoff)
    .limit(100);
  if (error) return new Response(`query failed: ${error.message}`, { status: 500 });

  let sent = 0;
  for (const r of due || []) {
    // Claim it first so reruns / the in-app watcher don't double-send.
    await sb.from('reminders').update({ fired: true }).eq('id', r.id);
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('household_id', r.household_id);
    const payload = JSON.stringify({ title: 'Commons reminder', body: r.text, url: '/', tag: `rem-${r.id}` });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await sb.from('push_subscriptions').delete().eq('id', s.id); // gone → prune
        }
      }
    }
  }
  return new Response(`dispatched ${due?.length || 0} reminder(s), ${sent} push(es)`);
};
