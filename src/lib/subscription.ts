import type { User } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';
import { requireSupabase } from './supabase';
import { saveLocalSettings, DEFAULT_SETTINGS } from './settings';

export const STRIPE_PAYMENT_URL = 'https://buy.stripe.com/5kQ6oHgEX8G781ceZ62go00';
export const TRIAL_DAYS = 14;

export const MASTER_UNLOCK_KEYS = ['OUTLAW-OWNER-KEY', 'OUTLAW-BOSS-77', 'OUTLAW-ADMIN-99'];
export const DMS_BETA_KEYS = ['VIP-DMS', 'DEALER-VIP', 'OUTLAW-DMS-77', 'DMS-PRO', 'VIP-DEALER'];
export const SOLO_BETA_KEYS = ['VIP-RIG', 'SOLO-VIP', 'OUTLAW-SOLO-77', 'SOLO-PRO', 'VIP-SOLO'];

const LOCAL_LICENSE_KEY = 'outlaw_pro_unlocked';
const LOCAL_TIER_KEY = 'outlaw_active_tier'; // 'solo' | 'dealer'

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

export function isLocalUnlocked(): boolean {
  try {
    return localStorage.getItem(LOCAL_LICENSE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLocalUnlocked(unlocked: boolean, tier: 'solo' | 'dealer' = 'solo'): void {
  try {
    if (unlocked) {
      localStorage.setItem(LOCAL_LICENSE_KEY, 'true');
      localStorage.setItem(LOCAL_TIER_KEY, tier);
    } else {
      localStorage.removeItem(LOCAL_LICENSE_KEY);
      localStorage.removeItem(LOCAL_TIER_KEY);
    }
  } catch {}
}

export async function redeemActivationCode(
  code: string,
  user: User | null
): Promise<{ success: boolean; message?: string; error?: string; tier?: 'solo' | 'dealer' }> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter an activation code.' };
  }
  if (!user) return { success: false, error: 'Sign in before redeeming a code.' };

  const isDmsKey = DMS_BETA_KEYS.includes(cleanCode) || MASTER_UNLOCK_KEYS.includes(cleanCode);
  const isMasterKey = MASTER_UNLOCK_KEYS.includes(cleanCode);
  const targetTier: 'solo' | 'dealer' = isDmsKey ? 'dealer' : 'solo';

  async function saveLegacyGrant(dealer: boolean) {
    const sb = requireSupabase();
    const { data, error } = await sb.from('shop_settings')
      .update({ subscription_status: 'active',
        ...(dealer ? { enable_dealership_mode: true } : {}),
        updated_at: new Date().toISOString() })
      .eq('user_id', user!.id).select('user_id');
    if (error || !data?.length) throw new Error(error?.message || 'Could not save this activation to your shop. Try again after signing in.');
    setLocalUnlocked(true, dealer ? 'dealer' : 'solo');
  }

  // 1. Check Master Owner Keys (Unlimited Owner Bypass)
  if (isMasterKey) {
    try {
      await saveLegacyGrant(true);
    } catch (e: any) { return { success: false, error: e.message }; }
    return {
      success: true,
      tier: 'dealer',
      message: 'Master Owner License verified! Full Dealership DMS Suite permanently unlocked.',
    };
  }

  // 2. Check DMS Beta Keys
  if (DMS_BETA_KEYS.includes(cleanCode)) {
    try {
      await saveLegacyGrant(true);
    } catch (e: any) { return { success: false, error: e.message }; }
    return {
      success: true,
      tier: 'dealer',
      message: 'Dealership DMS VIP Code activated! All 6 departments & floorplan tracking unlocked.',
    };
  }

  // 3. Check Solo Rig Beta Keys
  if (SOLO_BETA_KEYS.includes(cleanCode)) {
    try {
      await saveLegacyGrant(false);
    } catch (e: any) { return { success: false, error: e.message }; }
    return {
      success: true,
      tier: 'solo',
      message: 'Solo Rig VIP Code activated! Mobile mechanic suite unlocked.',
    };
  }

  // 4. Call Supabase Limited Redemptions RPC (if custom database code)
  try {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc('redeem_activation_code', { p_code: cleanCode });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data && data.success === false) {
      return { success: false, error: data.error || 'Could not redeem code.' };
    }

    const redeemedTier: 'solo' | 'dealer' = data?.tier === 'dealer' ? 'dealer' : targetTier;
    setLocalUnlocked(true, redeemedTier);
    return {
      success: true,
      tier: redeemedTier,
      message: data?.message || 'VIP Code redeemed successfully! Pro access unlocked.',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error validating activation code.' };
  }
}

export function getSubscriptionInfo(
  user: User | null,
  settings?: Partial<ShopSettings> | null
): SubscriptionInfo {
  const isDealershipTier = Boolean(settings?.enable_dealership_mode);
  const planName = isDealershipTier ? 'Dealership & Multi-Tech DMS' : 'Solo Rig Edition';
  const planPrice = isDealershipTier ? '$99/mo' : '$29/mo';
  const planBadge = isDealershipTier ? '🏢 DMS Pro' : '🚛 Solo Pro';

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
