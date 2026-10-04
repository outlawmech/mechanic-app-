import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';
import { setOfflineQueueOwner } from './offlineSync';
import type { PlanTier } from './plans';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
  signIn: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    pass: string,
    shopName?: string,
    planTier?: PlanTier
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  passwordRecovery: false,
  finishPasswordRecovery: () => {},
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(() => window.location.hash.includes('type=recovery'));

  useEffect(() => {
    const sb = requireSupabase();

    sb.auth.getSession().then(({ data: { session: s } }) => {
      setOfflineQueueOwner(s?.user.id ?? null);
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setOfflineQueueOwner(s?.user.id ?? null);
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
    planTier: PlanTier = 'solo'
  ) {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        emailRedirectTo: 'https://outlawshopsystems.netlify.app/',
        data: {
          shop_name: shopName?.trim() || 'Outlaw Shop Systems',
          plan_tier: planTier,
          enable_dealership_mode: planTier !== 'solo',
        },
      },
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    // Organization settings and its trial are provisioned atomically by the
    // auth.users database trigger, including when email confirmation is required.
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
      // Cached detail views contain customer and financial data too. Clear every
      // offline snapshot before another account can sign in on this device.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('outlaw_cache_')) localStorage.removeItem(key);
      }
    } catch {}
    // Ordinary logout should revoke only this device's session.
    await sb.auth.signOut({ scope: 'local' });
    setOfflineQueueOwner(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, passwordRecovery,
      finishPasswordRecovery: () => setPasswordRecovery(false), signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
