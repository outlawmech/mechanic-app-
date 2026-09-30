import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, PlusIcon, UsersIcon, WrenchIcon, VehicleIcon } from '../components/icons';
import { Button, Card, ErrorState, Field, Input, Textarea, PageTitle, Select, Spinner } from '../components/ui';
import CustomerSearchPicker from '../components/CustomerSearchPicker';
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
  const requestedDate = search.get('scheduled');
  const [scheduled, setScheduled] = useState(
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayISO()
  );
  const [mileageOrHours, setMileageOrHours] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick Customer & Vehicle Intake Modal state
  const [quickCustOpen, setQuickCustOpen] = useState(false);
  const [qType, setQType] = useState<VehicleType>('auto');
  const [qYear, setQYear] = useState('');
  const [qMake, setQMake] = useState('');
  const [qModel, setQModel] = useState('');
  const [qPlate, setQPlate] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const [addedCustomers, setAddedCustomers] = useState<CustomerWithVehicles[]>([]);

  const availableCustomers = [...addedCustomers, ...(customers || []).filter(c => !addedCustomers.some(a => a.id === c.id))];
  const customer = availableCustomers.find((c) => c.id === customerId);
  const selectedVehicle = customer?.vehicles?.find((v) => v.id === vehicleId);
  const vehicleTypeInfo = selectedVehicle ? getVehicleTypeInfo(selectedVehicle.type) : null;

  async function handleAddVehicle(e: FormEvent) {
    e.preventDefault();
    if (!customer) return;
    if (!qMake.trim() && !qModel.trim()) {
      toast('Enter a make or model for the vehicle.', 'error');
      return;
    }
    setSavingQuick(true);
    try {
      const newVehId = generateUUID();
      const vehicle = {
        id: newVehId,
        customer_id: customer.id,
        type: qType,
        year: qYear.trim() || null,
        make: qMake.trim(),
        model: qModel.trim(),
        trim: '', vin: '', plate: qPlate.trim(),
        created_at: new Date().toISOString(),
      };
      if (navigator.onLine) {
        check(await requireSupabase().from('vehicles').insert(vehicle));
      } else {
        enqueueOfflineAction({ table: 'vehicles', type: 'insert', payload: vehicle,
          description: `Add vehicle ${vehicle.make} ${vehicle.model}` });
      }
      const updatedCustomer: CustomerWithVehicles = {
        ...customer, vehicles: [...(customer.vehicles || []), vehicle],
      };
      const updatedList = availableCustomers.map(c => c.id === customer.id ? updatedCustomer : c);
      cacheLocal('customers', updatedList);
      setAddedCustomers(prev => [updatedCustomer, ...prev.filter(c => c.id !== customer.id)]);
      setVehicleId(newVehId);
      setQuickCustOpen(false);
      setQYear(''); setQMake(''); setQModel(''); setQPlate('');
      toast('Vehicle added to this customer and selected.');
    } catch (err: any) {
      toast(err?.message || 'Could not add vehicle.', 'error');
    } finally {
      setSavingQuick(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

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
          toast('Work Order created');
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
        description: `Create Work Order for ${fullName(customer)}`,
      });

      toast('Work Order created (Saved to device)');
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
        description: `Create Work Order for ${fullName(customer)}`,
      });

      toast('Work Order created (Saved offline)');
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
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All Work Orders
      </Link>
      <PageTitle title="New Work Order (WO)" sub="What machine or vehicle are we servicing?" />
      {availableCustomers.length === 0 && <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">First job? Use <strong>Quick New Customer</strong> below, then continue this work order.</p>}

      <form onSubmit={save} className="space-y-4">
        <Card className="space-y-4 p-4">
          <CustomerSearchPicker
            customers={availableCustomers}
            selectedCustomerId={customerId}
            onSelectCustomer={(c) => {
              setCustomerId(c?.id || '');
              const vehs = (c as CustomerWithVehicles)?.vehicles || [];
              if (vehs.length === 1) {
                setVehicleId(vehs[0].id);
              } else if (!vehs.some((v) => v.id === vehicleId)) {
                setVehicleId('');
              }
            }}
            onCustomerCreated={(newCust) => {
              setAddedCustomers(prev => [newCust as CustomerWithVehicles, ...prev.filter(c => c.id !== newCust.id)]);
              setCustomerId(newCust.id);
            }}
            placeholder="🔍 Search customer by name, phone #, email, or vehicle…"
            label="Customer Account"
            helperText="Search by name, phone, or vehicle. Type to search or tap 'Quick New Customer' to register walk-ins."
            required
          />

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Vehicle / Equipment Serviced
              </label>
              {customer && (
                <button
                  type="button"
                  onClick={() => setQuickCustOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700"
                >
                  <PlusIcon className="h-3 w-3" /> Add Vehicle to Customer
                </button>
              )}
            </div>

            <Select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={!customer}
            >
              <option value="">{customer ? 'No vehicle specified / Shop equipment / General Service' : 'Pick a customer first'}</option>
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
          </div>

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

          <Field label="Primary Complaint / Service Request / Detailed Notes">
            <Textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 100-hr full service, won't turn over, hydraulic leak at boom cylinder, customer reports sputter under load at 4500 RPM..."
              className="min-h-[140px]"
            />
          </Field>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full text-xs font-bold">
          {saving ? 'Creating…' : 'Create Work Order'}
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
                  <h3 className="text-base font-bold text-white">Add Vehicle</h3>
                  <p className="text-xs text-slate-400">Add equipment to the selected customer without leaving intake</p>
                </div>
              </div>
              <button
                type="button"
                data-modal-close="true"
                onClick={() => setQuickCustOpen(false)}
                className="rounded-full bg-slate-800 p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddVehicle} className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-400">
                    Vehicle / Machine
                  </span>
                </div>
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
                  {savingQuick ? 'Saving…' : 'Save & Attach to WO'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
