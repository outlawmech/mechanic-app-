import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowroomPriceFields, showroomPricesMatch } from '../src/lib/showroomPricing.ts';

test('showroom save payload maps and preserves currency fields to cents', () => {
  const fields = buildShowroomPriceFields({
    cost_price: '8400.30',
    msrp_price: '12999.99',
    sale_price: '12450.25',
  }, '550.25');

  assert.deepEqual(fields, {
    base_cost_price: 8400.3,
    cost_price: 8950.55,
    msrp_price: 12999.99,
    sale_price: 12450.25,
  });
  assert.equal(showroomPricesMatch(fields, fields), true);
  assert.equal(showroomPricesMatch({ ...fields, sale_price: 0 }, fields), false);
});

test('blank showroom sale price retains the existing MSRP fallback', () => {
  assert.deepEqual(
    buildShowroomPriceFields({ cost_price: '1000.00', msrp_price: '15000.00', sale_price: '' }),
    { base_cost_price: 1000, cost_price: 1000, msrp_price: 15000, sale_price: 15000 },
  );
});
