import test from 'node:test';
import assert from 'node:assert/strict';
import { WORK_ORDER_TYPES, canCreateCustomerInvoice, getWorkOrderType, parseWorkItemQuantity } from '../src/lib/workOrderType.ts';
import { workOrderEstimate } from '../src/lib/format.ts';
import { buildTechWorksheetHtml } from '../src/lib/techWorksheet.ts';
import { buildStandaloneInvoiceHtml } from '../src/lib/printer.ts';

test('work order types have exactly three values and legacy orders retain safe classifications', () => {
  assert.deepEqual(WORK_ORDER_TYPES, ['customer', 'warranty', 'internal']);
  assert.equal(getWorkOrderType({}), 'customer');
  assert.equal(getWorkOrderType({ internal_type: 'pdi' }), 'internal');
  assert.equal(getWorkOrderType({ internal_type: 'rigging' }), 'internal');
  assert.equal(getWorkOrderType({ work_order_type: 'customer', internal_type: 'pdi' }), 'internal');
  assert.equal(getWorkOrderType({ work_order_type: 'warranty' }), 'warranty');
  assert.equal(getWorkOrderType({ work_order_type: 'internal' }), 'internal');
  assert.equal(canCreateCustomerInvoice('customer'), true);
  assert.equal(canCreateCustomerInvoice('warranty'), false);
  assert.equal(canCreateCustomerInvoice('internal'), false);
});

test('work item quantity parsing preserves hundredth-hour values and existing labor rates calculate correctly', () => {
  const quantities = ['0.25', '0.5', '0.8', '0.82', '1.37', '2.75'];
  assert.deepEqual(quantities.map(parseWorkItemQuantity), [0.25, 0.5, 0.8, 0.82, 1.37, 2.75]);
  const estimate = workOrderEstimate([{ quantity: parseWorkItemQuantity('0.82'), unit_price: 95 }]);
  assert.equal(estimate, 77.9);
});

test('printable work order and invoice retain 0.82 labor hours and currency totals', () => {
  const workOrder = {
    number: 'WO-82',
    work_order_type: 'warranty',
    created_at: '2026-10-02T12:00:00Z',
    scheduled_at: null,
    mileage_or_hours: '',
    notes: '',
    customer: { first_name: 'Pat', last_name: 'Customer' },
    vehicle: null,
    unit: null,
    items: [{ kind: 'labor', quantity: 0.82, unit_price: 95, description: 'Warranty labor', sort_order: 0 }],
  };
  const worksheet = buildTechWorksheetHtml(workOrder, { shop_name: 'Test Shop', logo_url: '' });
  assert.match(worksheet, /WO Type:<\/th><td>Warranty<\/td>/);
  assert.match(worksheet, /0\.82 × Warranty labor/);

  const invoice = buildStandaloneInvoiceHtml({
    number: 'INV-82', status: 'unpaid', subtotal: 77.9, tax: 0, tax_rate: 0, total: 77.9,
    payments: [], issued_at: '2026-10-02T12:00:00Z', due_date: '2026-11-01T12:00:00Z',
    customer: { first_name: 'Pat', last_name: 'Customer', address: '', phone: '', email: '' },
  }, workOrder.items, null, { shop_name: 'Test Shop', invoice_notes: '' }, workOrder);
  assert.match(invoice, /<td[^>]*>\s*0\.82\s*<\/td>/);
  assert.match(invoice, /\$77\.90/);
});
