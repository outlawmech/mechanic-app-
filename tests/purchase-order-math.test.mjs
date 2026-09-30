import test from 'node:test';
import assert from 'node:assert/strict';
import { getPurchaseOrderLineTotal, getPurchaseOrderRemaining, getPurchaseOrderSubtotal, getReceiptStatus } from '../src/lib/purchaseOrderMath.ts';

test('partial receipt keeps the balance outstanding for later receipts', () => {
  assert.equal(getPurchaseOrderRemaining({ quantity_ordered: 5, quantity_received: 3 }), 2);
  assert.equal(getPurchaseOrderRemaining({ quantity_ordered: 5, quantity_received: 7 }), 0);
});

test('PO totals use ordered quantities and expected costs, with freight separate', () => {
  const lines = [
    { quantity_ordered: 3, expected_unit_cost: '12.50' },
    { quantity_ordered: 2, expected_unit_cost: '7.25' },
  ];
  assert.equal(getPurchaseOrderLineTotal(lines[0]), 37.5);
  assert.equal(getPurchaseOrderSubtotal(lines), 52);
});

test('receipt status stays partial until every PO line is received', () => {
  assert.equal(getReceiptStatus([
    { quantity_ordered: 5, quantity_received: 3 },
    { quantity_ordered: 2, quantity_received: 2 },
  ]), 'partially_received');
  assert.equal(getReceiptStatus([
    { quantity_ordered: 5, quantity_received: 5 },
    { quantity_ordered: 2, quantity_received: 2 },
  ]), 'received');
});
