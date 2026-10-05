import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { requireSupabase } from './supabase';
import { useAuth } from './auth';
import type { ShopSettings } from '../types';
import { getOrganizationPlan, isPlanTier } from './plans.ts';

export const DEFAULT_SETTINGS: ShopSettings = {
  id: 'default',
  shop_name: 'Outlaw Shop Systems',
  tagline: 'Mobile & Shop Management',
  phone: '406-555-0100',
  email: 'outlawshopsystems@gmail.com',
  address: 'Helena, MT',
  default_labor_rate: 95,
  internal_labor_cost_rate: 0,
  default_tax_rate: 0,
  invoice_notes: 'Thank you for your business! Payments due on or before the due date.',
  sales_disclaimer: '',
  logo_url: '',
  zelle_info: '',
  venmo_handle: '',
  cash_app_tag: '',
  custom_pay_link: '',
  enable_dealership_mode: false,
  dealership_doc_fee: 199,
  dealership_prep_fee: 250,
  dealership_freight_fee: 350,
};

const BASE_STORAGE_KEY = 'outlaw_shop_settings';
const TIER_KEY = 'outlaw_active_tier';

export function getUserSettingsKey(userId?: string | null): string {
  return userId ? `${BASE_STORAGE_KEY}_${userId}` : BASE_STORAGE_KEY;
}

export function getLocalSettings(userId?: string | null): ShopSettings {
  try {
    const key = getUserSettingsKey(userId);
    const raw = localStorage.getItem(key);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveLocalSettings(s: ShopSettings, userId?: string | null): void {
  try {
    const key = getUserSettingsKey(userId);
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem(TIER_KEY, getOrganizationPlan(s));
  } catch {}
}

interface ShopSettingsContextType {
  settings: ShopSettings;
  shopId: string | null;
  memberRole: 'owner' | 'staff';
  memberName: string;
  loading: boolean;
  loadedUserId: string | null;
  settingsError: string | null;
  updateSettings: (newSettings: Partial<ShopSettings>) => Promise<ShopSettings>;
  reloadSettings: () => Promise<void>;
}

interface ShopEntitlement {
  shop_id: string;
  member_role: 'owner' | 'staff';
  member_name: string | null;
  subscription_status: ShopSettings['subscription_status'] | null;
  plan_tier: ShopSettings['plan_tier'] | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  enable_dealership_mode: boolean;
}

const ShopSettingsContext = createContext<ShopSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  shopId: null,
  memberRole: 'owner',
  memberName: '',
  loading: false,
  loadedUserId: null,
  settingsError: null,
  updateSettings: async (s) => ({ ...DEFAULT_SETTINGS, ...s }),
  reloadSettings: async () => {},
});

