import type { User } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';

export { getSubscriptionInfo, TRIAL_DAYS } from './subscriptionInfo';
export type { SubscriptionInfo } from './subscriptionInfo';

export const STRIPE_PAYMENT_URL = 'https://buy.stripe.com/5kQ6oHgEX8G781ceZ62go00';

export async function redeemActivationCode(
  code: string,
  user: User | null
): Promise<{ success: boolean; message?: string; error?: string; tier?: 'solo' | 'dealer' }> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: 'Please enter an activation code.' };
  }
  if (!user) return { success: false, error: 'Sign in before redeeming a code.' };

  // All activation is resolved by the server against the caller's shop. A
  // browser-local flag or the caller's personal settings row is never a grant.
  try {
    const sb = requireSupabase();
    const { data, error } = await sb.rpc('redeem_activation_code', { p_code: cleanCode });
    if (error) {
      return { success: false, error: error.message };
    }
    if (!data || data.success !== true) {
      return { success: false, error: data?.error || 'Could not redeem code.' };
    }

    const redeemedTier: 'solo' | 'dealer' | undefined = data.tier === 'dealer' || data.tier === 'solo'
      ? data.tier
      : undefined;
    return {
      success: true,
      tier: redeemedTier,
      message: data?.message || 'VIP Code redeemed successfully! Pro access unlocked.',
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error validating activation code.' };
  }
}
