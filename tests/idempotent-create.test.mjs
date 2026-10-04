import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrRecoverById } from '../src/lib/idempotentCreate.ts';

test('quick-create retry reuses the persisted row after a lost insert response', async () => {
  const row = { id: 'stable-id', first_name: 'Ada' };
  let insertCount = 0;
  let lookupId = null;

  const result = await createOrRecoverById(
    'stable-id',
    true,
    async (id) => { lookupId = id; return row; },
    async () => { insertCount += 1; return { id: 'duplicate' }; },
  );

  assert.equal(lookupId, 'stable-id');
  assert.equal(result, row);
  assert.equal(insertCount, 0);
});

test('quick-create inserts once when no row exists for the stable id', async () => {
  const row = { id: 'stable-id', first_name: 'Ada' };
  let insertCount = 0;

  const result = await createOrRecoverById(
    'stable-id',
    true,
    async () => null,
    async () => { insertCount += 1; return row; },
  );

  assert.equal(result, row);
  assert.equal(insertCount, 1);
});

test('quick-create refuses to claim success without a returned persisted row', async () => {
  await assert.rejects(
    createOrRecoverById('stable-id', false, async () => null, async () => null),
    /server did not confirm/i,
  );
});
