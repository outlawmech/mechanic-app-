import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import { WrenchIcon, TrashIcon, CheckIcon, PlusIcon } from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Spinner, Textarea } from '../components/ui';
import { useShopSettings } from '../lib/settings';
import { processLogoImage } from '../lib/image';
import { check, errMsg, requireSupabase } from '../lib/supabase';

export default function Settings() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { settings, loading, updateSettings } = useShopSettings();

  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [wiping, setWiping] = useState(false);

  // Sync state if initial fetch completes
  const [synced, setSynced] = useState(false);
  if (!loading && !synced) {
    setForm(settings);
    setSynced(true);
  }

  if (loading) return <Spinner />;

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
              placeholder="e.g. Outlaw Mech"
            />
          </Field>

          <Field label="Tagline / Specialty">
            <Input
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="e.g. Mobile Mechanic & Field Service"
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

        <Button type="submit" variant="accent" disabled={saving} className="w-full">
          {saving ? 'Saving changes…' : 'Save Shop Profile'}
        </Button>
      </form>

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
