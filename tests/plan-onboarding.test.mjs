import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getOrganizationPlan, hasDealerSales, hasShopCapabilities, PLAN_DEFINITIONS } from '../src/lib/plans.ts';
import { getSubscriptionInfo } from '../src/lib/subscriptionInfo.ts';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

test('the three plans carry the agreed prices and included-user counts', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(PLAN_DEFINITIONS).map(([tier, plan]) => [tier, [plan.price, plan.includedUsers]])),
    { solo: [29, 1], shop: [59, 3], dealer: [99, 4] },
  );
  assert.equal(Object.keys(PLAN_DEFINITIONS).length, 3);
});

test('an explicit organization plan is authoritative over the legacy DMS flag', () => {
  assert.equal(getOrganizationPlan({ plan_tier: 'solo', enable_dealership_mode: true }), 'solo');
  assert.equal(getOrganizationPlan({ plan_tier: 'shop', enable_dealership_mode: false }), 'shop');
  assert.equal(getOrganizationPlan({ enable_dealership_mode: true }), 'dealer');
  assert.equal(getOrganizationPlan({ enable_dealership_mode: false }), 'solo');
});

test('Shop gets service/parts/team capability but no Dealer sales capability', () => {
  assert.equal(hasShopCapabilities({ plan_tier: 'solo', enable_dealership_mode: true }), false);
  assert.equal(hasDealerSales({ plan_tier: 'solo', enable_dealership_mode: true }), false);
  assert.equal(hasShopCapabilities({ plan_tier: 'shop' }), true);
  assert.equal(hasDealerSales({ plan_tier: 'shop' }), false);
  assert.equal(hasShopCapabilities({ plan_tier: 'dealer' }), true);
  assert.equal(hasDealerSales({ plan_tier: 'dealer' }), true);
});

test('the organization trial end remains the same across owner and staff logins', () => {
  const trialEndsAt = '2026-10-18T10:00:00.000Z';
  const settings = { plan_tier: 'shop', subscription_status: 'trialing', trial_started_at: '2026-10-04T10:00:00.000Z', trial_ends_at: trialEndsAt };
  const owner = getSubscriptionInfo({ created_at: '2026-10-04T10:00:00.000Z' }, settings);
  const staff = getSubscriptionInfo({ created_at: '2026-10-10T10:00:00.000Z' }, settings);

  assert.equal(owner.planName, 'Shop');
  assert.equal(owner.planPrice, '$59/mo');
  assert.equal(owner.includedUsers, 3);
  assert.equal(owner.isLocked, false);
  assert.equal(owner.trialEndsAt.toISOString(), trialEndsAt);
  assert.equal(staff.trialEndsAt.toISOString(), trialEndsAt);
});

test('signup persists the selected plan and provisions the trial on the server', () => {
  const authSource = readFileSync(join(root, 'src/lib/auth.tsx'), 'utf8');
  const landingSource = readFileSync(join(root, 'src/pages/Auth.tsx'), 'utf8');
  const routesSource = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  const migration = readFileSync(join(root, 'supabase/migrations/20261004190038_plan_tiers_and_signup_trials.sql'), 'utf8');

  assert.match(authSource, /plan_tier:\s*planTier/);
  assert.match(landingSource, /setSelectedPlan\(tier\)/);
  assert.match(landingSource, /No credit card required/);
  assert.match(routesSource, /hasDealerSales\(settings\)/);
  assert.match(migration, /after insert on auth\.users/i);
  assert.match(migration, /'trialing', now\(\), now\(\) \+ interval '14 days'/i);
  assert.match(migration, /insert into public\.shop_members/i);
  assert.match(migration, /subscription_status in \('active', 'lifetime'\)/i);
  assert.match(migration, /exists \(select 1 from public\.dealership_units/i);
  assert.match(migration, /subscription_status = 'lifetime' or v_status = 'lifetime'/i);
});

test('generic legacy payment links are not presented as a completed plan upgrade', () => {
  const source = [
    'src/components/Layout.tsx',
    'src/components/TrialBanner.tsx',
    'src/components/SubscriptionLockout.tsx',
    'src/pages/Settings.tsx',
    'src/lib/subscription.ts',
  ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /buy\.stripe\.com|STRIPE_PAYMENT_URL/);
});
