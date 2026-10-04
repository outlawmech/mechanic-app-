import type Stripe from 'stripe';

export async function verifyStripeWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);
}
