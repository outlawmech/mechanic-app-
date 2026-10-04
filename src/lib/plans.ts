import type { ShopSettings } from '../types';

export type PlanTier = 'solo' | 'shop' | 'dealer';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  price: number;
  includedUsers: number;
  summary: string;
  capabilities: string[];
}

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  solo: {
    tier: 'solo',
    name: 'Solo',
    price: 29,
    includedUsers: 1,
    summary: 'For a one-person mobile or independent operation.',
    capabilities: ['Work orders and invoices', 'Customers, vehicles, parts, and scheduling'],
  },
  shop: {
    tier: 'shop',
    name: 'Shop',
    price: 59,
    includedUsers: 3,
    summary: 'Service, parts, and team operations for a working shop.',
    capabilities: ['Everything in Solo', 'Team access, parts operations, purchasing, and dispatch'],
  },
  dealer: {
    tier: 'dealer',
    name: 'Dealer',
    price: 99,
    includedUsers: 4,
    summary: 'Shop operations plus showroom and unit sales.',
    capabilities: ['Everything in Shop', 'Showroom, sales, and Buyer’s Orders'],
  },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return value === 'solo' || value === 'shop' || value === 'dealer';
}

/** Explicit organization plan wins. The DMS flag remains a safe legacy fallback. */
export function getOrganizationPlan(settings?: Partial<ShopSettings> | null): PlanTier {
  if (isPlanTier(settings?.plan_tier)) return settings.plan_tier;
  return settings?.enable_dealership_mode ? 'dealer' : 'solo';
}

export function hasShopCapabilities(settings?: Partial<ShopSettings> | null): boolean {
  const plan = getOrganizationPlan(settings);
  return plan === 'shop' || plan === 'dealer';
}

export function hasDealerSales(settings?: Partial<ShopSettings> | null): boolean {
  return getOrganizationPlan(settings) === 'dealer';
}
