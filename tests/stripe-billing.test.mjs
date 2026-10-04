import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {
  STRIPE_PRICE_IDS,
  checkoutSessionParams,
  getPriceId,
  mayStartCheckout,
  resolveVerifiedEntitlementUpdate,
  stripeStatusToOssStatus,
  subscriptionMatchesPlan,
} from '../netlify/functions/_shared/billing-policy.ts';
import { verifyStripeWebhookEvent } from '../netlify/functions/_shared/webhook-verification.ts';

test('each organization plan maps to its configured monthly Stripe price', () => {
  assert.equal(getPriceId('solo'), 'price_1UMt4UGwcTEAc1PAJpCWInoM');
  assert.equal(getPriceId('shop'), 'price_1UMt4WGwcTEAc1PAqXR4UK8j');
  assert.equal(getPriceId('dealer'), 'price_1UMt4YGwcTEAc1PAXAzfW2ng');
  assert.deepEqual(Object.keys(STRIPE_PRICE_IDS), ['solo', 'shop', 'dealer']);
});

test('unknown or client-substituted plan values cannot select a Stripe price', () => {
  assert.throws(() => getPriceId('price_client_supplied'));
  assert.throws(() => getPriceId('enterprise'));
  assert.equal(subscriptionMatchesPlan({ tier: 'shop', priceId: 'price_client_supplied' }), false);
});

test('Checkout is subscription mode without introducing a Stripe trial', () => {
  for (const tier of ['solo', 'shop', 'dealer']) {
    const params = checkoutSessionParams({
      customer: 'cus_example', priceId: getPriceId(tier), shopId: 'org-123', tier,
      successUrl: 'https://outlawshopsystems.netlify.app/settings?billing=processing',
      cancelUrl: 'https://outlawshopsystems.netlify.app/settings?billing=cancelled',
    });
    assert.equal(params.mode, 'subscription');
    assert.equal(params.line_items[0].price, getPriceId(tier));
    assert.equal(params.metadata.oss_organization_id, 'org-123');
    assert.equal(params.subscription_data.metadata.oss_plan_tier, tier);
    assert.equal('trial_period_days' in params.subscription_data, false);
    assert.equal('payment_method_types' in params, false);
  }
});

test('lifetime and paid organizations do not start a duplicate subscription', () => {
  assert.equal(mayStartCheckout({ subscriptionStatus: 'lifetime' }), false);
  assert.equal(mayStartCheckout({ subscriptionStatus: 'active' }), false);
  assert.equal(mayStartCheckout({ subscriptionStatus: 'trialing' }), true);
  assert.equal(mayStartCheckout({ subscriptionStatus: 'canceled', stripeStatus: 'canceled' }), true);
  assert.equal(mayStartCheckout({ subscriptionStatus: 'trialing', stripeStatus: 'active' }), false);
});

test('only verified active Stripe subscriptions grant paid status; failures/cancellation restrict access', () => {
  assert.equal(stripeStatusToOssStatus('active'), 'active');
  assert.equal(stripeStatusToOssStatus('past_due'), 'past_due');
  assert.equal(stripeStatusToOssStatus('unpaid'), 'past_due');
  assert.equal(stripeStatusToOssStatus('canceled'), 'canceled');
  assert.equal(stripeStatusToOssStatus('trialing'), null);
  assert.equal(stripeStatusToOssStatus('incomplete'), null);
});

test('verified subscription updates apply only to the matching organization, tier and price', () => {
  const base = {
    stripeStatus: 'active', organizationId: 'org-123', organizationTier: 'shop',
    currentEntitlement: 'trialing', metadataOrganizationId: 'org-123', metadataTier: 'shop',
    priceId: getPriceId('shop'),
  };
  assert.equal(resolveVerifiedEntitlementUpdate(base), 'active');
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, metadataOrganizationId: 'other-org' }), null);
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, metadataTier: 'dealer' }), null);
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, priceId: getPriceId('dealer') }), null);
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, currentEntitlement: 'lifetime' }), null);
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, stripeStatus: 'past_due' }), 'past_due');
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, stripeStatus: 'canceled' }), 'canceled');
  assert.equal(resolveVerifiedEntitlementUpdate({ ...base, deleted: true, stripeStatus: 'active' }), 'canceled');
});

test('webhook signature verification accepts a valid test signature and rejects tampering', async () => {
  const stripe = new Stripe('sk_test_local_only', { apiVersion: '2026-08-26.dahlia' });
  const secret = 'whsec_local_test_secret';
  const payload = JSON.stringify({
    id: 'evt_local_test', object: 'event', api_version: '2026-08-26.dahlia', created: 1,
    data: { object: { id: 'sub_local_test' } }, livemode: false, pending_webhooks: 1,
    request: null, type: 'customer.subscription.updated',
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const verified = await verifyStripeWebhookEvent(stripe, payload, signature, secret);
  assert.equal(verified.id, 'evt_local_test');
  await assert.rejects(() => verifyStripeWebhookEvent(stripe, `${payload} `, signature, secret));
  await assert.rejects(() => verifyStripeWebhookEvent(stripe, payload, signature, 'whsec_wrong_secret'));
});
