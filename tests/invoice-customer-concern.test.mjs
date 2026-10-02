import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneInvoiceHtml, getInvoiceCustomerConcern, getInvoiceWorkOrderNumber } from '../src/lib/printer.ts';

function invoice(workOrderId = 'wo-service-1', overrides = {}) {
  return {
    id: 'invoice-1',
    number: 'INV-1001',
    work_order_id: workOrderId,
    customer_id: 'customer-1',
    subtotal: 120,
    tax_rate: 0,
    tax: 0,
    total: 120,
    status: 'unpaid',
    due_date: '2026-11-01T00:00:00Z',
    issued_at: '2026-10-02T00:00:00Z',
    paid_at: null,
    notes: '',
    payments: [],
    customer: { first_name: 'Pat', last_name: 'Customer', address: '', phone: '', email: '' },
    ...overrides,
  };
}

function settings() {
  return { shop_name: 'Test Shop', tagline: '', phone: '', email: '', logo_url: '', invoice_notes: '' };
}

function serviceWorkOrder(notes, overrides = {}) {
  return {
    id: 'wo-service-1',
    number: 'WO-1001',
    notes,
    mileage_or_hours: '100 hours',
    ...overrides,
  };
}

test('service invoice prints the short customer concern from its linked Work Order before itemized charges', () => {
  const workOrder = serviceWorkOrder('100 hour service');
  const html = buildStandaloneInvoiceHtml(invoice(), [
    { description: 'Performed 100-hour service', kind: 'labor', quantity: 1, unit_price: 120, sort_order: 0 },
  ], null, settings(), workOrder);

  const concernPosition = html.indexOf('CUSTOMER CONCERN / AUTHORIZED WORK');
  const itemTablePosition = html.indexOf('<!-- Line items table -->');
  assert.ok(concernPosition >= 0);
  assert.ok(concernPosition < itemTablePosition);
  assert.match(html, /CUSTOMER CONCERN \/ AUTHORIZED WORK<\/div>\s*<div>100 hour service<\/div>/);
  assert.match(html, /Work Order: WO-1001/);
  assert.ok(html.indexOf('Performed 100-hour service') > concernPosition);
});

test('long multiline concern wraps cleanly and remains distinct from technician work and charges', () => {
  const concern = `Customer requests inspection after intermittent stalling.\n${'Confirm operation under load and inspect the fuel delivery system. '.repeat(10)}`;
  const workOrder = serviceWorkOrder(concern);
  const chargedWork = 'Technician found a restricted filter and replaced it';
  const html = buildStandaloneInvoiceHtml(invoice(), [
    { description: chargedWork, kind: 'labor', quantity: 0.82, unit_price: 95, sort_order: 0 },
    { description: 'Fuel filter', kind: 'part', quantity: 1, unit_price: 42.1, sort_order: 1 },
  ], null, settings(), workOrder);
  const concernStart = html.indexOf('<section class="customer-concern-box">');
  const concernEnd = html.indexOf('</section>', concernStart);
  const concernMarkup = html.slice(concernStart, concernEnd);

  assert.ok(concernMarkup.includes('Customer requests inspection after intermittent stalling.'));
  assert.ok(concernMarkup.includes('Confirm operation under load'));
  assert.match(html, /\.customer-concern-box\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(html, /height:\s*auto;\s*min-height:\s*0;\s*max-height:\s*none;/);
  assert.doesNotMatch(concernMarkup, /height:\s*\d+(?:px|pt|mm)|min-height:\s*\d+(?:px|pt|mm)/);
  assert.doesNotMatch(html, /\.customer-concern-box\s*\{[^}]*page-break-inside:\s*avoid/);
  assert.ok(html.indexOf(chargedWork) > concernEnd);
  assert.match(html, /0\.82/);
  assert.match(html, /Fuel filter/);
});

test('direct Parts Counter invoices omit the concern heading even when linked to a placeholder WO', () => {
  const counterInvoice = invoice('wo-counter-1', { number: 'INV-P1001' });
  const counterWorkOrder = serviceWorkOrder('Part Invoice · Paid via CASH', {
    id: 'wo-counter-1',
    number: 'PRT-1001',
  });

  assert.equal(getInvoiceCustomerConcern(counterInvoice, counterWorkOrder), '');
  assert.equal(getInvoiceWorkOrderNumber(counterInvoice, counterWorkOrder), '');
  const html = buildStandaloneInvoiceHtml(counterInvoice, [
    { description: 'Spark plug', kind: 'part', quantity: 1, unit_price: 12, sort_order: 0 },
  ], null, settings(), counterWorkOrder);
  assert.doesNotMatch(html, /CUSTOMER CONCERN \/ AUTHORIZED WORK/);
  assert.doesNotMatch(html, /Work Order:/);

  assert.equal(getInvoiceCustomerConcern(invoice(null), null), '');
  assert.equal(getInvoiceWorkOrderNumber(invoice(null), null), '');
  assert.equal(getInvoiceCustomerConcern(invoice(), serviceWorkOrder('   ')), '');
});

test('service invoice shows only the matching originating Work Order number', () => {
  assert.equal(getInvoiceWorkOrderNumber(invoice(), serviceWorkOrder('Customer concern')), 'WO-1001');
  assert.equal(getInvoiceWorkOrderNumber(invoice(), serviceWorkOrder('Concern', { id: 'another-wo' })), '');
});

test('long invoices keep every line item and totals in normal print flow around the compact concern block', () => {
  const rows = Array.from({ length: 28 }, (_, index) => ({
    description: `Service charge line ${index + 1}`,
    kind: index % 2 ? 'part' : 'labor',
    quantity: 1,
    unit_price: 10,
    sort_order: index,
  }));
  const html = buildStandaloneInvoiceHtml(
    invoice('wo-service-1', { subtotal: 280, total: 280 }), rows, null, settings(),
    serviceWorkOrder('100 hour service'),
  );

  for (let index = 1; index <= rows.length; index += 1) assert.ok(html.includes(`Service charge line ${index}`));
  assert.match(html, /<span>Total<\/span>[\s\S]*?<span[^>]*>\$280\.00<\/span>/);
  assert.match(html, /\.invoice-container\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/);
  assert.doesNotMatch(html, /\.invoice-container\s*\{[^}]*height\s*:/);
  assert.ok(html.indexOf('CUSTOMER CONCERN / AUTHORIZED WORK') < html.indexOf('Service charge line 1'));
  assert.ok(html.indexOf('Service charge line 28') < html.indexOf('<div class="totals-wrapper">'));
});
