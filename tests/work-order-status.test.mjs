import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompletedWorkOrderStatus } from '../src/lib/workOrderStatus.ts';

test('completed work order category includes completed and invoiced terminal statuses only', () => {
  assert.equal(isCompletedWorkOrderStatus('completed'), true);
  assert.equal(isCompletedWorkOrderStatus('invoiced'), true);
  assert.equal(isCompletedWorkOrderStatus('open'), false);
  assert.equal(isCompletedWorkOrderStatus('in_progress'), false);
});
