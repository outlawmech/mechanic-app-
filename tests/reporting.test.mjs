import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPaymentsInDateRange,
  getReportDateBounds,
  isInReportDateRange,
  toCsv,
  toLocalDateOnly,
} from '../src/lib/reporting.ts';
import { getInvoiceBalanceDue, getInvoiceReceivables } from '../src/lib/invoiceAccounting.ts';

test('report date ranges use stable local calendar boundaries', () => {
  const now = new Date(2026, 8, 1, 12, 30);
  const month = getReportDateBounds('month', now);
  const lastMonth = getReportDateBounds('last_month', now);
  const year = getReportDateBounds('year', now);

  assert.equal(new Date(month.start).getDate(), 1);
  assert.equal(new Date(month.start).getMonth(), 8);
  assert.equal(new Date(month.endExclusive).getMonth(), 9);
  assert.equal(new Date(lastMonth.start).getMonth(), 7);
  assert.equal(new Date(lastMonth.endExclusive).getMonth(), 8);
  assert.equal(new Date(year.start).getFullYear(), 2026);
  assert.equal(isInReportDateRange('2026-08-31T23:59:59', month), false);
  assert.equal(isInReportDateRange('2026-09-01T00:00:00', month), true);
});

test('payment reporting filters by payment date, independent of invoice issue date', () => {
  const bounds = getReportDateBounds('month', new Date(2026, 8, 15));
  const payments = getPaymentsInDateRange([{
    number: 'INV-1',
    total: 150,
    status: 'partial',
    issued_at: '2026-08-20T12:00:00',
    payments: [
      { amount: 75, method: 'cash', created_at: '2026-09-03T10:00:00' },
      { amount: 75, method: 'credit_card', created_at: '2026-10-01T10:00:00' },
    ],
  }], bounds);

  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 75);
  assert.equal(payments[0].method, 'cash');
});

test('payment reporting caps duplicates, preserves legacy paid invoices, and excludes voids', () => {
  const bounds = { start: null, endExclusive: null };
  const payments = getPaymentsInDateRange([
    {
      number: 'INV-PARTIAL', total: 100, status: 'partial', issued_at: '2026-09-01',
      payments: [{ amount: 80, created_at: '2026-09-02' }, { amount: 80, created_at: '2026-09-03' }],
    },
    { number: 'INV-LEGACY', total: 50, status: 'paid', issued_at: '2026-09-01', paid_at: '2026-09-04' },
    {
      number: 'INV-VOID', total: 200, status: 'void', issued_at: '2026-09-01',
      payments: [{ amount: 200, created_at: '2026-09-04' }],
    },
  ], bounds);

  assert.deepEqual(payments.map(({ invoiceNumber, amount }) => [invoiceNumber, amount]), [
    ['INV-PARTIAL', 80],
    ['INV-PARTIAL', 20],
    ['INV-LEGACY', 50],
  ]);
  assert.equal(payments[2].referenceNote, 'Legacy paid invoice; payment detail unavailable');
});

test('CSV quotes delimiters and newlines and protects formula-like text', () => {
  const csv = toCsv(['Name', 'Note', 'Amount'], [[
    'Smith, "Auto"', 'line one\nline two', 12.5,
  ], ['=HYPERLINK("https://example.test")', '+SUM(A1:A2)', -2]]);

  assert.equal(csv, [
    '"Name","Note","Amount"',
    '"Smith, ""Auto""","line one\nline two",12.50',
    '"\'=HYPERLINK(""https://example.test"")","\'+SUM(A1:A2)",-2.00',
  ].join('\r\n'));
});

test('date-only CSV values stay on their calendar date', () => {
  assert.equal(toLocalDateOnly('2026-09-01'), '2026-09-01');
});

test('unpaid, partial, and paid fixtures reconcile current receivables across reporting periods', () => {
  const invoices = [
    {
      number: 'INV-OLD-UNPAID', total: 600, status: 'unpaid', issued_at: '2026-08-15T12:00:00Z', payments: [],
    },
    {
      number: 'INV-CURRENT-PARTIAL', total: 400, status: 'partial', issued_at: '2026-09-02T12:00:00Z',
      payments: [{ amount: 166, method: 'cash', created_at: '2026-09-03T12:00:00Z' }],
    },
    {
      number: 'INV-CURRENT-PAID', total: 200, status: 'paid', issued_at: '2026-09-04T12:00:00Z',
      payments: [{ amount: 200, method: 'credit_card', created_at: '2026-09-05T12:00:00Z' }],
    },
    {
      number: 'INV-CURRENT-UNPAID', total: 75.25, status: 'unpaid', issued_at: '2026-09-06T12:00:00Z', payments: [],
    },
  ];

  assert.deepEqual(invoices.map(getInvoiceBalanceDue), [600, 234, 0, 75.25]);

  // Dashboard, invoice-list outstanding, and Financials AR now consume this
  // same point-in-time receivables summary: 600 + 234 + 75.25 = 909.25.
  const receivables = getInvoiceReceivables(invoices);
  assert.equal(receivables.total, 909.25);
  assert.deepEqual(receivables.invoices.map(({ invoice }) => invoice.number), [
    'INV-OLD-UNPAID', 'INV-CURRENT-PARTIAL', 'INV-CURRENT-UNPAID',
  ]);

  const september = getReportDateBounds('month', new Date(2026, 8, 15));
  const septemberIssued = invoices.filter((invoice) => isInReportDateRange(invoice.issued_at, september));
  assert.deepEqual(septemberIssued.map((invoice) => invoice.number), [
    'INV-CURRENT-PARTIAL', 'INV-CURRENT-PAID', 'INV-CURRENT-UNPAID',
  ]);
  assert.equal(getPaymentsInDateRange(invoices, september).reduce((sum, payment) => sum + payment.amount, 0), 366);

  // The revenue period may exclude an older invoice; point-in-time AR must not.
  assert.equal(getInvoiceReceivables(septemberIssued).total, 309.25);
  assert.equal(getInvoiceReceivables(invoices).total, 909.25);
});
