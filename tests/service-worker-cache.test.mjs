import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('online script requests use the current network bundle instead of cached code', async () => {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const cacheWrites = [];
  const cached = new Response('old cached bundle', { status: 200 });
  const cache = { put: async (...args) => cacheWrites.push(args) };
  const context = {
    URL,
    Response,
    console,
    self: { location: { origin: 'https://oss.example' }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: { open: async () => cache, match: async () => cached },
    fetch: async () => new Response('current network bundle', { status: 200 }),
  };
  runInNewContext(source, context);

  let responsePromise;
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'cors', destination: 'script', url: 'https://oss.example/assets/app.js' },
    respondWith: (promise) => { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(await response.text(), 'current network bundle');
  assert.equal(cacheWrites.length, 1);
});
