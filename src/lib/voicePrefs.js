// Voice-input preferences for the assistant (stored locally per device).
const K = {
  inputMode: 'commons.assistant.inputMode', // 'auto' | 'hold'
  pttKey: 'commons.assistant.pttKey', // KeyboardEvent.code, e.g. 'Space'
  pttKeyLabel: 'commons.assistant.pttKeyLabel', // human label, e.g. 'Space'
  pauseMs: 'commons.assistant.pauseMs', // silence before auto-send
};
const ls = typeof localStorage !== 'undefined' ? localStorage : null;

export const VOICE_DEFAULTS = { inputMode: 'auto', pttKey: 'Space', pttKeyLabel: 'Space', pauseMs: 1200 };

export const PAUSE_OPTIONS = [
  { ms: 600, label: 'Quick (0.6s)' },
  { ms: 1200, label: 'Normal (1.2s)' },
  { ms: 2000, label: 'Relaxed (2s)' },
  { ms: 3000, label: 'Patient (3s)' },
];

export function getVoicePrefs() {
  return {
    inputMode: ls?.getItem(K.inputMode) || VOICE_DEFAULTS.inputMode,
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
  if (e.code === 'Space') return 'Space';
  if (e.key === ' ') return 'Space';
  if (e.code?.startsWith('Key')) return e.code.slice(3);
  if (e.code?.startsWith('Digit')) return e.code.slice(5);
  return e.key?.length === 1 ? e.key.toUpperCase() : (e.code || e.key);
}
