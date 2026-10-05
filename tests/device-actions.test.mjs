import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source-level visibility contracts using the existing Tailwind md breakpoint.
// These do not substitute for physical-device or rendered browser acceptance.
const source = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('customer phone actions are mobile-only while desktop contact details remain', async () => {
  const list = await source('pages/Customers.tsx');
  assert.match(list, /className="flex items-center gap-1\.5 md:hidden">\s+\{c\.phone/);
  assert.match(list, /href=\{`tel:\$\{c\.phone\}`\}/);
  assert.match(list, /href=\{`sms:\$\{c\.phone\}`\}/);
  assert.match(list, /c\.phone \|\| c\.email/);
  const detail = await source('pages/CustomerDetail.tsx');
  assert.match(detail, /href=\{`tel:\$\{c\.phone\}`\}\s+className="md:hidden/);
  assert.match(detail, /c\.phone && <p className="hidden md:flex[^\n]+\{c\.phone\}/);
  assert.match(detail, /\{c\.address\}/);
});

test('dispatch retains mobile Maps ETA Call handlers and desktop address and phone', async () => {
  const page = await source('pages/Schedule.tsx');
  assert.match(page, /className="grid grid-cols-3 gap-1\.5 md:hidden"/);
  assert.match(page, /onClick=\{\(\) => handleOpenMaps\(wo\.customer\.address\)\}\s+className="md:hidden/);
  assert.match(page, /onClick=\{\(\) => handleSendETA\(wo\)\}/);
  assert.match(page, /href=\{`tel:\$\{wo\.customer\.phone\}`\}/);
  assert.match(page, /wo\.customer\?\.address && <p className="hidden md:flex/);
  assert.match(page, /wo\.customer\?\.phone && <p className="hidden md:block/);
});

test('invoice and work order text actions hide at md while email stays available', async () => {
  const wo = await source('pages/WorkOrderDetail.tsx');
  assert.match(wo, /className="text-xs md:hidden"\s+onClick=\{handleShareEstimate\}/);
  assert.match(wo, /className="text-xs"\s+onClick=\{handleEmailEstimate\}/);
  const invoice = await source('pages/InvoiceDetail.tsx');
  assert.match(invoice, /onClick=\{handleShareInvoice\}\s+className="text-xs font-semibold md:hidden"/);
  assert.match(invoice, /onClick=\{handleEmailInvoice\}\s+className="text-xs font-semibold"/);
});

test('special order phone actions hide at md but phone and manual notification remain', async () => {
  const parts = await source('pages/Parts.tsx');
  assert.match(parts, /href=\{`tel:\$\{so\.customer_phone\}`\}\s+className="md:hidden/);
  assert.match(parts, /<span className="hidden md:inline[^\n]+\{so\.customer_phone\}/);
  assert.match(parts, /className="md:hidden text-\[10px\][^\n]+\n\s+>\s+💬 SMS/);
  const modal = await source('components/SpecialOrderNotifyModal.tsx');
  assert.match(modal, /className="grid grid-cols-2 gap-2 md:hidden">\s+\{order\.customer_phone/);
  assert.match(modal, /onClick=\{openSms\}/);
  assert.match(modal, /onClick=\{openDialer\}/);
  assert.match(modal, /onClick=\{copyMessage\}/);
  assert.match(modal, /\{order\.customer_phone \|\| 'None provided'\}/);
  const receive = await source('components/SpecialOrderReceiveModal.tsx');
  assert.match(receive, /<label className="md:hidden[^\n]+\n\s+<input/);
});
