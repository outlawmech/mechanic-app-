import test from 'node:test';
import assert from 'node:assert/strict';
import { splitQuantityByAvailability } from '../src/lib/inventoryQuantities.ts';

test('zero available sends the full requested quantity to the customer order', () => {
  assert.deepEqual(splitQuantityByAvailability(1, 0), {
    stockQuantity: 0,
    specialOrderQuantity: 1,
  });
});

test('partial availability keeps stock and customer-order quantities separate', () => {
  assert.deepEqual(splitQuantityByAvailability(5, 2), {
    stockQuantity: 2,
    specialOrderQuantity: 3,
  });
});

test('sufficient stock creates no special-order quantity', () => {
  assert.deepEqual(splitQuantityByAvailability(2, 7), {
    stockQuantity: 2,
    specialOrderQuantity: 0,
  });
});

test('fractional quantities are preserved and negative inputs are clamped', () => {
  assert.deepEqual(splitQuantityByAvailability(2.5, 1.25), {
    stockQuantity: 1.25,
    specialOrderQuantity: 1.25,
  });
  assert.deepEqual(splitQuantityByAvailability(-1, -3), {
    stockQuantity: 0,
    specialOrderQuantity: 0,
  });
});
