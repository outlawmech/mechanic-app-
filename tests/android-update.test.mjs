import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_UPDATE_RESUME_CHECK_INTERVAL_MS,
  hasNewerAndroidBuild,
  parseAndroidBuildNumber,
  shouldSkipAndroidUpdateCheck,
} from '../src/lib/androidUpdate.ts';

test('reads the build number from the latest APK release notes', () => {
  assert.equal(parseAndroidBuildNumber('Build number: 72\nDownload below'), 72);
  assert.equal(parseAndroidBuildNumber('No build number here'), null);
  assert.equal(parseAndroidBuildNumber(null), null);
  assert.equal(parseAndroidBuildNumber('Build number: 0'), null);
});

test('offers an update only when the published APK build is newer', () => {
  assert.equal(hasNewerAndroidBuild(71, 72), true);
  assert.equal(hasNewerAndroidBuild(72, 72), false);
  assert.equal(hasNewerAndroidBuild(73, 72), false);
  assert.equal(hasNewerAndroidBuild(0, 72), false);
  assert.equal(hasNewerAndroidBuild(71, null), false);
});

test('always checks on app startup even when a recent check timestamp exists', () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldSkipAndroidUpdateCheck(now - 60_000, now, true), false);
});

test('throttles foreground update checks briefly but checks again after the interval', () => {
  const now = 1_800_000_000_000;
  assert.equal(shouldSkipAndroidUpdateCheck(now - 60_000, now), true);
  assert.equal(shouldSkipAndroidUpdateCheck(now - ANDROID_UPDATE_RESUME_CHECK_INTERVAL_MS, now), false);
});