function getCachedProfileSettings(userId?: string | null): ShopSettings {
  const cached = getLocalSettings(userId);
  // Local storage restores profile preferences only, never shop entitlements.
  return { ...cached, subscription_status: undefined, plan_tier: undefined, trial_started_at: null, trial_ends_at: null, enable_dealership_mode: false };
}

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ShopSettings>(() => {
    return getCachedProfileSettings(user?.id);
  });
  const [loading, setLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<'owner' | 'staff'>('owner');
  const [memberName, setMemberName] = useState('');

  // When active user account changes, immediately switch to that user's scoped settings
  useEffect(() => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setShopId(null);
      setMemberRole('owner');
      setMemberName('');
      setSettingsError(null);
      setLoadedUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSettingsError(null);
    const userLocal = getCachedProfileSettings(user.id);
    const userMetaShopName = user.user_metadata?.shop_name;

    setSettings({
      ...userLocal,
      shop_name: userMetaShopName || userLocal.shop_name || DEFAULT_SETTINGS.shop_name,
      enable_dealership_mode: false,
    });

    load();
  }, [user?.id]);

  async function load() {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSettingsError(null);
    try {
      const sb = requireSupabase();
      const { data: rawEntitlement, error: entitlementError } = await sb.rpc('get_shop_entitlement').maybeSingle();
      if (entitlementError) throw entitlementError;
      const entitlement = rawEntitlement as ShopEntitlement | null;
      if (!entitlement?.shop_id) throw new Error('The server did not return this login’s shop.');
      const ownerId = entitlement.shop_id;
      setShopId(ownerId);
      setMemberRole(entitlement.member_role === 'staff' ? 'staff' : 'owner');
      setMemberName(entitlement.member_name || user.email?.split('@')[0] || 'Shop owner');
      const { data: settingData, error: settingsReadError } = await sb
        .from('shop_settings')
        .select('*')
        .eq('user_id', ownerId)
        .maybeSingle();
      if (settingsReadError) throw settingsReadError;

      if (settingData) {
        const loaded: ShopSettings = {
          ...DEFAULT_SETTINGS,
          ...settingData,
          subscription_status: entitlement.subscription_status ?? settingData.subscription_status,
          plan_tier: entitlement.plan_tier ?? settingData.plan_tier ?? (settingData.enable_dealership_mode ? 'dealer' : 'solo'),
          trial_started_at: entitlement.trial_started_at ?? settingData.trial_started_at ?? null,
          trial_ends_at: entitlement.trial_ends_at ?? settingData.trial_ends_at ?? null,
          enable_dealership_mode: Boolean(entitlement.enable_dealership_mode ?? settingData.enable_dealership_mode ?? getOrganizationPlan(settingData) !== 'solo'),
        };
        setSettings(loaded);
        saveLocalSettings(loaded, user.id);
      } else {
        if (entitlement.member_role === 'staff' || ownerId !== user.id) {
          throw new Error('This shop does not have a settings record.');
        }
        const defaultShopName = user.user_metadata?.shop_name || DEFAULT_SETTINGS.shop_name;
        const requestedTier = user.user_metadata?.plan_tier;
        const planTier = isPlanTier(requestedTier)
          ? requestedTier
          : user.user_metadata?.enable_dealership_mode ? 'dealer' : 'solo';
        const createdAt = user.created_at || new Date().toISOString();
        const trialEndsAt = new Date(new Date(createdAt).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const isShopMode = planTier !== 'solo';
        const initial: ShopSettings = {
          ...DEFAULT_SETTINGS,
          shop_name: defaultShopName,
          tagline: planTier === 'dealer' ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
          enable_dealership_mode: isShopMode,
          plan_tier: planTier,
          trial_started_at: createdAt,
          trial_ends_at: trialEndsAt,
          subscription_status: 'trialing',
          email: user.email || DEFAULT_SETTINGS.email,
        };
        setSettings(initial);
        saveLocalSettings(initial, user.id);

        // Auto-create initial row in Supabase scoped to this user
        const { error: createSettingsError } = await sb.from('shop_settings').upsert({
            id: user.id,
            user_id: user.id,
            shop_name: defaultShopName,
            tagline: planTier === 'dealer' ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
            email: user.email || '',
            enable_dealership_mode: isShopMode,
            plan_tier: planTier,
            subscription_status: 'trialing',
            trial_started_at: createdAt,
            trial_ends_at: trialEndsAt,
            default_labor_rate: 95.0,
            default_tax_rate: 0,
            dealership_doc_fee: 199,
            dealership_prep_fee: 250,
            dealership_freight_fee: 350,
            updated_at: new Date().toISOString(),
          });
        if (createSettingsError) throw createSettingsError;
      }
    } catch (err) {
      console.warn('Could not load remote shop settings:', err);
      setSettingsError('We could not verify this shop’s access. Check your connection and try again.');
      setSettings(getCachedProfileSettings(user.id));
    } finally {
      setLoadedUserId(user.id);
      setLoading(false);
    }
  }

  async function updateSettings(newSettings: Partial<ShopSettings>): Promise<ShopSettings> {
    if (memberRole === 'staff') throw new Error('Only the shop owner can change shop settings.');
    if (!user) throw new Error('Sign in before saving shop settings.');
    const updated: ShopSettings = {
      ...settings,
      ...newSettings,
      // Organization plan and trial are server entitlements, not editable profile fields.
      plan_tier: settings.plan_tier,
      subscription_status: settings.subscription_status,
      trial_started_at: settings.trial_started_at,
      trial_ends_at: settings.trial_ends_at,
      updated_at: new Date().toISOString(),
    };
      const sb = requireSupabase();
      const targetId = user.id;
      const { data, error } = await sb.from('shop_settings').upsert({
        id: targetId,
        user_id: user.id,
        shop_name: updated.shop_name,
        tagline: updated.tagline,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        default_labor_rate: Number(updated.default_labor_rate) || 0,
        internal_labor_cost_rate: Number(updated.internal_labor_cost_rate) || 0,
        default_tax_rate: Number(updated.default_tax_rate) || 0,
        invoice_notes: updated.invoice_notes,
        sales_disclaimer: updated.sales_disclaimer ?? '',
        logo_url: updated.logo_url || '',
        zelle_info: updated.zelle_info || '',
        venmo_handle: updated.venmo_handle || '',
        cash_app_tag: updated.cash_app_tag || '',
        custom_pay_link: updated.custom_pay_link || '',
        enable_dealership_mode: Boolean(updated.enable_dealership_mode),
        dealership_doc_fee: Number(updated.dealership_doc_fee) || 0,
        dealership_prep_fee: Number(updated.dealership_prep_fee) || 0,
        dealership_freight_fee: Number(updated.dealership_freight_fee) || 0,
        updated_at: new Date().toISOString(),
      }).select('user_id').single();
      if (error || !data) throw new Error(error?.message || 'Shop settings were not saved. Please retry.');
      setSettings(updated);
      saveLocalSettings(updated, user.id);

      // Synchronize metadata in user auth record so subsequent logins retain the chosen mode
      const { error: metaError } = await sb.auth.updateUser({
          data: {
            shop_name: updated.shop_name,
          },
        });
      if (metaError) console.warn('Could not sync shop name to login metadata:', metaError);
    return updated;
  }

  return (
    <ShopSettingsContext.Provider
      value={{
        settings,
        shopId,
        memberRole,
        memberName,
        loading,
        loadedUserId,
        settingsError,
        updateSettings,
        reloadSettings: load,
      }}
    >
      {children}
    </ShopSettingsContext.Provider>
  );
}

export function useShopSettings() {
  return useContext(ShopSettingsContext);
}
