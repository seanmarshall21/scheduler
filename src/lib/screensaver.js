// Kiosk screen-saver prefs (per device — only the wall display usually wants it).
const ENABLED_KEY = 'commons.screensaver.enabled';
const MINS_KEY = 'commons.screensaver.minutes';

export function getScreensaver() {
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  return {
    enabled: ls?.getItem(ENABLED_KEY) === '1',
    minutes: Number(ls?.getItem(MINS_KEY)) || 3,
  };
}

export function setScreensaver({ enabled, minutes }) {
  if (typeof localStorage === 'undefined') return;
  if (enabled != null) localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  if (minutes != null) localStorage.setItem(MINS_KEY, String(minutes));
  window.dispatchEvent(new Event('commons:screensaver'));
}

export const SAVER_MINUTES = [1, 2, 3, 5, 10, 15];
