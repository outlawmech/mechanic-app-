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
  default_tax_rate: 0.04,
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

const STORAGE_KEY = 'outlaw_shop_settings';

export function getLocalSettings(): ShopSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveLocalSettings(s: ShopSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

interface ShopSettingsContextType {
  settings: ShopSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<ShopSettings>) => Promise<ShopSettings>;
  reloadSettings: () => Promise<void>;
}

const ShopSettingsContext = createContext<ShopSettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: false,
  updateSettings: async (s) => ({ ...DEFAULT_SETTINGS, ...s }),
  reloadSettings: async () => {},
});

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ShopSettings>(() => {
    const local = getLocalSettings();
    if (user?.user_metadata) {
      return {
        ...local,
        shop_name: user.user_metadata.shop_name || local.shop_name,
        enable_dealership_mode:
          typeof user.user_metadata.enable_dealership_mode === 'boolean'
            ? user.user_metadata.enable_dealership_mode
            : local.enable_dealership_mode,
      };
    }
    return local;
  });
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const sb = requireSupabase();
      let query = sb.from('shop_settings').select('*');
      if (user) {
        query = query.or(`user_id.eq.${user.id},id.eq.${user.id}`);
      } else {
        query = query.eq('id', 'default');
      }

      const res = await query.limit(1);
      const settingData = res.data && res.data[0] ? res.data[0] : null;
      if (settingData) {
        const loaded: ShopSettings = {
          ...DEFAULT_SETTINGS,
          ...settingData,
          enable_dealership_mode: Boolean(
            settingData.enable_dealership_mode ?? user?.user_metadata?.enable_dealership_mode
          ),
        };
        setSettings(loaded);
        saveLocalSettings(loaded);
      } else if (user) {
        const defaultShopName = user.user_metadata?.shop_name || DEFAULT_SETTINGS.shop_name;
        const isDealer = Boolean(user.user_metadata?.enable_dealership_mode);
        const initial: ShopSettings = {
          ...DEFAULT_SETTINGS,
          shop_name: defaultShopName,
          enable_dealership_mode: isDealer,
          email: user.email || DEFAULT_SETTINGS.email,
        };
        setSettings(initial);
        saveLocalSettings(initial);
      }
    } catch (err) {
      console.warn('Could not load remote shop settings:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.id]);

  async function updateSettings(newSettings: Partial<ShopSettings>): Promise<ShopSettings> {
    const updated: ShopSettings = { ...settings, ...newSettings };
    setSettings(updated);
    saveLocalSettings(updated);

    try {
      const sb = requireSupabase();
      const targetId = user?.id || 'default';
      await sb.from('shop_settings').upsert({
        id: targetId,
        user_id: user?.id || null,
        shop_name: updated.shop_name,
        tagline: updated.tagline,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        default_labor_rate: Number(updated.default_labor_rate) || 0,
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
      });
    } catch (err) {
      console.warn('Could not sync settings to remote database, saved locally:', err);
    }
    return updated;
  }

  return (
    <ShopSettingsContext.Provider
      value={{
        settings,
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
