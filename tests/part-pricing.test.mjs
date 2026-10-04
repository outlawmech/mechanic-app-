import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartPriceFields, partPricesMatch } from '../src/lib/partPricing.ts';

test('part cost and sell prices preserve entered cents in dollar units', () => {
  const fields = buildPartPriceFields({ cost_price: '10.00', sell_price: '20.00' });
  assert.deepEqual(fields, { cost_price: 10, sell_price: 20 });
  assert.equal(partPricesMatch({ cost_price: '10.00', sell_price: '20.00' }, fields), true);
  assert.equal(partPricesMatch({ cost_price: '0.00', sell_price: '0.00' }, fields), false);
});

test('blank and zero part prices intentionally save as zero', () => {
  assert.deepEqual(buildPartPriceFields({ cost_price: '', sell_price: '0' }), { cost_price: 0, sell_price: 0 });
});
