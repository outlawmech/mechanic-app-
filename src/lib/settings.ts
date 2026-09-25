import { useEffect, useState } from 'react';
import { check, requireSupabase } from './supabase';
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
};

const STORAGE_KEY = 'outlaw_shop_settings';

function getLocalSettings(): ShopSettings {
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

export function useShopSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ShopSettings>(() => {
    const local = getLocalSettings();
    if (user?.user_metadata?.shop_name) {
      return { ...local, shop_name: user.user_metadata.shop_name };
    }
    return local;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
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
        if (!cancelled && settingData) {
          const loaded = { ...DEFAULT_SETTINGS, ...settingData };
          setSettings(loaded);
          saveLocalSettings(loaded);
        } else if (!cancelled && user) {
          // If user has metadata shop_name
          const defaultShopName = user.user_metadata?.shop_name || DEFAULT_SETTINGS.shop_name;
          setSettings((prev) => ({ ...prev, shop_name: defaultShopName, email: user.email || prev.email }));
        }
      } catch (err) {
        console.warn('Could not load remote shop settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function updateSettings(newSettings: Partial<ShopSettings>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveLocalSettings(updated);

    try {
      const sb = requireSupabase();
      const targetId = user?.id || 'default';
      check(
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
          updated_at: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.warn('Could not sync settings to remote database, saved locally:', err);
    }
    return updated;
  }

  return { settings, loading, updateSettings };
}
