import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { money } from '../src/lib/format.ts';

test('unpaid amount formatting retains complete currency values across the requested range', () => {
  const amounts = [0, 999.99, 1137.5, 12845.72, 103492.18, 1000000];
  assert.deepEqual(amounts.map(money), [
    '$0.00', '$999.99', '$1,137.50', '$12,845.72', '$103,492.18', '$1,000,000.00',
  ]);
});

test('financial KPI uses its own responsive single-line layout while count KPIs remain unchanged', async () => {
  const dashboard = await readFile(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
  const unpaidCardStart = dashboard.indexOf('<Link to="/invoices" className="block transition hover:-translate-y-0.5">');
  const unpaidCardEnd = dashboard.indexOf('</Link>', unpaidCardStart);
  const unpaidCard = dashboard.slice(unpaidCardStart, unpaidCardEnd);

  assert.match(unpaidCard, /\[container-type:inline-size\]/);
  assert.match(unpaidCard, /whitespace-nowrap/);
  assert.match(unpaidCard, /8cqw/);
  assert.match(unpaidCard, /money\(metrics\.unpaidTotal\)/);
  assert.match(dashboard, /metrics\.openCount/);
  assert.match(dashboard, /metrics\.inProgressCount/);
  assert.match(dashboard, /metrics\.totalCustomers/);
});
