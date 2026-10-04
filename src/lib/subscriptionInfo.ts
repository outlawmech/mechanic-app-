import type { User } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';
import { getOrganizationPlan, PLAN_DEFINITIONS, type PlanTier } from './plans.ts';

export const TRIAL_DAYS = 14;

export interface SubscriptionInfo {
  status: 'trialing' | 'active' | 'expired';
  isPro: boolean;
  isLocked: boolean;
  daysLeft: number;
  trialEndsAt: Date;
  userCreatedDate: Date;
  planName: string;
  planPrice: string;
  planBadge: string;
  planTier: PlanTier;
  includedUsers: number;
  isDealershipTier: boolean;
}

export function getSubscriptionInfo(
  user: User | null,
  settings?: Partial<ShopSettings> | null
): SubscriptionInfo {
  const planTier = getOrganizationPlan(settings);
  const plan = PLAN_DEFINITIONS[planTier];
  const isDealershipTier = planTier === 'dealer';
  const planName = plan.name;
  const planPrice = `$${plan.price}/mo`;
  const planBadge = `${plan.name} Plan`;

  // Only a server-loaded organization status can grant Pro access.
  const isExplicitPro = settings?.subscription_status === 'active' || settings?.subscription_status === 'lifetime';

  let createdTime = Date.now();
  if (user?.created_at) {
    createdTime = new Date(user.created_at).getTime();
  } else if (settings?.updated_at) {
    createdTime = new Date(settings.updated_at).getTime();
  }

  const trialDurationMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const persistedTrialEnd = settings?.trial_ends_at ? new Date(settings.trial_ends_at).getTime() : NaN;
  const trialEndsTime = Number.isFinite(persistedTrialEnd) ? persistedTrialEnd : createdTime + trialDurationMs;
  const msRemaining = trialEndsTime - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  const trialExpired = msRemaining <= 0;

  if (isExplicitPro) {
    return {
      status: 'active',
      isPro: true,
      isLocked: false,
      daysLeft: 999,
      trialEndsAt: new Date(trialEndsTime),
      userCreatedDate: new Date(createdTime),
      planName,
      planPrice,
      planBadge,
      planTier,
      includedUsers: plan.includedUsers,
      isDealershipTier,
    };
  }

  if (trialExpired) {
    return {
      status: 'expired',
      isPro: false,
      isLocked: true,
      daysLeft: 0,
      trialEndsAt: new Date(trialEndsTime),
      userCreatedDate: new Date(createdTime),
      planName,
      planPrice,
      planBadge,
      planTier,
      includedUsers: plan.includedUsers,
      isDealershipTier,
    };
  }

  return {
    status: 'trialing',
    isPro: false,
    isLocked: false,
    daysLeft,
    trialEndsAt: new Date(trialEndsTime),
    userCreatedDate: new Date(createdTime),
    planName,
    planPrice,
    planBadge,
    planTier,
    includedUsers: plan.includedUsers,
    isDealershipTier,
  };
}
