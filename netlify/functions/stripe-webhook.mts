import type { Config, Context } from '@netlify/functions';
import type Stripe from 'stripe';
import { resolveVerifiedEntitlementUpdate, type PlanTier } from './_shared/billing-policy.ts';
import { env, getStripe, getSupabaseAdmin } from './_shared/server-clients.ts';
import { verifyStripeWebhookEvent } from './_shared/webhook-verification.ts';

type BillingRow = { shop_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null; stripe_subscription_status: string | null };

async function getOrganizationForEvent(admin: ReturnType<typeof getSupabaseAdmin>, customerId: string | null, orgFromMetadata?: string | null) {
  if (customerId) {
    const { data, error } = await admin.from('organization_billing').select('shop_id,stripe_customer_id,stripe_subscription_id,stripe_subscription_status')
      .eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw error;
    if (data) return data as BillingRow;
  }
  if (orgFromMetadata) {
    const { data, error } = await admin.from('organization_billing').select('shop_id,stripe_customer_id,stripe_subscription_id,stripe_subscription_status')
      .eq('shop_id', orgFromMetadata).maybeSingle();
    if (error) throw error;
    if (data && (!customerId || data.stripe_customer_id === customerId)) return data as BillingRow;
  }
  return null;
}

async function syncSubscription(admin: ReturnType<typeof getSupabaseAdmin>, subscription: Stripe.Subscription, deleted = false) {
  const metadataOrg = subscription.metadata?.oss_organization_id || null;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const billing = await getOrganizationForEvent(admin, customerId, metadataOrg);
  if (!billing || billing.stripe_customer_id !== customerId) return;
  const { data: settings, error: settingsError } = await admin.from('shop_settings')
    .select('plan_tier,subscription_status').eq('user_id', billing.shop_id).maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) return;
  const tier = settings.plan_tier as PlanTier;
  const primaryPrice = subscription.items.data[0]?.price.id;
  const configured = {
    solo: env('STRIPE_PRICE_SOLO', true),
    shop: env('STRIPE_PRICE_SHOP', true),
    dealer: env('STRIPE_PRICE_DEALER', true),
  };
  const status = resolveVerifiedEntitlementUpdate({
    stripeStatus: subscription.status,
    deleted,
    organizationId: billing.shop_id,
    organizationTier: tier,
    currentEntitlement: settings.subscription_status,
    metadataOrganizationId: subscription.metadata?.oss_organization_id,
    metadataTier: subscription.metadata?.oss_plan_tier,
    priceId: primaryPrice,
    configured,
  });
  if (!status) return;
  if (billing.stripe_subscription_id && billing.stripe_subscription_id !== subscription.id
    && billing.stripe_subscription_status !== 'canceled'
    && billing.stripe_subscription_status !== 'incomplete_expired') return;

  const { error: billingError } = await admin.from('organization_billing').upsert({
    shop_id: billing.shop_id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: deleted ? 'canceled' : subscription.status,
    stripe_checkout_session_id: null,
    stripe_checkout_expires_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'shop_id' });
  if (billingError) throw billingError;

  // Never rewrite the original OSS trial dates: a redirect or Checkout does not
  // prove payment and Stripe alone can move paid state to active.
  const { error: settingsError2 } = await admin.from('shop_settings').update({ subscription_status: status })
    .eq('user_id', billing.shop_id).neq('subscription_status', 'lifetime');
  if (settingsError2) throw settingsError2;
}

async function subscriptionIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  const parent = invoice.parent;
  const subscription = parent?.type === 'subscription_details' ? parent.subscription_details?.subscription : null;
  if (typeof subscription === 'string') return subscription;
  if (subscription && typeof subscription === 'object') return subscription.id;
  // Backward-compatible handling for older Invoice API shapes.
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === 'string') return legacy;
  return legacy && typeof legacy === 'object' ? legacy.id : null;
}

export default async (request: Request, _context: Context) => {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing Stripe signature.', { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = await verifyStripeWebhookEvent(getStripe(), rawBody, signature, env('STRIPE_WEBHOOK_SECRET'));
  } catch {
    return new Response('Invalid Stripe signature.', { status: 400 });
  }

  try {
    const stripe = getStripe();
    const admin = getSupabaseAdmin();
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || typeof session.subscription !== 'string') break;
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(admin, subscription);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const snapshot = event.data.object as Stripe.Subscription;
        const current = await stripe.subscriptions.retrieve(snapshot.id);
        await syncSubscription(admin, current);
        break;
      }
      case 'customer.subscription.deleted':
        await syncSubscription(admin, event.data.object as Stripe.Subscription, true);
        break;
      case 'invoice.payment_failed':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = await subscriptionIdFromInvoice(invoice);
        if (subscriptionId) {
          const current = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscription(admin, current);
        }
        break;
      }
      default:
        break;
    }
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    return new Response('Webhook processing failed.', { status: 500 });
  }
};

export const config: Config = { path: '/api/stripe-webhook' };
