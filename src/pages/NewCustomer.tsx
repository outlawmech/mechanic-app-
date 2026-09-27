import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, PlusIcon, SparklesIcon, VehicleIcon } from '../components/icons';
import { Button, Card, Field, Input, PageTitle, Select } from '../components/ui';
import { getVehicleTypeInfo, VEHICLE_TYPES } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { enqueueOfflineAction, cacheLocal, getCachedLocal, generateUUID } from '../lib/offlineSync';
import { decodeVehicleVIN } from '../lib/vinDecoder';
import type { CustomerWithVehicles, Vehicle, VehicleType } from '../types';

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
  engine_serial: '',
  has_second_engine: false,
  engine2_info: '',
  engine2_serial: '',
  engine2_hours: '',
};

export default function NewCustomer() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);

  const set =
    (k: keyof typeof empty) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const currentTypeInfo = getVehicleTypeInfo(form.type);

  async function handleDecodeVin() {
    const raw = form.vin.trim();
    if (!raw) {
      toast('Please enter a VIN or Hull ID first', 'error');
      return;
    }
    setDecoding(true);
    try {
      const decoded = await decodeVehicleVIN(raw);
      if (decoded.make || decoded.year || decoded.model) {
        setForm((prev) => ({
          ...prev,
          year: decoded.year || prev.year,
          make: decoded.make || prev.make,
          model: decoded.model || prev.model,
          trim: decoded.trim || prev.trim,
          engine_info: decoded.engine_info || prev.engine_info,
          type: (decoded.vehicle_type as VehicleType) || prev.type,
        }));
        toast(`Decoded: ${[decoded.year, decoded.make, decoded.model].filter(Boolean).join(' ')}`);
      } else {
        toast('Could not decode this VIN/HIN. Please enter specs manually.', 'error');
      }
    } catch {
      toast('Decoding failed. Please check connection or enter manually.', 'error');
    } finally {
      setDecoding(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim()) {
      toast('First name is required', 'error');
      return;
    }
    setSaving(true);

    const customerId = generateUUID();
    const vehId = generateUUID();

    const customerPayload = {
      id: customerId,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
    };

    const hasVehicle = [
      form.make,
      form.model,
      form.year,
      form.trim,
      form.vin,
      form.plate,
      form.engine_hours,
      form.engine_info,
      form.engine_serial,
      form.engine2_info,
    ].some((v) => v.trim() !== '');

    const vehiclesList: Vehicle[] = hasVehicle
      ? [
          {
            id: vehId,
            customer_id: customerId,
            type: form.type,
            year: form.year ? Number(form.year) : null,
            make: form.make.trim(),
            model: form.model.trim(),
            trim: form.trim.trim(),
            vin: form.vin.trim(),
            plate: form.plate.trim(),
            engine_hours: form.engine_hours ? Number(form.engine_hours) : null,
            engine_info: form.engine_info.trim(),
            engine_serial: form.engine_serial.trim(),
            engine2_info: form.has_second_engine ? form.engine2_info.trim() : '',
            engine2_serial: form.has_second_engine ? form.engine2_serial.trim() : '',
            engine2_hours: form.has_second_engine && form.engine2_hours ? Number(form.engine2_hours) : null,
            created_at: new Date().toISOString(),
          },
        ]
      : [];

    const newCustomerObj: CustomerWithVehicles = {
      ...customerPayload,
      vehicles: vehiclesList,
      created_at: new Date().toISOString(),
    };

    // Cache customer detail & update list cache locally first
    cacheLocal(`cust_${customerId}`, { ...newCustomerObj, work_orders: [], invoices: [] });
    const cachedCusts = getCachedLocal<CustomerWithVehicles[]>('customers') || [];
    cacheLocal('customers', [newCustomerObj, ...cachedCusts]);

    let savedOnline = false;

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const sb = requireSupabase();
        const res = await sb.from('customers').insert(customerPayload).select('id');
        if (!res.error) {
          if (hasVehicle && vehiclesList[0]) {
            await sb.from('vehicles').insert(vehiclesList[0]);
          }

          savedOnline = true;
          toast('Customer added');
          navigate(`/customers/${customerId}`, { replace: true });
          return;
        }
      } catch (err) {
        console.warn('Online customer save failed, seamlessly saving offline:', err);
      }
    }

    // Offline Queue Fallback
    if (!savedOnline) {
      enqueueOfflineAction({
        table: 'customers',
        type: 'insert',
        payload: customerPayload,
        description: `Create Customer ${customerPayload.first_name} ${customerPayload.last_name}`,
      });

      if (hasVehicle && vehiclesList[0]) {
        enqueueOfflineAction({
          table: 'vehicles',
          type: 'insert',
          payload: vehiclesList[0],
          description: `Add vehicle for ${customerPayload.first_name}`,
        });
      }

      toast('Customer added (Saved to device)');
      navigate(`/customers/${customerId}`, { replace: true });
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All Customers
      </Link>
      <PageTitle title="New Customer" sub="Who are we working for?" />

      <form onSubmit={save} className="space-y-4">
        <Card className="grid grid-cols-2 gap-3 p-4">
          <Field label="First name *">
            <Input value={form.first_name} onChange={set('first_name')} placeholder="Dale" required />
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
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Vehicle / Equipment / Machine</p>
              <p className="text-[11px] text-slate-500">Optional — you can also add equipment later.</p>
            </div>
            <VehicleIcon type={form.type} className="h-5 w-5 text-slate-700" />
          </div>

          <Field label="Equipment Category">
            <Select value={form.type} onChange={set('type')}>
              {Object.values(VEHICLE_TYPES).map((opt) => (
                <option key={opt.type} value={opt.type}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Year">
              <Input
                value={form.year}
                onChange={set('year')}
                type="number"
                min="1900"
                max="2035"
                placeholder="2021"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Make / Brand">
                <Input
                  value={form.make}
                  onChange={set('make')}
                  placeholder={
                    form.type === 'marine'
                      ? 'e.g. Lund / Boston Whaler / Sea-Doo'
                      : form.type === 'atv'
                        ? 'e.g. Polaris / Can-Am'
                        : form.type === 'snowmobile'
                          ? 'e.g. Ski-Doo / Polaris'
                          : form.type === 'equipment'
                            ? 'e.g. Kubota / John Deere / Bobcat'
                            : 'e.g. Ford / Chevy / Toyota'
                  }
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Model">
                <Input
                  value={form.model}
                  onChange={set('model')}
                  placeholder="e.g. 1875 Pro-V / F-150 / Ranger"
                />
              </Field>
            </div>
            <Field label="Trim / Length">
              <Input
                value={form.trim}
                onChange={set('trim')}
                placeholder={form.type === 'marine' ? '19ft' : '4x4 / XLT'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={currentTypeInfo.idLabel}>
              <div className="flex gap-2">
                <Input
                  value={form.vin}
                  onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))}
                  placeholder={form.type === 'marine' ? 'HIN # (12 chars)' : 'VIN (17 chars)'}
                  className="font-mono uppercase text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={handleDecodeVin}
                  disabled={decoding || !form.vin.trim()}
                  className="flex items-center gap-1 rounded-xl bg-orange-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-orange-300 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>{decoding ? 'Decoding…' : 'Decode'}</span>
                </button>
              </div>
            </Field>
            <Field label={currentTypeInfo.regLabel}>
              <Input
                value={form.plate}
                onChange={set('plate')}
                placeholder={form.type === 'marine' ? 'e.g. MT-1234-AB' : 'Plate / Tag #'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Engine / Motor (Make & HP)">
                <Input
                  value={form.engine_info}
                  onChange={set('engine_info')}
                  placeholder={
                    form.type === 'marine'
                      ? 'e.g. Mercury 150 Pro XS 4-Stroke'
                      : 'e.g. 5.0L Coyote / 6.7L Cummins'
                  }
                />
              </Field>
            </div>
            <Field label={`${currentTypeInfo.hoursLabel} (optional)`}>
              <Input
                value={form.engine_hours}
                onChange={set('engine_hours')}
                type="number"
                step="0.1"
                placeholder="e.g. 145.5"
              />
            </Field>
          </div>

          {/* Optional Second Engine / Kicker Section */}
          {!form.has_second_engine ? (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, has_second_engine: true }))}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              <PlusIcon className="h-3.5 w-3.5" /> + Add Second Engine / Kicker Motor
            </button>
          ) : (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-orange-900">
                  Second Engine / Kicker Motor
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      has_second_engine: false,
                      engine2_info: '',
                      engine2_serial: '',
                      engine2_hours: '',
                    }))
                  }
                  className="text-[11px] font-medium text-slate-400 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Make & Model">
                  <Input
                    value={form.engine2_info}
                    onChange={set('engine2_info')}
                    placeholder="e.g. Yamaha 9.9 Kicker"
                  />
                </Field>
                <Field label="Serial Number">
                  <Input
                    value={form.engine2_serial}
                    onChange={set('engine2_serial')}
                    placeholder="e.g. 6AV-987654"
                  />
                </Field>
              </div>
              <Field label="Engine Hours (optional)">
                <Input
                  value={form.engine2_hours}
                  onChange={set('engine2_hours')}
                  type="number"
                  step="0.1"
                  placeholder="e.g. 35.0"
                />
              </Field>
            </div>
          )}
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full text-xs font-bold">
          {saving ? 'Saving…' : 'Save Customer & Vehicle'}
        </Button>
      </form>
    </div>
  );
}
