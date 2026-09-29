import assert from 'node:assert/strict';
import test from 'node:test';
import { getSubscriptionInfo } from '../src/lib/subscriptionInfo.ts';

const organizationSettings = {
  subscription_status: 'lifetime',
  trial_ends_at: '2026-01-01T00:00:00.000Z',
  enable_dealership_mode: true,
};

test('owner and invited staff receive the same server-loaded organization entitlement', () => {
  const owner = getSubscriptionInfo({ created_at: '2026-01-01T00:00:00.000Z' }, organizationSettings);
  const invitedStaff = getSubscriptionInfo({ created_at: '2026-09-01T00:00:00.000Z' }, organizationSettings);

  assert.equal(owner.isPro, true);
  assert.equal(invitedStaff.isPro, true);
  assert.equal(owner.isLocked, false);
  assert.equal(invitedStaff.isLocked, false);
  assert.equal(invitedStaff.status, 'active');
  assert.equal(invitedStaff.isDealershipTier, true);
});

test('a personal trial row or local browser flag cannot grant Pro access', () => {
  globalThis.localStorage = { getItem: () => 'true' };
  const personalTrial = getSubscriptionInfo(
    { email: 'outlawmech@example.test', created_at: '2025-01-01T00:00:00.000Z' },
    { subscription_status: 'trialing', enable_dealership_mode: false },
  );
  delete globalThis.localStorage;

  assert.equal(personalTrial.isPro, false);
  assert.equal(personalTrial.isLocked, true);
  assert.equal(personalTrial.isDealershipTier, false);
});

test('the organization trial end date is shared instead of recalculated from each member account', () => {
  const status = getSubscriptionInfo(
    { created_at: '2026-09-28T00:00:00.000Z' },
    { subscription_status: 'trialing', trial_ends_at: '2020-09-29T00:00:00.000Z' },
  );

  assert.equal(status.status, 'expired');
  assert.equal(status.isLocked, true);
  assert.equal(status.trialEndsAt.toISOString(), '2020-09-29T00:00:00.000Z');
});
