import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSuppliers, partsForSupplier } from '../src/lib/purchaseOrderSuppliers.ts';

const parts = [
  { id: '1', supplier: 'Powersports Dist', sku: 'BELT-1', name: 'Drive Belt' },
  { id: '2', supplier: ' powersports dist ', sku: 'FILTER-1', name: 'Oil Filter' },
  { id: '3', supplier: 'AZ', sku: 'PLUG-1', name: 'Spark Plug' },
  { id: '4', supplier: '', sku: 'MANUAL', name: 'Manual Item' },
];

test('stock PO supplier matching ignores case and surrounding whitespace', () => {
  assert.deepEqual(partsForSupplier(parts, 'POWERSPORTS DIST').map((part) => part.id), ['1', '2']);
  assert.deepEqual(partsForSupplier(parts, 'unknown'), []);
  assert.deepEqual(partsForSupplier(parts, ''), []);
});

test('supplier choices are unique and exclude blank supplier names', () => {
  assert.deepEqual(catalogSuppliers(parts), ['AZ', 'Powersports Dist']);
});
