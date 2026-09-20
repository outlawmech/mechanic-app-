import type { User } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';
import { requireSupabase } from './supabase';

export const STRIPE_PAYMENT_URL = 'https://buy.stripe.com/5kQ6oHgEX8G781ceZ62go00';
export const TRIAL_DAYS = 14;
export const MASTER_UNLOCK_KEYS = ['OUTLAW-OWNER-KEY', 'OUTLAW-BOSS-77', 'OUTLAW-ADMIN-99'];

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

export async function redeemActivationCode(
  code: string,
  user: User | null
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter an activation code.' };
  }

  // 1. Check Master Owner Keys (Unlimited Owner Bypass)
  if (MASTER_UNLOCK_KEYS.includes(cleanCode)) {
    setLocalUnlocked(true);
    try {
      if (user) {
        const sb = requireSupabase();
        await sb
          .from('shop_settings')
          .update({ subscription_status: 'active', updated_at: new Date().toISOString() })
          .or(`user_id.eq.${user.id},id.eq.${user.id}`);
      }
    } catch {}
    return { success: true, message: 'Master license key verified! Pro access permanently unlocked.' };
  }

  // 2. Call Supabase Limited Redemptions RPC
  try {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc('redeem_activation_code', { p_code: cleanCode });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data && data.success === false) {
      return { success: false, error: data.error || 'Could not redeem code.' };
    }

    setLocalUnlocked(true);
    return {
      success: true,
      message: data?.message || 'VIP Beta Code redeemed successfully! Pro access unlocked.',
    };
  } catch (err: any) {
    // Fallback if RPC is not yet created in Supabase
    if (cleanCode === 'VIP-RIG') {
      setLocalUnlocked(true);
      return { success: true, message: 'VIP code activated successfully!' };
    }
    return { success: false, error: err.message || 'Error validating activation code.' };
  }
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
