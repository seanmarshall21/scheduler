import { supabase } from './supabase';

// Spoken replies for the assistant. Two voice sources:
//   • Google Cloud TTS (lifelike) — when the server has GOOGLE_TTS_API_KEY.
//   • The browser's built-in voices (device-dependent; Google ones preferred).
// The chosen voice is stored as "cloud:<id>" or "browser:<name>" (empty = auto).
const SEL_KEY = 'commons.assistant.voiceSel';

// ── Browser voices ──────────────────────────────────────────────────────────
export function listVoices() {
  return typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

export function usableVoices(voices) {
  return voices.filter((v) => /^en(-|_|$)/i.test(v.lang) && !/microsoft/i.test(v.name));
}

export function preferredVoice(voices) {
  const list = usableVoices(voices);
  const google = list.find((v) => /google/i.test(v.name));
  const nice = list.find((v) => /natural|neural|online|samantha|premium|aria|jenny|libby|sonia|ava|siri/i.test(v.name));
  return google || nice || list.find((v) => v.default) || list[0] || voices.find((v) => /^en/i.test(v.lang)) || voices[0] || null;
}

export function onVoicesReady(cb) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = listVoices();
  if (v.length) { cb(v); return; }
  window.speechSynthesis.addEventListener('voiceschanged', () => cb(listVoices()), { once: true });
}

// ── Voice selection (unified across both sources) ─────────────────────────────
export function getVoiceSel() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(SEL_KEY)) || '';
}
export function setVoiceSel(val) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(SEL_KEY, val || '');
}

function speakBrowser(text, name) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const voices = listVoices();
    const chosen = (name && voices.find((v) => v.name === name)) || preferredVoice(voices);
    if (chosen) u.voice = chosen;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

// ── Cloud (Google) TTS ──────────────────────────────────────────────────────
let ttsConfig = null; // { configured, voices: [{id,label,group}] }
let audioEl = null;

async function authToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function ttsStatus() {
  if (ttsConfig) return ttsConfig;
  try {
    const token = await authToken();
    const res = await fetch('/.netlify/functions/tts', { headers: { Authorization: `Bearer ${token}` } });
    ttsConfig = await res.json();
  } catch {
    ttsConfig = { configured: false, voices: [] };
  }
  return ttsConfig;
}

async function speakCloud(text, id) {
  const token = await authToken();
  const res = await fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: id || undefined }),
  });
  const data = await res.json();
  if (!data.audio) throw new Error('no audio');
  if (!audioEl) audioEl = new Audio();
  audioEl.src = `data:audio/mp3;base64,${data.audio}`;
  await audioEl.play();
  await new Promise((resolve) => { audioEl.onended = resolve; audioEl.onerror = resolve; });
}

// Stop any in-progress speech (cloud audio or browser synthesis).
export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  if (audioEl) { try { audioEl.pause(); audioEl.currentTime = 0; } catch { /* noop */ } }
}

// Speak `text` using the selected voice, with sensible fallbacks.
export async function speak(text) {
  if (!text) return;
  const sel = getVoiceSel();
  const cfg = await ttsStatus();

  if (sel.startsWith('browser:')) return speakBrowser(text, sel.slice(8));
  if (sel.startsWith('cloud:') && cfg?.configured) {
    try { return await speakCloud(text, sel.slice(6)); } catch { /* fall through */ }
  }
  // Auto: prefer cloud when available, else the browser voice.
  if (cfg?.configured) {
    try { return await speakCloud(text); } catch { /* fall through */ }
  }
  return speakBrowser(text);
}
