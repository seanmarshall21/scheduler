// Spoken replies for the assistant. Browser speech-synthesis voices vary wildly
// by device; we prefer the higher-quality "natural / online / Google" voices and
// let the user override the choice in Settings.
const VOICE_KEY = 'commons.assistant.voice';

export function listVoices() {
  return typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

// Pick the nicest English voice available (avoids the old robotic default).
export function preferredVoice(voices) {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const nice = en.find((v) => /natural|neural|online|google|samantha|premium|aria|jenny|libby|sonia|ava|siri/i.test(v.name));
  return nice || en.find((v) => v.default) || en[0] || voices[0] || null;
}

export function getVoiceName() {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(VOICE_KEY)) || '';
}
export function setVoiceName(name) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(VOICE_KEY, name || '');
}

// Voices load asynchronously on some browsers — call back when they're ready.
export function onVoicesReady(cb) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const v = listVoices();
  if (v.length) { cb(v); return; }
  window.speechSynthesis.addEventListener('voiceschanged', () => cb(listVoices()), { once: true });
}

export function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  const voices = listVoices();
  const chosen = voices.find((v) => v.name === getVoiceName()) || preferredVoice(voices);
  if (chosen) u.voice = chosen;
  u.rate = 1;
  u.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
