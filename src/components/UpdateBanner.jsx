import { useRegisterSW } from 'virtual:pwa-register/react';
import { X } from 'lucide-react';

// "NEW STUFF!" update prompt — mirrors the banner in our other apps. With
// registerType 'prompt' + skipWaiting:false, a freshly deployed service worker
// waits until the user taps Update. We also poll for a new version every minute
// so the always-on kitchen kiosk surfaces updates without a manual reload.
const CHECK_EVERY_MS = 60_000;

export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) setInterval(() => r.update(), CHECK_EVERY_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-[55] flex justify-center px-3 pb-safe">
      <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-[#e0b07c] bg-gradient-to-r from-[#f7dcab] to-[#e9a44d] px-4 py-3 shadow-xl">
        <div className="min-w-0">
          <p className="text-sm font-extrabold uppercase tracking-wide text-text">New stuff!</p>
          <p className="truncate text-xs text-text-2">Updated version available</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-full bg-text px-4 py-2 text-sm font-bold text-white transition-transform hover:scale-105"
          >
            Update
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            aria-label="Dismiss"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-2 hover:bg-black/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
