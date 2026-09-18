import { useState, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import { WrenchIcon, TrashIcon, CheckIcon } from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Spinner, Textarea } from '../components/ui';
import { useShopSettings } from '../lib/settings';
import { check, errMsg, requireSupabase } from '../lib/supabase';

export default function Settings() {
  const toast = useToast();
  const { settings, loading, updateSettings } = useShopSettings();

  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [wiping, setWiping] = useState(false);

  // Sync state if initial fetch completes
  const [synced, setSynced] = useState(false);
  if (!loading && !synced) {
    setForm(settings);
    setSynced(true);
  }

  if (loading) return <Spinner />;

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
