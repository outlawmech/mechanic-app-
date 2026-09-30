export const ANDROID_UPDATE_RESUME_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Read the build number written into the latest Android APK release notes. */
export function parseAndroidBuildNumber(releaseBody: unknown): number | null {
  if (typeof releaseBody !== 'string') return null;
  const match = releaseBody.match(/\bBuild number:\s*(\d+)\b/i);
  if (!match) return null;
  const buildNumber = Number(match[1]);
  return Number.isSafeInteger(buildNumber) && buildNumber > 0 ? buildNumber : null;
}

export function hasNewerAndroidBuild(currentBuild: number, latestBuild: number | null): boolean {
  return Number.isSafeInteger(currentBuild) && currentBuild > 0 && latestBuild !== null && latestBuild > currentBuild;
}

/** App startup checks always run; foreground checks are throttled to avoid excess release API requests. */
export function shouldSkipAndroidUpdateCheck(lastCheckedAt: number, now: number, force = false): boolean {
  if (force || !Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0 || !Number.isFinite(now)) return false;
  const elapsed = now - lastCheckedAt;
  return elapsed >= 0 && elapsed < ANDROID_UPDATE_RESUME_CHECK_INTERVAL_MS;
}
