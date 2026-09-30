import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTechWorksheetHtml } from '../src/lib/techWorksheet.ts';

const settings = {
  shop_name: 'Big Sky Powersports',
  logo_url: 'data:image/png;base64,logo',
};

function populatedWorkOrder() {
  return {
    number: 'WO-1042',
    created_at: '2026-09-29T18:00:00Z',
    scheduled_at: '2026-10-02T12:00:00Z',
    mileage_or_hours: '145.2 engine hours',
    notes: 'Customer reports hard starting after storage.\nPlease check fuel delivery.',
    customer: {
      first_name: 'Tommy', last_name: 'Wrench', phone: '406-555-0198',
      email: 'tommy@example.com', address: '101 Main St, Helena, MT',
    },
    vehicle: {
      year: 2022, make: 'Yamaha', model: 'Kodiak 700', trim: '', type: 'atv',
      vin: 'JY4AM19Y2NA012345', engine_hours: '145.2', engine2_hours: null,
      engine_serial: '', engine2_serial: '',
    },
    unit: { stock_number: 'STK-44', year: 2022, make: 'Yamaha', model: 'Kodiak 700', trim: '', vin: 'JY4AM19Y2NA012345' },
    items: [{ kind: 'labor', quantity: 1, description: 'Diagnose hard-start concern', sort_order: 0 }],
  };
}

test('builds a one-page letter portrait worksheet with existing WO information', () => {
  const html = buildTechWorksheetHtml(populatedWorkOrder(), settings);

  assert.match(html, /@page\s*\{\s*size:\s*Letter portrait;\s*margin:\s*7mm;/);
  for (const value of [
    'SERVICE WORKSHEET', 'Big Sky Powersports', 'WO-1042', 'Tommy Wrench',
    'tommy@example.com', '101 Main St, Helena, MT', '2022', 'Yamaha', 'Kodiak 700',
    'JY4AM19Y2NA012345', 'STK-44', '145.2 engine hours',
    'Customer reports hard starting after storage.', 'Diagnose hard-start concern',
  ]) assert.ok(html.includes(value), `expected worksheet to include ${value}`);
  assert.match(html, /CUSTOMER CONCERN \/ AUTHORIZED WORK/);
  assert.match(html, /DIAGNOSIS \/ WORK PERFORMED/);
  assert.match(html, /PARTS USED/);
  assert.match(html, /PARTS NEEDED/);
  assert.match(html, /Technician Signature/);
  assert.doesNotMatch(html, /Service Advisor|Additional Recommendations|Outlaw Shop Systems/);
  assert.equal((html.match(/class="writing-line"/g) ?? []).length, 14);
});

test('missing optional data leaves clean blank fields and the shop fallback has no OSS branding', () => {
  const html = buildTechWorksheetHtml({
    number: 'WO-1',
    created_at: '',
    scheduled_at: null,
    mileage_or_hours: '',
    notes: '',
    customer: null,
    vehicle: null,
    unit: null,
    items: [],
  }, { shop_name: 'Outlaw Shop Systems', logo_url: '' });

  assert.match(html, /<span class="shop-name">Dealer \/ Shop<\/span>/);
  assert.doesNotMatch(html, /Outlaw Shop Systems|undefined|null/);
  assert.match(html, /<th>Date In:<\/th><td><\/td>/);
  assert.match(html, /<th>Target Date:<\/th><td><\/td>/);
  assert.match(html, /<h2 class="box-title">CUSTOMER INFORMATION<\/h2>/);
});

test('escapes customer-entered text and image values before rendering standalone HTML', () => {
  const workOrder = populatedWorkOrder();
  workOrder.notes = '<script>alert("bad")</script>';
  workOrder.customer.first_name = 'A < B';
  const html = buildTechWorksheetHtml(workOrder, { ...settings, logo_url: '" onerror="alert(1)' });

  assert.ok(html.includes('&lt;script&gt;alert(&quot;bad&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('A &lt; B Wrench'));
  assert.ok(html.includes('&quot; onerror=&quot;alert(1)'));
  assert.doesNotMatch(html, /<script>alert\("bad"\)<\/script>/);
});
