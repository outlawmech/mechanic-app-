import type { Config, Context } from '@netlify/functions';
import Stripe from 'stripe';
import { checkoutSessionParams, getPriceId, mayStartCheckout, type PlanTier } from './_shared/billing-policy.ts';
import { allowedOrigin, corsHeaders, env, getStripe, getSupabaseAdmin } from './_shared/server-clients.ts';

export default async (request: Request, _context: Context) => {
  const cors = corsHeaders(request.headers.get('origin') || undefined);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: cors });

  const origin = request.headers.get('origin') || undefined;
  if (origin && !allowedOrigin(origin)) return Response.json({ error: 'Origin is not allowed.' }, { status: 403, headers: cors });
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Sign in before subscribing.' }, { status: 401, headers: cors });
    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return Response.json({ error: 'Your session could not be verified.' }, { status: 401, headers: cors });
    const user = authData.user;
    const { data: membership, error: memberError } = await admin.from('shop_members')
      .select('shop_id,role').eq('member_id', user.id).maybeSingle();
    if (memberError) throw memberError;
    const shopId = membership?.shop_id || user.id;
    if (shopId !== user.id || (membership && membership.role !== 'owner')) {
      return Response.json({ error: 'Only the organization owner can subscribe.' }, { status: 403, headers: cors });
    }
    const { data: settings, error: settingsError } = await admin.from('shop_settings')
      .select('user_id,shop_name,email,plan_tier,subscription_status,trial_ends_at')
      .eq('user_id', shopId).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) return Response.json({ error: 'Organization settings were not found.' }, { status: 404, headers: cors });
    const tier = settings.plan_tier as PlanTier;
    const { data: billing, error: billingError } = await admin.from('organization_billing')
      .select('stripe_customer_id,stripe_subscription_id,stripe_subscription_status,stripe_checkout_session_id,stripe_checkout_expires_at')
      .eq('shop_id', shopId).maybeSingle();
    if (billingError) throw billingError;

    const stripe = getStripe();
    let stripeStatus = billing?.stripe_subscription_status || null;
    if (billing?.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
        stripeStatus = existing.status;
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
        stripeStatus = null;
      }
    }
    if (!mayStartCheckout({ subscriptionStatus: settings.subscription_status, stripeStatus })) {
      return Response.json({ error: 'This organization already has an active or pending subscription.' }, { status: 409, headers: cors });
    }

    const priorSessionId = billing?.stripe_checkout_session_id;
    if (priorSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(priorSessionId);
        if (existingSession.status === 'open' && existingSession.url && (existingSession.expires_at * 1000 > Date.now())) {
          return Response.json({ url: existingSession.url }, { headers: cors });
        }
        if (existingSession.status === 'complete') {
          return Response.json({ error: 'Checkout is processing. Access will update after Stripe confirms the subscription.' }, { status: 409, headers: cors });
        }
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
      }
    }

    const baseUrl = (env('OSS_PUBLIC_URL', true) || 'https://outlawshopsystems.netlify.app').replace(/\/$/, '');
    const prices = {
      solo: env('STRIPE_PRICE_SOLO', true),
      shop: env('STRIPE_PRICE_SHOP', true),
      dealer: env('STRIPE_PRICE_DEALER', true),
    };
    const priceId = getPriceId(tier, prices);
    let customerId = billing?.stripe_customer_id || undefined;
    let recreateCustomer = false;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if ('deleted' in customer && customer.deleted) {
          recreateCustomer = true;
          customerId = undefined;
        }
      }
      catch (error) {
        if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) throw error;
        customerId = undefined;
        recreateCustomer = true;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: settings.email || user.email || undefined,
        name: settings.shop_name || undefined,
        metadata: { oss_organization_id: shopId, oss_plan_tier: tier },
      }, { idempotencyKey: `oss-customer-${shopId}-${recreateCustomer ? billing?.stripe_customer_id : 'initial'}` });
      customerId = customer.id;
    }

    const { error: saveCustomerError } = await admin.from('organization_billing').upsert({
      shop_id: shopId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id' });
    if (saveCustomerError) throw saveCustomerError;

    const params = checkoutSessionParams({
      customer: customerId,
      priceId,
      shopId,
      tier,
      successUrl: `${baseUrl}/settings?billing=processing`,
      cancelUrl: `${baseUrl}/settings?billing=cancelled`,
    });
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `oss-checkout-${shopId}-${tier}-${Math.floor(Date.now() / 60000)}`,
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL.');
    const { error: saveSessionError } = await admin.from('organization_billing').update({
      stripe_checkout_session_id: session.id,
      stripe_checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('shop_id', shopId);
    if (saveSessionError) throw saveSessionError;
    return Response.json({ url: session.url }, { headers: cors });
  } catch (error) {
    console.error('Could not create subscription Checkout Session:', error);
    return Response.json({ error: 'We could not start checkout. Please try again or contact support.' }, { status: 500, headers: cors });
  }
};

export const config: Config = { path: '/api/create-checkout-session' };
