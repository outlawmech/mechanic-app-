import { useEffect, useState } from 'react';
import { check, isSupabaseConfigured, requireSupabase } from './supabase';
import type { ShopSettings } from '../types';

export const DEFAULT_SETTINGS: ShopSettings = {
  id: 'default',
  shop_name: 'Outlaw Mech',
  tagline: 'Mobile Mechanic & Field Service',
  phone: '406-555-0100',
  email: 'service@outlawmech.com',
  address: 'Helena, MT',
  default_labor_rate: 95,
  default_tax_rate: 0.04,
  invoice_notes: 'Thank you for your business! Payments due on or before the due date.',
  logo_url: '',
};

const STORAGE_KEY = 'outlaw_mech_shop_settings';

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
  const [settings, setSettings] = useState<ShopSettings>(getLocalSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      try {
        const sb = requireSupabase();
        const res = await sb.from('shop_settings').select('*').eq('id', 'default').maybeSingle();
        if (!cancelled && res.data) {
          const loaded = { ...DEFAULT_SETTINGS, ...res.data };
          setSettings(loaded);
          saveLocalSettings(loaded);
        }
      } catch {
        // Table might not exist yet before SQL migration, fallback to local
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateSettings(newSettings: Partial<ShopSettings>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveLocalSettings(updated);

    if (isSupabaseConfigured) {
      try {
        const sb = requireSupabase();
        check(
          await sb.from('shop_settings').upsert({
            id: 'default',
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
    }
    return updated;
  }

  return { settings, loading, updateSettings };
}
