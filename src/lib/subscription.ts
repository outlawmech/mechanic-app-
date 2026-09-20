import type { User } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';

export const STRIPE_PAYMENT_URL = 'https://buy.stripe.com/5kQ6oHgEX8G781ceZ62go00';
export const TRIAL_DAYS = 14;
export const MASTER_UNLOCK_KEYS = ['OUTLAW-PRO-2026', 'OUTLAW29', 'VIP-RIG', 'OUTLAW-MASTER'];

const LOCAL_LICENSE_KEY = 'outlaw_pro_unlocked';

export interface SubscriptionInfo {
  status: 'trialing' | 'active' | 'expired';
  isPro: boolean;
  isLocked: boolean;
  daysLeft: number;
  trialEndsAt: Date;
  userCreatedDate: Date;
}

export function isLocalUnlocked(): boolean {
  try {
    return localStorage.getItem(LOCAL_LICENSE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLocalUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) {
      localStorage.setItem(LOCAL_LICENSE_KEY, 'true');
    } else {
      localStorage.removeItem(LOCAL_LICENSE_KEY);
    }
  } catch {}
}

export function unlockWithCode(code: string): boolean {
  const cleanCode = code.trim().toUpperCase();
  if (MASTER_UNLOCK_KEYS.includes(cleanCode)) {
    setLocalUnlocked(true);
    return true;
  }
  return false;
}

export function getSubscriptionInfo(
  user: User | null,
  settings?: Partial<ShopSettings> | null
): SubscriptionInfo {
  // Check if explicitly marked active/lifetime in database or local license
  const isExplicitPro =
    settings?.subscription_status === 'active' ||
    settings?.subscription_status === 'lifetime' ||
    isLocalUnlocked() ||
    (user?.email && user.email.toLowerCase().includes('outlawmech'));

  // Calculate creation timestamp
  let createdTime = Date.now();
  if (user?.created_at) {
    createdTime = new Date(user.created_at).getTime();
  } else if (settings?.updated_at) {
    createdTime = new Date(settings.updated_at).getTime();
  }

  const trialDurationMs = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const trialEndsTime = createdTime + trialDurationMs;
  const now = Date.now();
  const msRemaining = trialEndsTime - now;
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
    };
  }

  return {
    status: 'trialing',
    isPro: false,
    isLocked: false,
    daysLeft,
    trialEndsAt: new Date(trialEndsTime),
    userCreatedDate: new Date(createdTime),
  };
}
