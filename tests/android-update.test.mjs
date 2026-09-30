import test from 'node:test';
import assert from 'node:assert/strict';
import { hasNewerAndroidBuild, parseAndroidBuildNumber } from '../src/lib/androidUpdate.ts';

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
