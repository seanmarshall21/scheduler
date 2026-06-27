import { supabase } from './supabase';

// Web Push subscribe/unsubscribe for background reminders (app closed).
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window;
}
export function pushConfigured() {
  return Boolean(VAPID_PUBLIC);
}

export async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function enablePush(householdId) {
  if (!pushSupported()) throw new Error('Not supported on this device.');
  if (!pushConfigured()) throw new Error('Push not configured (missing VAPID key).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission denied.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    household_id: householdId || null,
    endpoint: sub.endpoint,
    subscription: sub.toJSON(),
  }, { onConflict: 'endpoint' });
  return 'on';
}

export async function disablePush() {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    try { await sub.unsubscribe(); } catch { /* noop */ }
  }
  return 'off';
}
