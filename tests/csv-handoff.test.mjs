import test from 'node:test';
import assert from 'node:assert/strict';

test('APK CSV handoff waits for native save and share to complete', async () => {
  const { handoffCsv } = await import('../src/lib/csvHandoff.ts');
  let shared = false;
  const result = await handoffCsv('a,b', 'report.csv', {
    isNative: true,
    shareNativeFile: async () => { shared = true; },
    downloadInBrowser: () => assert.fail('Native app must hand off a file, not use browser download'),
  });
  assert.equal(shared, true);
  assert.equal(result, 'native-share');
});

test('native file content is UTF-8 encoded before base64 conversion', async () => {
  const { encodeUtf8Base64 } = await import('../src/lib/csvHandoff.ts');
  const bytes = Uint8Array.from(atob(encodeUtf8Base64('Part,Description\n1,Crème brûlée')), (char) => char.charCodeAt(0));
  assert.equal(new TextDecoder().decode(bytes), 'Part,Description\n1,Crème brûlée');
});

test('web CSV handoff prefers a supported share sheet and otherwise downloads', async () => {
  const { handoffCsv } = await import('../src/lib/csvHandoff.ts');
  let downloaded = false;
  const shared = await handoffCsv('a,b', 'report.csv', {
    isNative: false,
    shareWebFile: async (file) => file.name === 'report.csv',
    downloadInBrowser: () => { downloaded = true; },
  });
  assert.equal(shared, 'web-share');
  assert.equal(downloaded, false);
  const fallback = await handoffCsv('a,b', 'report.csv', {
    isNative: false,
    shareWebFile: async () => false,
    downloadInBrowser: () => { downloaded = true; },
  });
  assert.equal(fallback, 'download');
  assert.equal(downloaded, true);
});
