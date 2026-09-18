import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon } from '../components/icons';
import { Button, Card, ErrorState, Field, Input, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { check, errMsg, requireSupabase } from '../lib/supabase';

const empty = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  year: '',
  make: '',
  model: '',
  trim: '',
  vin: '',
  plate: '',
};

export default function NewCustomer() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set =
    (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // Warm the customer list so the page can redirect with fresh context.
  const { error, loading } = useAsync(async () => {
    check(
      await requireSupabase()
        .from('customers')
        .select('id')
        .limit(1)
    );
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast('First name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const sb = requireSupabase();
      const res = check(
        await sb
          .from('customers')
          .insert({
            first_name: form.first_name.trim(),
            last_name: form.last_name,
            email: form.email,
            phone: form.phone,
            address: form.address,
            notes: form.notes,
          })
          .select('id')
          .single()
      );
      const newId = (res.data as { id: string }).id;
      const hasVehicle = [form.year, form.make, form.model, form.trim, form.vin, form.plate].some(
        (v) => v.trim() !== ''
      );
      if (hasVehicle) {
        check(
          await sb.from('vehicles').insert({
            customer_id: newId,
            year: form.year ? Number(form.year) : null,
            make: form.make,
            model: form.model,
            trim: form.trim,
            vin: form.vin,
            plate: form.plate,
          })
        );
      }
      toast('Customer added');
      navigate(`/customers/${newId}`, { replace: true });
    } catch (err) {
      toast(errMsg(err), 'error');
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/customers" className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Customers
      </Link>
      <PageTitle title="New Customer" sub="Who are we working for?" />

      <form onSubmit={save} className="space-y-4">
        <Card className="grid grid-cols-2 gap-3 p-4">
          <Field label="First name *">
            <Input value={form.first_name} onChange={set('first_name')} placeholder="Dale" />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={set('last_name')} placeholder="Reyes" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} type="tel" placeholder="406-555-0100" />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={set('email')} type="email" placeholder="dale@example.com" />
          </Field>
          <div className="col-span-2">
            <Field label="Address">
              <Input value={form.address} onChange={set('address')} placeholder="Street, city, state" />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Notes">
              <Input value={form.notes} onChange={set('notes')} placeholder="Preferences, gate codes, etc." />
            </Field>
          </div>
        </Card>

        <Card className="p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Vehicle <span className="font-medium normal-case text-slate-400">(optional)</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Year">
              <Input value={form.year} onChange={set('year')} type="number" min="1900" max="2035" placeholder="2018" />
            </Field>
            <div className="col-span-2">
              <Field label="Make">
                <Input value={form.make} onChange={set('make')} placeholder="Ford" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Model">
                <Input value={form.model} onChange={set('model')} placeholder="F-150" />
              </Field>
            </div>
            <Field label="Trim">
              <Input value={form.trim} onChange={set('trim')} placeholder="XLT" />
            </Field>
            <Field label="Plate">
              <Input value={form.plate} onChange={set('plate')} placeholder="MT-12345" />
            </Field>
            <div className="col-span-2">
              <Field label="VIN">
                <Input value={form.vin} onChange={set('vin')} placeholder="17 characters" />
              </Field>
            </div>
          </div>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full">
          {saving ? 'Saving…' : 'Save customer'}
        </Button>
      </form>
    </div>
  );
}
