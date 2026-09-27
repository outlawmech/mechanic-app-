import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, PlusIcon, UsersIcon, WrenchIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, getVehicleTypeInfo, todayISO, vehicleLabel } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, getCachedLocal, generateUUID } from '../lib/offlineSync';
import type { CustomerWithVehicles, VehicleType, WorkOrderFull } from '../types';

export default function NewWorkOrder() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search] = useSearchParams();

  const { data: customers, error, loading } = useAsync(async () => {
    return safeFetchWithCache<CustomerWithVehicles[]>(
      'customers',
      async () => {
        const res = check(
          await requireSupabase()
            .from('customers')
            .select('*, vehicles:vehicles(*)')
            .order('first_name')
        );
        return (res.data ?? []) as CustomerWithVehicles[];
      },
      []
    );
  });

  const [customerId, setCustomerId] = useState(search.get('customer') ?? '');
  const [vehicleId, setVehicleId] = useState(search.get('vehicle') ?? '');
  const [scheduled, setScheduled] = useState(todayISO());
  const [mileageOrHours, setMileageOrHours] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick Customer & Vehicle Intake Modal state
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [qFirstName, setQFirstName] = useState('');
  const [qLastName, setQLastName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qType, setQType] = useState<VehicleType>('auto');
  const [qYear, setQYear] = useState('');
  const [qMake, setQMake] = useState('');
  const [qModel, setQModel] = useState('');
  const [qPlate, setQPlate] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);

  const customer = customers?.find((c) => c.id === customerId);
  const selectedVehicle = customer?.vehicles?.find((v) => v.id === vehicleId);
  const vehicleTypeInfo = selectedVehicle ? getVehicleTypeInfo(selectedVehicle.type) : null;

  async function handleCreateQuickCustomer(e: FormEvent) {
    e.preventDefault();
    if (!qFirstName.trim() && !qLastName.trim()) {
      toast('Customer name is required', 'error');
      return;
    }
    setSavingQuick(true);

    try {
      const newCustId = generateUUID();
      const newVehId = generateUUID();
      const sb = requireSupabase();

      const custPayload = {
        id: newCustId,
        first_name: qFirstName.trim(),
        last_name: qLastName.trim(),
        phone: qPhone.trim(),
        email: qEmail.trim(),
        address: '',
        notes: 'Created via quick RO intake',
        created_at: new Date().toISOString(),
      };

      const vehPayload = (qMake.trim() || qModel.trim()) ? {
        id: newVehId,
        customer_id: newCustId,
        type: qType,
        year: qYear.trim() || null,
        make: qMake.trim(),
        model: qModel.trim(),
        trim: '',
        vin: '',
        plate: qPlate.trim(),
        created_at: new Date().toISOString(),
      } : null;

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await sb.from('customers').insert(custPayload);
        if (vehPayload) {
          await sb.from('vehicles').insert(vehPayload);
        }
      } else {
        enqueueOfflineAction({
          table: 'customers',
          type: 'insert',
          payload: custPayload,
          description: `Add customer ${custPayload.first_name} ${custPayload.last_name}`,
        });
        if (vehPayload) {
          enqueueOfflineAction({
            table: 'vehicles',
            type: 'insert',
            payload: vehPayload,
            description: `Add vehicle ${vehPayload.year || ''} ${vehPayload.make} ${vehPayload.model}`,
          });
        }
      }

      const fullNewCust: CustomerWithVehicles = {
        ...custPayload,
        vehicles: vehPayload ? [vehPayload] : [],
      };

      const currentList = customers || [];
      const updatedList = [fullNewCust, ...currentList];
      cacheLocal('customers', updatedList);

      setCustomerId(newCustId);
      if (vehPayload) {
        setVehicleId(newVehId);
      }

      toast(`Customer ${fullName(custPayload)} created & selected!`);
      setQuickCustOpen(false);
      setQFirstName('');
      setQLastName('');
      setQPhone('');
      setQEmail('');
      setQYear('');
      setQMake('');
      setQModel('');
      setQPlate('');
    } catch (err: any) {
      toast(err?.message || 'Failed to create customer', 'error');
    } finally {
      setSavingQuick(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  if (customers && customers.length === 0) {
    return (
      <div className="space-y-4">
        <PageTitle title="New Repair Order (RO)" />
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title="No customers on file"
          sub="Add a customer first, then start the repair order."
          action={
            <Link to="/customers/new">
              <Button variant="accent">+ Add Customer</Button>
            </Link>
          }
        />
      </div>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast('Please select a customer first', 'error');
      return;
    }
    setSaving(true);

    const roId = generateUUID();
    const tempNumber = `RO-${Math.floor(1000 + Math.random() * 9000)}`;

    const payload = {
      id: roId,
      customer_id: customerId,
      vehicle_id: vehicleId || null,
      scheduled_at: scheduled ? `${scheduled}T12:00:00` : null,
      mileage_or_hours: mileageOrHours.trim(),
      notes: notes.trim(),
    };

    const offlineRo: WorkOrderFull = {
      id: roId,
      number: tempNumber,
      customer_id: customerId,
      vehicle_id: vehicleId || null,
      customer: customer!,
      vehicle: selectedVehicle || null,
      scheduled_at: payload.scheduled_at,
      mileage_or_hours: payload.mileage_or_hours,
      notes: payload.notes,
      status: 'open',
      items: [],
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    // Save into local cache immediately
    cacheLocal(`wo_${roId}`, { wo: offlineRo, invoice: null, inventoryParts: [] });
    const cachedOrders = getCachedLocal<WorkOrderFull[]>('work_orders') || [];
    cacheLocal('work_orders', [offlineRo, ...cachedOrders]);

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const res = check(
          await requireSupabase()
            .from('work_orders')
            .insert({
              customer_id: payload.customer_id,
              vehicle_id: payload.vehicle_id,
              scheduled_at: payload.scheduled_at,
              mileage_or_hours: payload.mileage_or_hours,
              notes: payload.notes,
            })
            .select('id, number')
        );
        const created = (res.data as Array<{ id: string; number: string }>)?.[0];
        if (created?.id) {
          toast('Repair Order created');
          navigate(`/work/${created.id}`, { replace: true });
          return;
        }
      }

      enqueueOfflineAction({
        table: 'work_orders',
        type: 'insert',
        payload: {
          id: roId,
          customer_id: payload.customer_id,
          vehicle_id: payload.vehicle_id,
          scheduled_at: payload.scheduled_at,
          mileage_or_hours: payload.mileage_or_hours,
          notes: payload.notes,
        },
        description: `Create Repair Order for ${fullName(customer)}`,
      });

      toast('Repair Order created (Saved to device)');
      navigate(`/work/${roId}`, { replace: true });
    } catch (err) {
      enqueueOfflineAction({
        table: 'work_orders',
        type: 'insert',
        payload: {
          id: roId,
          customer_id: payload.customer_id,
          vehicle_id: payload.vehicle_id,
          scheduled_at: payload.scheduled_at,
          mileage_or_hours: payload.mileage_or_hours,
          notes: payload.notes,
        },
        description: `Create Repair Order for ${fullName(customer)}`,
      });

      toast('Repair Order created (Saved offline)');
      navigate(`/work/${roId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        to="/work"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All Repair Orders
      </Link>
      <PageTitle title="New Repair Order (RO)" sub="What machine or vehicle are we servicing?" />

      <form onSubmit={save} className="space-y-4">
        <Card className="space-y-4 p-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer *
              </span>
              <button
                type="button"
                onClick={() => setQuickCustOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
              >
                <PlusIcon className="h-3.5 w-3.5" /> + New Customer &amp; Vehicle
              </button>
            </div>
            <Select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setVehicleId('');
              }}
              required
            >
              <option value="">Select a customer…</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </Select>
          </div>

          <Field label="Vehicle / Vessel / Equipment">
            <Select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={!customer}
            >
              <option value="">{customer ? 'No vehicle specified / Shop equipment' : 'Pick a customer first'}</option>
              {(customer?.vehicles ?? []).map((v) => {
                const info = getVehicleTypeInfo(v.type);
                return (
                  <option key={v.id} value={v.id}>
                    [{info.shortLabel}] {vehicleLabel(v) || 'Vehicle'}
                    {v.plate ? ` (${v.plate})` : ''}
                  </option>
                );
              })}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled Date">
              <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </Field>

            <Field label={vehicleTypeInfo ? vehicleTypeInfo.hoursLabel : 'Service Hours / Miles'}>
              <Input
                value={mileageOrHours}
                onChange={(e) => setMileageOrHours(e.target.value)}
                placeholder={
                  selectedVehicle?.engine_hours
                    ? `Current: ${selectedVehicle.engine_hours} hrs`
                    : 'e.g. 145 hrs / 82,000 mi'
                }
              />
            </Field>
          </div>

          <Field label="Primary Complaint / Service Request / Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 100-hr service, won't turn over, hydraulic leak"
            />
          </Field>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full text-xs font-bold">
          {saving ? 'Creating…' : 'Create Repair Order'}
        </Button>
      </form>

      {/* Inline Quick Customer & Vehicle Modal */}
      {quickCustOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setQuickCustOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black">
                  <UsersIcon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Quick Customer Intake</h3>
                  <p className="text-xs text-slate-400">Add contact info and vehicle without leaving RO intake</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickCustOpen(false)}
                className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuickCustomer} className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  Customer Contact
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="First Name *">
                    <Input
                      value={qFirstName}
                      onChange={(e) => setQFirstName(e.target.value)}
                      placeholder="e.g. Dale"
                      className="bg-slate-900 text-white"
                      required
                    />
                  </Field>
                  <Field label="Last Name *">
                    <Input
                      value={qLastName}
                      onChange={(e) => setQLastName(e.target.value)}
                      placeholder="e.g. Miller"
                      className="bg-slate-900 text-white"
                      required
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Phone #">
                    <Input
                      value={qPhone}
                      onChange={(e) => setQPhone(e.target.value)}
                      placeholder="406-555-0199"
                      className="bg-slate-900 text-white font-mono"
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      value={qEmail}
                      onChange={(e) => setQEmail(e.target.value)}
                      placeholder="dale@example.com"
                      className="bg-slate-900 text-white"
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                  Vehicle / Machine (Optional)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Type">
                    <Select
                      value={qType}
                      onChange={(e) => setQType(e.target.value as VehicleType)}
                      className="bg-slate-900 text-white text-xs"
                    >
                      <option value="auto">🚗 Auto / Truck</option>
                      <option value="motorcycle">🏍️ Motorcycle / Dirt</option>
                      <option value="atv">🛞 ATV / UTV</option>
                      <option value="snowmobile">❄️ Snowmobile</option>
                      <option value="marine">🚤 Marine / Boat</option>
                      <option value="equipment">🚜 Equipment</option>
                    </Select>
                  </Field>
                  <Field label="Year">
                    <Input
                      value={qYear}
                      onChange={(e) => setQYear(e.target.value)}
                      placeholder="2024"
                      className="bg-slate-900 text-white font-mono"
                    />
                  </Field>
                  <Field label="Make">
                    <Input
                      value={qMake}
                      onChange={(e) => setQMake(e.target.value)}
                      placeholder="e.g. Suzuki / Polaris"
                      className="bg-slate-900 text-white"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="Model / Spec">
                    <Input
                      value={qModel}
                      onChange={(e) => setQModel(e.target.value)}
                      placeholder="e.g. KingQuad 750 / RZR XP"
                      className="bg-slate-900 text-white"
                    />
                  </Field>
                  <Field label="Plate / Tag / Reg">
                    <Input
                      value={qPlate}
                      onChange={(e) => setQPlate(e.target.value)}
                      placeholder="Optional plate #"
                      className="bg-slate-900 text-white font-mono uppercase"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setQuickCustOpen(false)}
                  className="text-xs text-slate-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="accent"
                  disabled={savingQuick}
                  className="text-xs font-bold"
                >
                  {savingQuick ? 'Saving…' : 'Save & Attach to RO'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
