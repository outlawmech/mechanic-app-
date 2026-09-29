import type { User } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';

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
  isDealershipTier: boolean;
}

export function getSubscriptionInfo(
  user: User | null,
  settings?: Partial<ShopSettings> | null
): SubscriptionInfo {
  const isDealershipTier = Boolean(settings?.enable_dealership_mode);
  const planName = isDealershipTier ? 'Dealership & Multi-Tech DMS' : 'Solo Rig Edition';
  const planPrice = isDealershipTier ? '$99/mo' : '$29/mo';
  const planBadge = isDealershipTier ? '🏢 DMS Pro' : '🚛 Solo Pro';

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
    isDealershipTier,
  };
}
