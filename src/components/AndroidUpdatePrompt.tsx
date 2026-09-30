import { useEffect, useState } from 'react';
import { hasNewerAndroidBuild, parseAndroidBuildNumber, shouldSkipAndroidUpdateCheck } from '../lib/androidUpdate';

const RELEASE_API = 'https://api.github.com/repos/outlawmech/mechanic-app-/releases/tags/android-apk-latest';
const APK_URL = 'https://github.com/outlawmech/mechanic-app-/releases/download/android-apk-latest/OutlawShopSystems-v1.0.apk';
const CHECKED_AT_KEY = 'oss_android_update_checked_at';
const DISMISSED_BUILD_KEY = 'oss_android_update_dismissed_build';
type AndroidUpdater = {
  getVersionCode?: () => number;
  openLatestApk?: () => void;
};

export default function AndroidUpdatePrompt() {
  const [availableBuild, setAvailableBuild] = useState<number | null>(null);

  useEffect(() => {
    const updater = (window as any).AndroidNativeAppUpdater as AndroidUpdater | undefined;
    if (typeof updater?.getVersionCode !== 'function' || typeof updater.openLatestApk !== 'function') return;
    const getVersionCode = updater.getVersionCode.bind(updater);

    let active = true;
    let inFlight = false;

    async function checkForUpdate(force = false) {
      if (inFlight) return;
      let controller: AbortController | undefined;
      let timeout: number | undefined;
      try {
        const now = Date.now();
        const lastCheck = Number(localStorage.getItem(CHECKED_AT_KEY) || 0);
        if (shouldSkipAndroidUpdateCheck(lastCheck, now, force)) return;

        inFlight = true;
        controller = new AbortController();
        timeout = window.setTimeout(() => controller?.abort(), 10000);
        localStorage.setItem(CHECKED_AT_KEY, String(now));

        const currentBuild = Number(getVersionCode());
        const response = await fetch(RELEASE_API, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) return;

        const release = await response.json();
        const latestBuild = parseAndroidBuildNumber(release?.body);
        localStorage.setItem(CHECKED_AT_KEY, String(Date.now()));
        if (!active || !hasNewerAndroidBuild(currentBuild, latestBuild)) return;
        if (localStorage.getItem(DISMISSED_BUILD_KEY) === String(latestBuild)) return;
        setAvailableBuild(latestBuild);
      } catch {
        // A failed/offline check should never block normal app use.
      } finally {
        if (timeout !== undefined) window.clearTimeout(timeout);
        controller?.abort();
        inFlight = false;
      }
    }

    function checkWhenResumed() {
      if (document.visibilityState === 'visible') void checkForUpdate();
    }

    void checkForUpdate(true);
    document.addEventListener('visibilitychange', checkWhenResumed);
    window.addEventListener('focus', checkWhenResumed);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', checkWhenResumed);
      window.removeEventListener('focus', checkWhenResumed);
    };
  }, []);

  if (availableBuild === null) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_BUILD_KEY, String(availableBuild));
    setAvailableBuild(null);
  }

  function downloadUpdate() {
    dismiss();
    const updater = (window as any).AndroidNativeAppUpdater as AndroidUpdater | undefined;
    if (typeof updater?.openLatestApk === 'function') updater.openLatestApk();
    else window.open(APK_URL, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4" role="presentation">
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="android-update-title" aria-describedby="android-update-description">
        <h2 id="android-update-title" className="text-lg font-black text-slate-900">App update available</h2>
        <p id="android-update-description" className="mt-2 text-sm text-slate-600">
          A newer version of Outlaw Shop Systems is ready. Download it now to update the app.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700">Later</button>
          <button type="button" onClick={downloadUpdate} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-black text-slate-950">Download update</button>
        </div>
      </section>
    </div>
  );
}
