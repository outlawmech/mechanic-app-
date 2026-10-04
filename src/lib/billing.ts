import { requireSupabase } from './supabase';

const BILLING_API_BASE = (import.meta.env.VITE_OSS_API_BASE_URL as string | undefined)
  || 'https://outlawshopsystems.netlify.app';

export async function startSubscriptionCheckout(): Promise<void> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again before subscribing.');

  const response = await fetch(`${BILLING_API_BASE.replace(/\/$/, '')}/api/create-checkout-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok) throw new Error(result.error || 'We could not start checkout. Please try again.');
  if (!result.url) throw new Error('Checkout did not return a secure payment link.');
  const checkout = new URL(result.url);
  if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com') {
    throw new Error('Checkout returned an unexpected destination.');
  }
  window.location.assign(checkout.toString());
}
