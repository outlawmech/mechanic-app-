import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

type NetlifyRuntime = { env: { get(name: string): string | undefined } };
const netlifyRuntime = (globalThis as typeof globalThis & { Netlify?: NetlifyRuntime }).Netlify;

export function env(name: string, optional = false): string {
  const value = netlifyRuntime?.env.get(name)?.trim();
  if (!value && !optional) throw new Error(`Missing server configuration: ${name}`);
  return value || '';
}

export function getStripe(): Stripe {
  return new Stripe(env('STRIPE_SECRET_KEY'), {
    apiVersion: '2026-08-26.dahlia',
  });
}

export function getSupabaseAdmin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export function allowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const allowed = new Set([
    env('OSS_PUBLIC_URL', true).replace(/\/$/, '') || 'https://outlawshopsystems.netlify.app',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
  ]);
  return allowed.has(origin) ? origin : null;
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const trustedOrigin = allowedOrigin(origin);
  if (trustedOrigin) headers['Access-Control-Allow-Origin'] = trustedOrigin;
  return headers;
}
