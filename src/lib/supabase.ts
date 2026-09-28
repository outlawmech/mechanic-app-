import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wlacgguhevtygqvckoen.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3Bh_pQwFwpSOvCbYyZjxyw_EstlwMfw';

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL;

const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY;

export const ANDROID_APK_DOWNLOAD_URL =
  'https://github.com/outlawmech/mechanic-app-/releases/download/android-apk-latest/OutlawShopSystems-v1.0.apk';

export const isSupabaseConfigured = true;

export const supabase: SupabaseClient = createClient(url, anonKey);

export function requireSupabase(): SupabaseClient {
  return supabase;
}

/** Throws a friendly Error if a Supabase result carries an error. */
export function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Something went wrong';
}
