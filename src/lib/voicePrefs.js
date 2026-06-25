// Voice-input preferences for the assistant (stored locally per device).
const K = {
  startMode: 'commons.assistant.startMode', // 'listen' | 'hold' | 'text' — how it opens
  pttKey: 'commons.assistant.pttKey', // KeyboardEvent.code, e.g. 'Space'
  pttKeyLabel: 'commons.assistant.pttKeyLabel', // human label, e.g. 'Space'
  pauseMs: 'commons.assistant.pauseMs', // silence before auto-send (listen mode)
};
const ls = typeof localStorage !== 'undefined' ? localStorage : null;

export const VOICE_DEFAULTS = { startMode: 'listen', pttKey: 'Space', pttKeyLabel: 'Space', pauseMs: 1200 };

// What the assistant does the moment you open it.
export const START_OPTIONS = [
  { val: 'listen', label: 'Listening', hint: 'Opens listening; sends when you pause.' },
  { val: 'hold', label: 'Push-to-talk', hint: 'Opens ready; hold the mic or a key to talk.' },
  { val: 'text', label: 'Text', hint: 'Opens to the keyboard.' },
];

export const PAUSE_OPTIONS = [
  { ms: 600, label: 'Quick (0.6s)' },
  { ms: 1200, label: 'Normal (1.2s)' },
  { ms: 2000, label: 'Relaxed (2s)' },
  { ms: 3000, label: 'Patient (3s)' },
];

export function getVoicePrefs() {
  return {
    startMode: ls?.getItem(K.startMode) || VOICE_DEFAULTS.startMode,
    pttKey: ls?.getItem(K.pttKey) || VOICE_DEFAULTS.pttKey,
    pttKeyLabel: ls?.getItem(K.pttKeyLabel) || VOICE_DEFAULTS.pttKeyLabel,
    pauseMs: Number(ls?.getItem(K.pauseMs)) || VOICE_DEFAULTS.pauseMs,
  };
}

export function setVoicePref(name, value) {
  if (!ls || !K[name]) return;
  ls.setItem(K[name], String(value));
}

// Friendly label for a KeyboardEvent.code.
export function keyLabel(e) {
  if (e.code === 'Space' || e.key === ' ') return 'Space';
  if (e.code?.startsWith('Key')) return e.code.slice(3);
  if (e.code?.startsWith('Digit')) return e.code.slice(5);
  return e.key?.length === 1 ? e.key.toUpperCase() : (e.code || e.key);
}
