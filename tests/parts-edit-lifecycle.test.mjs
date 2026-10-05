import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Parts source guards save/edit races and retains inventory during refresh', async () => {
  const source = await readFile(new URL('../src/pages/Parts.tsx', import.meta.url), 'utf8');

  // A synchronous ref guard closes the pre-render double-submit/edit race.
  assert.match(source, /if \(savingPartRef\.current\) return;/);
  assert.match(source, /savingPartRef\.current = true;/);
  assert.match(source, /finally \{\s+savingPartRef\.current = false;\s+setSavingPart\(false\);/);

  // Background mutation refreshes retain the existing inventory controls.
  assert.match(source, /if \(loading && parts === undefined\) return <Spinner \/>;/);

  // The row action is a real mobile touch target and cannot select another
  // part while the previous part's mutation is still settling.
  const editButton = source.slice(source.indexOf('onClick={() => startEdit(p)}') - 250, source.indexOf('onClick={() => startEdit(p)}') + 500);
  assert.match(editButton, /disabled=\{savingPart\}/);
  assert.match(editButton, /min-h-11/);
  assert.match(editButton, /min-w-11/);
});

test('Parts UI has no inventory deletion action or handler', async () => {
  const source = await readFile(new URL('../src/pages/Parts.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /handleDeletePart|Delete part|Part deleted/);
  assert.doesNotMatch(source, /from\('parts'\)\.delete\(/);
});

test('Parts selection scrolls the rendered edit form into view', async () => {
  const source = await readFile(new URL('../src/pages/Parts.tsx', import.meta.url), 'utf8');
  assert.match(source, /useEffect\(\(\) => \{\s+if \(addingPart && editingPart\) \{\s+editPartFormRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\);\s+\}\s+\}, \[addingPart, editingPart\]\);/);
  assert.match(source, /<form\s+ref=\{editPartFormRef\}\s+onSubmit=\{handleSavePart\}/);
  assert.match(source, /className="scroll-mt-32 space-y-3/);
});
