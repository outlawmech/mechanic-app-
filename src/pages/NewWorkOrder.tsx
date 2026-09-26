import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, UsersIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, getVehicleTypeInfo, todayISO, vehicleLabel } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, getCachedLocal, generateUUID } from '../lib/offlineSync';
import type { CustomerWithVehicles, WorkOrderFull } from '../types';

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

  const customer = customers?.find((c) => c.id === customerId);
  const selectedVehicle = customer?.vehicles?.find((v) => v.id === vehicleId);
  const vehicleTypeInfo = selectedVehicle ? getVehicleTypeInfo(selectedVehicle.type) : null;

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
          <Field label="Customer *">
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
          </Field>

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
    </div>
  );
}
