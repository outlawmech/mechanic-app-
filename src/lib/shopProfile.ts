import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShopSettings } from '../types';

// Profile saves update an existing organization; onboarding and entitlements
// remain server-managed and are never included in this write payload.
export async function saveShopProfile(client: SupabaseClient, shopId: string | null, updated: ShopSettings): Promise<void> {
  if (!shopId) throw new Error('This shop could not be verified. Reload Settings before saving.');
  const { data, error } = await client.from('shop_settings').update({
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
  }).eq('user_id', shopId).select('user_id').single();
  if (error || !data) throw new Error(error?.message || 'Shop settings were not saved. Please retry.');
}
