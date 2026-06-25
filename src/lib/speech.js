import { supabase } from './supabase';

// Spoken replies for the assistant. Prefers Google Cloud TTS (lifelike) when the
// server has it configured; otherwise falls back to the browser's built-in
// voices (preferring Google, dropping the robotic local Microsoft ones).
const VOICE_KEY = 'commons.assistant.voice'; // browser voice name
const CLOUD_VOICE_KEY = 'commons.assistant.cloudVoice'; // Google Cloud voice id

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

export function getVoiceName() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(VOICE_KEY)) || '';
}
export function setVoiceName(name) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(VOICE_KEY, name || '');
}

export function onVoicesReady(cb) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = listVoices();
  if (v.length) { cb(v); return; }
  window.speechSynthesis.addEventListener('voiceschanged', () => cb(listVoices()), { once: true });
}

function speakBrowser(text) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) { resolve(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const voices = listVoices();
    const chosen = voices.find((v) => v.name === getVoiceName()) || preferredVoice(voices);
    if (chosen) u.voice = chosen;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

// ── Cloud (Google) TTS ──────────────────────────────────────────────────────
let ttsConfig = null; // { configured, voices }
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

export function getCloudVoice() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(CLOUD_VOICE_KEY)) || '';
}
export function setCloudVoice(id) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CLOUD_VOICE_KEY, id || '');
}

async function speakCloud(text) {
  const token = await authToken();
  const res = await fetch('/.netlify/functions/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: getCloudVoice() || undefined }),
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

// Speak `text` — Google Cloud TTS if available, else the browser voice.
export async function speak(text) {
  if (!text) return;
  const cfg = await ttsStatus();
  if (cfg?.configured) {
    try {
      await speakCloud(text);
      return;
    } catch {
      /* fall through to browser */
    }
  }
  speakBrowser(text);
}
