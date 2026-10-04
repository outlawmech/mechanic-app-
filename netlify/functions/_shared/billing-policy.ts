export type PlanTier = 'solo' | 'shop' | 'dealer';

export const STRIPE_PRICE_IDS: Record<PlanTier, string> = {
  solo: 'price_1UMt4UGwcTEAc1PAJpCWInoM',
  shop: 'price_1UMt4WGwcTEAc1PAqXR4UK8j',
  dealer: 'price_1UMt4YGwcTEAc1PAXAzfW2ng',
};

export function getPriceId(tier: unknown, configured?: Partial<Record<PlanTier, string>>): string {
  if (tier !== 'solo' && tier !== 'shop' && tier !== 'dealer') throw new Error('Unknown organization plan.');
  const id = configured?.[tier] || STRIPE_PRICE_IDS[tier];
  if (!id.startsWith('price_')) throw new Error(`Stripe price for ${tier} is not configured.`);
  return id;
}

export function stripeStatusToOssStatus(status: string): 'active' | 'past_due' | 'canceled' | null {
  if (status === 'active') return 'active';
  if (status === 'past_due' || status === 'unpaid' || status === 'paused') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  // Trialing/incomplete subscriptions never replace or extend the OSS trial.
  return null;
}

export function mayStartCheckout(input: { subscriptionStatus?: string | null; stripeStatus?: string | null }): boolean {
  if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'lifetime') return false;
  if (input.stripeStatus && !['canceled', 'incomplete_expired'].includes(input.stripeStatus)) return false;
  return true;
}

export function subscriptionMatchesPlan(input: { tier: unknown; priceId: string; configured?: Partial<Record<PlanTier, string>> }): boolean {
  try {
    return getPriceId(input.tier, input.configured) === input.priceId;
  } catch {
    return false;
  }
}

export function resolveVerifiedEntitlementUpdate(input: {
  stripeStatus: string;
  deleted?: boolean;
  organizationId: string;
  organizationTier: unknown;
  currentEntitlement: string | null | undefined;
  metadataOrganizationId: string | null | undefined;
  metadataTier: string | null | undefined;
  priceId: string | null | undefined;
  configured?: Partial<Record<PlanTier, string>>;
}): 'active' | 'past_due' | 'canceled' | null {
  if (input.currentEntitlement === 'lifetime') return null;
  if (input.metadataOrganizationId !== input.organizationId || input.metadataTier !== input.organizationTier) return null;
  if (!input.priceId || !subscriptionMatchesPlan({ tier: input.organizationTier, priceId: input.priceId, configured: input.configured })) return null;
  return stripeStatusToOssStatus(input.deleted ? 'canceled' : input.stripeStatus);
}

export function checkoutSessionParams(input: {
  customer: string;
  priceId: string;
  shopId: string;
  tier: PlanTier;
  successUrl: string;
  cancelUrl: string;
}) {
  const metadata = { oss_organization_id: input.shopId, oss_plan_tier: input.tier };
  return {
    mode: 'subscription' as const,
    customer: input.customer,
    line_items: [{ price: input.priceId, quantity: 1 }],
    client_reference_id: input.shopId,
    metadata,
    subscription_data: { metadata },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // No Stripe trial: the OSS trial is separately persisted at signup.
  };
}
