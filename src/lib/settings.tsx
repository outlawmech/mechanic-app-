import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { requireSupabase } from './supabase';
import { useAuth } from './auth';
import type { ShopSettings } from '../types';

export const DEFAULT_SETTINGS: ShopSettings = {
  id: 'default',
  shop_name: 'Outlaw Shop Systems',
  tagline: 'Mobile & Shop Management',
  phone: '406-555-0100',
  email: 'service@outlawshopsystems.com',
  address: 'Helena, MT',
  default_labor_rate: 95,
  internal_labor_cost_rate: 0,
  default_tax_rate: 0,
  invoice_notes: 'Thank you for your business! Payments due on or before the due date.',
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
    localStorage.setItem(TIER_KEY, s.enable_dealership_mode ? 'dealer' : 'solo');
  } catch {}
}

interface ShopSettingsContextType {
  settings: ShopSettings;
  shopId: string | null;
  memberRole: 'owner' | 'staff';
  memberName: string;
  loading: boolean;
  updateSettings: (newSettings: Partial<ShopSettings>) => Promise<ShopSettings>;
  reloadSettings: () => Promise<void>;
}

const ShopSettingsContext = createContext<ShopSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  shopId: null,
  memberRole: 'owner',
  memberName: '',
  loading: false,
  updateSettings: async (s) => ({ ...DEFAULT_SETTINGS, ...s }),
  reloadSettings: async () => {},
});

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ShopSettings>(() => {
    return getLocalSettings(user?.id);
  });
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
      return;
    }

    const userLocal = getLocalSettings(user.id);
    const userMetaShopName = user.user_metadata?.shop_name;

    setSettings({
      ...userLocal,
      shop_name: userMetaShopName || userLocal.shop_name || DEFAULT_SETTINGS.shop_name,
      enable_dealership_mode: userLocal.enable_dealership_mode,
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
    try {
      const sb = requireSupabase();
      const { data: membership, error: memberError } = await sb.from('shop_members')
        .select('shop_id, role, display_name').eq('member_id', user.id).maybeSingle();
      if (memberError && !['42P01', 'PGRST205'].includes(memberError.code)) throw memberError;
      const ownerId = membership?.shop_id || user.id;
      setShopId(ownerId);
      setMemberRole(membership?.role === 'staff' ? 'staff' : 'owner');
      setMemberName(membership?.display_name || user.email?.split('@')[0] || 'Shop owner');
      const res = await sb
        .from('shop_settings')
        .select('*')
        .eq('user_id', ownerId)
        .limit(1);

      const settingData = res.data && res.data[0] ? res.data[0] : null;

      if (settingData) {
        const loaded: ShopSettings = {
          ...DEFAULT_SETTINGS,
          ...settingData,
          enable_dealership_mode: Boolean(settingData.enable_dealership_mode),
        };
        setSettings(loaded);
        saveLocalSettings(loaded, user.id);
      } else {
        if (ownerId !== user.id) throw new Error('Your shop settings could not be loaded.');
        const defaultShopName = user.user_metadata?.shop_name || DEFAULT_SETTINGS.shop_name;
        const isDealer = false;
        const initial: ShopSettings = {
          ...DEFAULT_SETTINGS,
          shop_name: defaultShopName,
          tagline: isDealer ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
          enable_dealership_mode: isDealer,
          email: user.email || DEFAULT_SETTINGS.email,
        };
        setSettings(initial);
        saveLocalSettings(initial, user.id);

        // Auto-create initial row in Supabase scoped to this user
        try {
          await sb.from('shop_settings').upsert({
            id: user.id,
            user_id: user.id,
            shop_name: defaultShopName,
            tagline: isDealer ? 'Sales, Service & Parts DMS' : 'Mobile & Shop Management',
            email: user.email || '',
            enable_dealership_mode: isDealer,
            default_labor_rate: 95.0,
            default_tax_rate: 0,
            dealership_doc_fee: 199,
            dealership_prep_fee: 250,
            dealership_freight_fee: 350,
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Initial shop settings upsert failed:', e);
        }
      }
    } catch (err) {
      console.warn('Could not load remote shop settings:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettings(newSettings: Partial<ShopSettings>): Promise<ShopSettings> {
    if (memberRole === 'staff') throw new Error('Only the shop owner can change shop settings.');
    if (!user) throw new Error('Sign in before saving shop settings.');
    const updated: ShopSettings = { ...settings, ...newSettings, updated_at: new Date().toISOString() };
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
