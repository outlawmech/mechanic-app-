import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, UsersIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, todayISO, vehicleLabel } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { CustomerWithVehicles } from '../types';

export default function NewWorkOrder() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search] = useSearchParams();

  const { data: customers, error, loading } = useAsync(async () => {
    const res = check(
      await requireSupabase()
        .from('customers')
        .select('*, vehicles:vehicles(*)')
        .order('first_name')
    );
    return (res.data ?? []) as CustomerWithVehicles[];
  });

  const [customerId, setCustomerId] = useState(search.get('customer') ?? '');
  const [vehicleId, setVehicleId] = useState('');
  const [scheduled, setScheduled] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const customer = customers?.find((c) => c.id === customerId);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  if (customers && customers.length === 0) {
    return (
      <div>
        <PageTitle title="New Work Order" />
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title="No customers yet"
          sub="Add a customer first, then start the work order."
          action={
            <Link to="/customers/new">
              <Button variant="accent">Add customer</Button>
            </Link>
          }
        />
      </div>
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!customerId) {
      toast('Pick a customer first', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = check(
        await requireSupabase()
          .from('work_orders')
          .insert({
            customer_id: customerId,
            vehicle_id: vehicleId || null,
            scheduled_at: scheduled ? `${scheduled}T12:00:00` : null,
            notes,
          })
          .select('id')
          .single()
      );
      toast('Work order created');
      navigate(`/work/${(res.data as { id: string }).id}`, { replace: true });
    } catch (err) {
      toast(errMsg(err), 'error');
      setSaving(false);
    }
  }

  return (
    <div>
      <Link
        to="/work"
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Work orders
      </Link>
      <PageTitle title="New Work Order" sub="What are we working on?" />

      <form onSubmit={save} className="space-y-4">
        <Card className="space-y-4 p-4">
          <Field label="Customer">
            <Select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setVehicleId('');
              }}
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

          <Field label="Vehicle">
            <Select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={!customer}
            >
              <option value="">{customer ? 'No vehicle / TBA' : 'Pick a customer first'}</option>
              {(customer?.vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleLabel(v) || 'Vehicle'}
                  {v.plate ? ` · ${v.plate}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Scheduled date">
            <Input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>

          <Field label="Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Brakes squealing on hard stops"
            />
          </Field>
        </Card>

        <Button type="submit" variant="accent" disabled={saving} className="w-full">
          {saving ? 'Creating…' : 'Create work order'}
        </Button>
      </form>
    </div>
  );
}
