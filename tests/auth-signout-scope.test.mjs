import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const srcRoot = join(repoRoot, 'src');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx|js|jsx)$/.test(entry.name)
        ? [path]
        : [];
  });
}

test('the only Supabase signOut call explicitly uses local scope', () => {
  const calls = sourceFiles(srcRoot).flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/\.auth\.signOut\s*\(([^)]*)\)/gs)].map((match) => ({
      file: relative(repoRoot, path),
      text: match[0],
    }));
  });

  assert.equal(calls.length, 1, 'Unexpected direct Supabase signOut calls: ' + JSON.stringify(calls));
  assert.equal(calls[0].file, 'src/lib/auth.tsx');
  assert.match(calls[0].text, /^\.auth\.signOut\(\{\s*scope:\s*['"]local['"]\s*\}\)$/);
});

test('Settings and subscription lockout use the shared ordinary logout action', () => {
  for (const path of ['src/pages/Settings.tsx', 'src/components/SubscriptionLockout.tsx']) {
    const source = readFileSync(join(repoRoot, path), 'utf8');
    assert.match(source, /\bsignOut\b/);
    assert.match(source, /onClick=\{signOut\}/);
  }
});
