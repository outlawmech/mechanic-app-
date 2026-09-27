import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    pass: string,
    shopName?: string,
    enableDealershipMode?: boolean
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = requireSupabase();

    sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, pass: string) {
    const sb = requireSupabase();
    const { error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    return { error: error ? new Error(error.message) : null };
  }

  async function signUp(
    email: string,
    pass: string,
    shopName?: string,
    enableDealershipMode: boolean = false
  ) {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        data: {
          shop_name: shopName?.trim() || 'Outlaw Shop Systems',
          enable_dealership_mode: Boolean(enableDealershipMode),
        },
      },
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    // If session is immediately available (email confirmation disabled in Supabase), create initial settings
    if (data.session && data.user) {
      try {
        await sb.from('shop_settings').upsert({
          id: data.user.id,
          user_id: data.user.id,
          shop_name: shopName?.trim() || 'Outlaw Shop Systems',
          tagline: enableDealershipMode ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
          phone: '',
          email: data.user.email || '',
          address: '',
          default_labor_rate: 95.0,
          default_tax_rate: 0.04,
          invoice_notes: 'Thank you for your business! Payments due on or before the due date.',
          logo_url: '',
          enable_dealership_mode: Boolean(enableDealershipMode),
          dealership_doc_fee: 199,
          dealership_prep_fee: 250,
          dealership_freight_fee: 350,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('Could not auto-create initial shop settings:', e);
      }
    }

    return {
      error: null,
      needsEmailConfirmation: !data.session,
    };
  }

  async function signOut() {
    const sb = requireSupabase();
    try {
      localStorage.removeItem('outlaw_shop_settings');
      localStorage.removeItem('outlaw_active_tier');
      localStorage.removeItem('outlaw_cache_customers');
      localStorage.removeItem('outlaw_cache_parts');
      localStorage.removeItem('outlaw_cache_work_orders');
      localStorage.removeItem('outlaw_cache_invoices');
      localStorage.removeItem('outlaw_cache_special_orders');
    } catch {}
    await sb.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
