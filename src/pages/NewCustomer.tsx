import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon } from '../components/icons';
import { Button, Card, ErrorState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { getVehicleTypeInfo, VEHICLE_TYPES } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { VehicleType } from '../types';

const empty = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  // vehicle fields
  type: 'auto' as VehicleType,
  year: '',
  make: '',
  model: '',
  trim: '',
  vin: '',
  plate: '',
  engine_hours: '',
  engine_info: '',
};

export default function NewCustomer() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const set =
    (k: keyof typeof empty) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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

  const currentTypeInfo = getVehicleTypeInfo(form.type);

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
            last_name: form.last_name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            notes: form.notes.trim(),
          })
          .select('id')
          .single()
      );
      const newId = (res.data as { id: string }).id;
      const hasVehicle = [
        form.make,
        form.model,
        form.year,
        form.trim,
        form.vin,
        form.plate,
        form.engine_hours,
        form.engine_info,
      ].some((v) => v.trim() !== '');

      if (hasVehicle) {
        check(
          await sb.from('vehicles').insert({
            customer_id: newId,
            type: form.type,
            year: form.year ? Number(form.year) : null,
            make: form.make.trim(),
            model: form.model.trim(),
            trim: form.trim.trim(),
            vin: form.vin.trim(),
            plate: form.plate.trim(),
            engine_hours: form.engine_hours ? Number(form.engine_hours) : null,
            engine_info: form.engine_info.trim(),
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

        <Card className="space-y-3 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Vehicle / Equipment <span className="font-medium normal-case text-slate-400">(optional)</span>
          </p>

          <Field label="Category">
            <Select value={form.type} onChange={set('type')}>
              {Object.values(VEHICLE_TYPES).map((opt) => (
                <option key={opt.type} value={opt.type}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Year">
              <Input value={form.year} onChange={set('year')} type="number" min="1900" max="2035" placeholder="2021" />
            </Field>
            <div className="col-span-2">
              <Field label="Make / Brand">
                <Input
                  value={form.make}
                  onChange={set('make')}
                  placeholder={
                    form.type === 'marine'
                      ? 'Sea-Doo / Boston Whaler'
                      : form.type === 'atv'
                        ? 'Polaris / Can-Am'
                        : form.type === 'snowmobile'
                          ? 'Ski-Doo / Polaris'
                          : form.type === 'equipment'
                            ? 'Kubota / John Deere'
                            : 'Ford / Chevy'
                  }
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Model">
                <Input value={form.model} onChange={set('model')} placeholder="e.g. Spark / F-150 / Ranger" />
              </Field>
            </div>
            <Field label="Trim">
              <Input value={form.trim} onChange={set('trim')} placeholder="e.g. 2UP / XLT" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={currentTypeInfo.idLabel}>
              <Input value={form.vin} onChange={set('vin')} placeholder={currentTypeInfo.idLabel} />
            </Field>
            <Field label={currentTypeInfo.regLabel}>
              <Input value={form.plate} onChange={set('plate')} placeholder={currentTypeInfo.regLabel} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`${currentTypeInfo.hoursLabel} (optional)`}>
              <Input
                value={form.engine_hours}
                onChange={set('engine_hours')}
                type="number"
                step="0.1"
                placeholder="e.g. 125.5"
              />
            </Field>
            <Field label="Engine / Motor">
              <Input
                value={form.engine_info}
                onChange={set('engine_info')}
                placeholder="e.g. Rotax 900 / 5.0L V8"
              />
            </Field>
          </div>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full">
          {saving ? 'Saving…' : 'Save customer'}
        </Button>
      </form>
    </div>
  );
}
