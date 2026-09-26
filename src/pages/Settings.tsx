import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import { WrenchIcon, TrashIcon, CheckIcon, PlusIcon, LockClosedIcon, SparklesIcon, MonitorIcon, SmartphoneIcon } from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Spinner, Textarea } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useShopSettings } from '../lib/settings';
import { processLogoImage } from '../lib/image';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { getSubscriptionInfo, STRIPE_PAYMENT_URL, redeemActivationCode } from '../lib/subscription';

import { ANDROID_APK_DOWNLOAD_URL } from '../lib/supabase';
import { isNativePlatform } from '../lib/printer';

export default function Settings() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, signOut } = useAuth();
  const { settings, loading, updateSettings } = useShopSettings();

  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [licenseCode, setLicenseCode] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [validatingKey, setValidatingKey] = useState(false);

  // Sync state if initial fetch completes
  const [synced, setSynced] = useState(false);
  if (!loading && !synced) {
    setForm(settings);
    setSynced(true);
  }

  if (loading) return <Spinner />;

  const sub = getSubscriptionInfo(user, settings);

  async function handleUnlockKey() {
    if (!licenseCode.trim()) {
      toast('Please enter an activation code', 'error');
      return;
    }
    setValidatingKey(true);
    try {
      const res = await redeemActivationCode(licenseCode, user);
      if (res.success) {
        toast(res.message || 'Pro Plan unlocked successfully!');
        window.location.reload();
      } else {
        toast(res.error || 'Invalid or expired code.', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Error validating activation code', 'error');
    } finally {
      setValidatingKey(false);
    }
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingImage(true);
    try {
      const dataUrl = await processLogoImage(file);
      setForm((prev) => ({ ...prev, logo_url: dataUrl }));
      toast('Logo uploaded! Click "Save Shop Profile" to keep changes.');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleRemoveLogo() {
    setForm((prev) => ({ ...prev, logo_url: '' }));
    toast('Logo removed');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.shop_name.trim()) {
      toast('Shop name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateSettings(form);
      toast('Shop settings saved successfully!');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleWipeDemoData() {
    if (
      !window.confirm(
        'Are you sure you want to remove the sample/demo customers and work orders (Dale, Priya, Marcus)? Any real customers you added will stay safe.'
      )
    ) {
      return;
    }

    setWiping(true);
    try {
      const sb = requireSupabase();
      check(
        await sb
          .from('customers')
          .delete()
          .in('id', [
            'a0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000002',
            'a0000000-0000-4000-8000-000000000003',
          ])
      );
      toast('Demo data wiped! Your workspace is now clean.');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Shop Settings"
        sub="Manage your business info, labor rates, and invoice branding."
      />

      {/* User Account Bar */}
      {user && (
        <Card className="flex items-center justify-between p-3.5 bg-slate-900 text-white">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-amber-400 uppercase tracking-wide">
              Signed in account
            </p>
            <p className="text-xs font-semibold truncate text-slate-200">{user.email}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={signOut}
            className="text-xs text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            Sign Out
          </Button>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Shop Logo Section */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Shop Logo
            </h3>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            {form.logo_url ? (
              <div className="flex flex-col items-center gap-3">
                <div className="max-h-24 max-w-full rounded-lg bg-white p-2 shadow-sm ring-1 ring-slate-900/5">
                  <img
                    src={form.logo_url}
                    alt="Shop logo preview"
                    className="max-h-20 max-w-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace Image
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={handleRemoveLogo}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs font-medium text-slate-700">No logo uploaded yet</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  PNG, JPG, or WEBP. Prints at the top of every invoice.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 text-xs"
                  disabled={processingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PlusIcon className="h-4 w-4" />
                  {processingImage ? 'Processing image…' : 'Choose Logo Image'}
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>
        </Card>

        {/* Business Profile */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <WrenchIcon className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Business Profile &amp; Branding
            </h3>
          </div>

          <Field label="Business / Shop Name *">
            <Input
              value={form.shop_name}
              onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
              placeholder="e.g. Outlaw Shop Systems"
            />
          </Field>

          <Field label="Tagline / Specialty">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="e.g. Mobile & Shop Management"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 406-555-0100"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. service@mybusiness.com"
              />
            </Field>
          </div>

          <Field label="Address / Service Region">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. Helena, MT & Surrounding Areas"
            />
          </Field>
        </Card>

        {/* Rates & Invoicing Defaults */}
        <Card className="space-y-3 p-4">
          <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
            Rates &amp; Invoicing Defaults
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Standard Labor Rate ($/hr)">
              <Input
                type="number"
                min="0"
                step="5"
                value={form.default_labor_rate}
                onChange={(e) => setForm({ ...form, default_labor_rate: e.target.value })}
                placeholder="95.00"
              />
            </Field>
            <Field label="Default Sales Tax (%)">
              <Input
                type="number"
                min="0"
                max="30"
                step="0.01"
                value={(Number(form.default_tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}
                onChange={(e) =>
                  setForm({ ...form, default_tax_rate: (Number(e.target.value) || 0) / 100 })
                }
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Invoice Footer Terms &amp; Notes">
            <Textarea
              value={form.invoice_notes}
              onChange={(e) => setForm({ ...form, invoice_notes: e.target.value })}
              placeholder="Thank you for your business! Payments due upon receipt."
            />
          </Field>
        </Card>

        {/* Payment Methods & Digital Handles */}
        <Card className="space-y-3 p-4">
          <div className="border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Customer Payment Methods &amp; Links
            </h3>
            <p className="text-[11px] text-slate-500">
              Add your payment handles to automatically show direct payment options on customer invoices and text receipts.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Zelle (Phone or Email)">
              <Input
                value={form.zelle_info || ''}
                onChange={(e) => setForm({ ...form, zelle_info: e.target.value })}
                placeholder="e.g. 406-555-0100 / pay@myshop.com"
              />
            </Field>

            <Field label="Venmo Username">
              <Input
                value={form.venmo_handle || ''}
                onChange={(e) => setForm({ ...form, venmo_handle: e.target.value })}
                placeholder="e.g. @OutlawRig"
              />
            </Field>

            <Field label="Cash App Cashtag">
              <Input
                value={form.cash_app_tag || ''}
                onChange={(e) => setForm({ ...form, cash_app_tag: e.target.value })}
                placeholder="e.g. $OutlawMech"
              />
            </Field>

            <Field label="Square / Stripe Payment Link">
              <Input
                value={form.custom_pay_link || ''}
                onChange={(e) => setForm({ ...form, custom_pay_link: e.target.value })}
                placeholder="e.g. https://square.link/u/... or Stripe URL"
              />
            </Field>
          </div>
        </Card>

        {/* Powersports Dealership & Unit Sales Settings */}
        <Card className="space-y-3 p-4 bg-purple-50/40 border-purple-200">
          <div className="flex items-center justify-between border-b border-purple-200/80 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-purple-950">
                Powersports Dealership &amp; Unit Sales Defaults
              </h3>
              <p className="text-[11px] text-purple-900/80">
                Configure default fees for showroom sales, buyer's orders, and bill of sale calculations.
              </p>
            </div>
            <span className="rounded-full bg-purple-200 px-2.5 py-0.5 text-[10px] font-bold text-purple-950">
              Dealership DMS
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
            <Field label="Default Freight / Destination ($)">
              <Input
                type="number"
                step="0.01"
                value={form.dealership_freight_fee ?? '350'}
                onChange={(e) => setForm({ ...form, dealership_freight_fee: e.target.value })}
                placeholder="350.00"
              />
            </Field>

            <Field label="Default Dealer Prep / PDI ($)">
              <Input
                type="number"
                step="0.01"
                value={form.dealership_prep_fee ?? '250'}
                onChange={(e) => setForm({ ...form, dealership_prep_fee: e.target.value })}
                placeholder="250.00"
              />
            </Field>

            <Field label="Default Documentation Fee ($)">
              <Input
                type="number"
                step="0.01"
                value={form.dealership_doc_fee ?? '199'}
                onChange={(e) => setForm({ ...form, dealership_doc_fee: e.target.value })}
                placeholder="199.00"
              />
            </Field>
          </div>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full">
          {saving ? 'Saving changes…' : 'Save Shop Profile'}
        </Button>
      </form>

      {/* Stripe Subscription / Plan Card */}
      <Card className="space-y-4 border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                sub.isPro
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-400/20 text-amber-300'
              }`}
            >
              {sub.isPro ? (
                <>
                  <SparklesIcon className="h-3 w-3" /> Solo Rig • Pro Active
                </>
              ) : (
                `Solo Rig • 14-Day Trial (${sub.daysLeft} days left)`
              )}
            </span>
            <h3 className="text-base font-bold text-white">Outlaw Shop Systems Pro</h3>
          </div>
          <div className="text-right">
            <span className="text-xl font-black text-amber-400">$29</span>
            <span className="text-xs text-slate-400"> / month</span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Unlock unlimited work orders, cloud multi-tenant database sync, parts &amp; inventory tracking, offline PDF invoicing, and customer SMS dispatches.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Unlimited Invoices &amp; Work Orders</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Full Inventory &amp; Stock Management</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Multi-Tenant Cloud Sync (Supabase)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Instant PDF &amp; Custom Branding</span>
          </div>
        </div>

        {!sub.isPro ? (
          <div className="pt-2 space-y-2">
            <a
              href={STRIPE_PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 shadow-md active:scale-[0.99]"
            >
              Start 14-Day Free Trial
              <span className="text-xs font-normal text-slate-900">(Then $29/mo)</span>
            </a>
            <p className="text-center text-[11px] text-slate-400">
              Secure 256-bit Stripe checkout. Lockout applies after Day 14 without active subscription.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs font-semibold text-emerald-400">
            ✓ Your Outlaw Shop Systems Pro Plan is fully active!
          </div>
        )}

        {/* License code redemption */}
        <div className="border-t border-slate-800 pt-3">
          {!showCodeBox ? (
            <button
              type="button"
              onClick={() => setShowCodeBox(true)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline"
            >
              Have a license key or activation code?
            </button>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Enter Activation Key
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={licenseCode}
                  onChange={(e) => setLicenseCode(e.target.value)}
                  placeholder="e.g. CODE-XXXX"
                  className="bg-slate-800 text-white border-slate-700 text-xs uppercase"
                />
                <Button
                  type="button"
                  variant="accent"
                  onClick={handleUnlockKey}
                  disabled={validatingKey}
                  className="shrink-0 text-xs px-3 font-bold"
                >
                  {validatingKey ? 'Checking…' : 'Activate'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Screen & Layout Display Mode */}
      <Card className="space-y-3 p-4">
        <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
          Display &amp; Layout Mode
        </h3>
        <p className="text-xs text-slate-500">
          Choose how Outlaw Shop Systems adapts to your screen.
        </p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('outlaw_view_mode', 'auto');
              window.location.reload();
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center transition hover:bg-slate-100 active:scale-95"
          >
            <SparklesIcon className="h-5 w-5 text-slate-700" />
            <span className="text-xs font-bold text-slate-800">Automatic</span>
            <span className="text-[10px] text-slate-400">Device adaptive</span>
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('outlaw_view_mode', 'desktop');
              window.location.reload();
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-center transition hover:bg-amber-100/60 active:scale-95"
          >
            <MonitorIcon className="h-5 w-5 text-amber-800" />
            <span className="text-xs font-bold text-amber-900">Force Desktop</span>
            <span className="text-[10px] text-amber-700">Widescreen + Nav</span>
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('outlaw_view_mode', 'mobile');
              window.location.reload();
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center transition hover:bg-slate-100 active:scale-95"
          >
            <SmartphoneIcon className="h-5 w-5 text-slate-700" />
            <span className="text-xs font-bold text-slate-800">Force Mobile</span>
            <span className="text-[10px] text-slate-400">Compact phone</span>
          </button>
        </div>
      </Card>

      {/* Native Android APK Card */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <SmartphoneIcon className="h-5 w-5 text-slate-800" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Native Android App (APK)
              </h3>
              <p className="text-[11px] text-slate-500">Standalone offline app for Android phones &amp; tablets</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            v1.2 Native
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Standalone offline app for service truck phones and tablets with camera inspections, customer signatures, and native PDF printing.
        </p>
        {isNativePlatform ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-950 text-xs font-semibold">
            <CheckIcon className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900">Installed &amp; Running Native APK</p>
              <p className="text-[11px] text-emerald-700 font-normal">Offline database, camera photo storage, and direct Android printer spooler are active.</p>
            </div>
          </div>
        ) : (
          <a
            href={ANDROID_APK_DOWNLOAD_URL}
            download="OutlawShopSystems.apk"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 shadow-sm active:scale-95"
          >
            <SmartphoneIcon className="h-4 w-4" />
            <span>Download Android APK</span>
          </a>
        )}
      </Card>

      {/* Data Management Card */}
      <Card className="space-y-3 border-amber-200 bg-amber-50/50 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">
          Demo Data Management
        </h3>
        <p className="text-xs text-slate-600">
          Ready to wipe the sample Ford, Tundra, and demo customers to start with a clean slate?
        </p>
        <Button
          variant="ghost"
          onClick={handleWipeDemoData}
          disabled={wiping}
          className="w-full border border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          <TrashIcon className="h-4 w-4 text-amber-700" />
          {wiping ? 'Wiping demo rows…' : 'Wipe Sample Demo Records'}
        </Button>
      </Card>
    </div>
  );
}
