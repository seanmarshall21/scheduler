import { supabase } from './supabase';

// Sync a set of "account" preferences (stored in localStorage for instant reads)
// to the DB so they follow the user across devices. Device-specific things
// (dashboard layout, active member, fridge-seen) are deliberately NOT listed.
const SYNC_KEYS = [
  'commons.assistant.startMode',
  'commons.assistant.pttKey',
  'commons.assistant.pttKeyLabel',
  'commons.assistant.pauseMs',
  'commons.assistant.bargeIn',
  'commons.assistant.voiceSel',
];
const ls = typeof localStorage !== 'undefined' ? localStorage : null;

let pulled = false;

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Hydrate localStorage from the user's saved prefs (called once after sign-in).
export async function pullPrefs() {
  if (!ls) return;
  try {
    const uid = await currentUserId();
    if (!uid) return;
    const { data } = await supabase.from('user_prefs').select('prefs').eq('user_id', uid).maybeSingle();
    const prefs = data?.prefs || {};
    for (const k of SYNC_KEYS) {
      if (prefs[k] != null) ls.setItem(k, String(prefs[k]));
    }
    // Let mounted components pick up the synced values.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('commons:prefs-synced'));
  } catch { /* ignore */ } finally {
    pulled = true; // enable write-through even if the pull failed (it'll create the row)
  }
}

// Write a single pref through to the DB (merged into the jsonb).
export async function pushPref(key, value) {
  if (!ls || !SYNC_KEYS.includes(key)) return;
  // Don't clobber the cloud copy with defaults before we've pulled it.
  if (!pulled) return;
  try {
    const uid = await currentUserId();
    if (!uid) return;
    const { data } = await supabase.from('user_prefs').select('prefs').eq('user_id', uid).maybeSingle();
    const prefs = { ...(data?.prefs || {}), [key]: value };
    await supabase.from('user_prefs').upsert({ user_id: uid, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch { /* ignore */ }
}
