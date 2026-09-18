import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, CarIcon, MailIcon, MapPinIcon, PhoneIcon } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageTitle,
  Spinner,
} from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, longDate, money, num, vehicleLabel } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { Customer, Invoice, Vehicle, WorkOrder } from '../types';

type CustomerFull = Customer & {
  vehicles: Vehicle[];
  work_orders: WorkOrder[];
  invoices: Invoice[];
};

const emptyVehicle = { year: '', make: '', model: '', trim: '', vin: '', plate: '' };

export default function CustomerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const res = check(
      await requireSupabase()
        .from('customers')
        .select(
          '*, vehicles:vehicles(*), work_orders:work_orders(id, number, status, created_at, completed_at), invoices:invoices(id, number, total, status, issued_at)'
        )
        .eq('id', id!)
        .maybeSingle()
    );
    return (res.data ?? null) as CustomerFull | null;
  }, [id]);

  const [addingVehicle, setAddingVehicle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState(emptyVehicle);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!data) {
    return (
      <EmptyState
        title="Customer not found"
        action={
          <Link to="/customers">
            <Button variant="ghost">Back to customers</Button>
          </Link>
        }
      />
    );
  }
  const c = data;

  async function addVehicle(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      check(
        await requireSupabase()
          .from('vehicles')
          .insert({
            customer_id: c!.id,
            year: v.year ? Number(v.year) : null,
            make: v.make,
            model: v.model,
            trim: v.trim,
            vin: v.vin,
            plate: v.plate,
          })
      );
      setV(emptyVehicle);
      setAddingVehicle(false);
      toast('Vehicle added');
      await reload();
    } catch (e2) {
      toast(errMsg(e2), 'error');
      setSaving(false);
    }
  }

  const wos = [...(c.work_orders ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  const invs = [...(c.invoices ?? [])].sort((a, b) => b.issued_at.localeCompare(a.issued_at));

  return (
    <div>
      <Link
        to="/customers"
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Customers
      </Link>

      <PageTitle title={fullName(c)} sub={`Customer since ${longDate(c.created_at)}`} />

      <Card className="divide-y divide-slate-100 p-4">
        {c.phone && (
          <a href={`tel:${c.phone}`} className="flex items-center gap-3 py-2 text-sm text-slate-700 first:pt-0 last:pb-0">
            <PhoneIcon className="h-4 w-4 text-slate-400" /> {c.phone}
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-3 py-2 text-sm text-slate-700 first:pt-0 last:pb-0">
            <MailIcon className="h-4 w-4 text-slate-400" /> {c.email}
          </a>
        )}
        {c.address && (
          <p className="flex items-center gap-3 py-2 text-sm text-slate-700 first:pt-0 last:pb-0">
            <MapPinIcon className="h-4 w-4 text-slate-400" /> {c.address}
          </p>
        )}
        {c.notes && <p className="py-2 text-xs text-slate-500 first:pt-0 last:pb-0">{c.notes}</p>}
      </Card>

      <Link to={`/work/new?customer=${c.id}`} className="mt-3 block">
        <Button variant="accent" className="w-full">
          + New work order for {c.first_name}
        </Button>
      </Link>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Vehicles</h3>
          <button
            onClick={() => setAddingVehicle((s) => !s)}
            className="text-xs font-semibold text-slate-500 underline"
          >
            {addingVehicle ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {(c.vehicles ?? []).length === 0 && !addingVehicle && (
          <p className="text-xs text-slate-400">No vehicles on file.</p>
        )}
        <div className="space-y-2">
          {(c.vehicles ?? []).map((veh) => (
            <Card key={veh.id} className="flex items-start gap-3 p-3.5">
              <CarIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {vehicleLabel(veh) || 'Vehicle'}
                </p>
                <p className="text-xs text-slate-500">
                  {[veh.plate, veh.vin].filter(Boolean).join(' · ') || 'No plate / VIN on file'}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {addingVehicle && (
          <form onSubmit={addVehicle} className="mt-3 grid grid-cols-3 gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-900/5">
            <Field label="Year">
              <Input value={v.year} onChange={(e) => setV({ ...v, year: e.target.value })} type="number" min="1900" max="2035" />
            </Field>
            <div className="col-span-2">
              <Field label="Make / model">
                <Input value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} placeholder="Ford F-150" />
              </Field>
            </div>
            <div className="col-span-3">
              <Field label="Plate / VIN">
                <Input value={v.plate} onChange={(e) => setV({ ...v, plate: e.target.value })} placeholder="MT-12345" />
              </Field>
            </div>
            <div className="col-span-3">
              <Button type="submit" variant="ghost" disabled={saving} className="w-full">
                Save vehicle
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Work orders
        </h3>
        {wos.length === 0 ? (
          <p className="text-xs text-slate-400">No work orders yet.</p>
        ) : (
          <div className="space-y-2">
            {wos.map((w) => (
              <Link key={w.id} to={`/work/${w.id}`}>
                <Card className="flex items-center justify-between p-3.5">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-500">{w.number}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{longDate(w.created_at)}</p>
                  </div>
                  <Badge status={w.status} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Invoices</h3>
        {invs.length === 0 ? (
          <p className="text-xs text-slate-400">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invs.map((i) => (
              <Link key={i.id} to={`/invoices/${i.id}`}>
                <Card className="flex items-center justify-between p-3.5">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-500">{i.number}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{longDate(i.issued_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{money(num(i.total))}</span>
                    <Badge status={i.status} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
