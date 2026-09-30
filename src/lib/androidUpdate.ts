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
