import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, MailIcon, MapPinIcon, PhoneIcon, ClockIcon } from '../components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '../components/ui';
import { useAsync } from '../lib/hooks';
import { fullName, getVehicleTypeInfo, longDate, money, num, VEHICLE_TYPES, vehicleLabel } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { Customer, Invoice, Vehicle, VehicleType, WorkOrder } from '../types';

type CustomerFull = Customer & {
  vehicles: Vehicle[];
  work_orders: WorkOrder[];
  invoices: Invoice[];
};

const emptyVehicle = {
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

  const currentTypeInfo = getVehicleTypeInfo(v.type);

  async function addVehicle(e: FormEvent) {
    e.preventDefault();
    if (!v.make.trim() && !v.model.trim()) {
      toast('Please enter a make or model', 'error');
      return;
    }
    setSaving(true);
    try {
      check(
        await requireSupabase()
          .from('vehicles')
          .insert({
            customer_id: c!.id,
            type: v.type,
            year: v.year ? Number(v.year) : null,
            make: v.make.trim(),
            model: v.model.trim(),
            trim: v.trim.trim(),
            vin: v.vin.trim(),
            plate: v.plate.trim(),
            engine_hours: v.engine_hours ? Number(v.engine_hours) : null,
            engine_info: v.engine_info.trim(),
          })
      );
      setV(emptyVehicle);
      setAddingVehicle(false);
      toast('Vehicle / equipment added');
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
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Vehicles & Equipment ({c.vehicles?.length ?? 0})
          </h3>
          <button
            onClick={() => setAddingVehicle((s) => !s)}
            className="text-xs font-semibold text-amber-600 underline"
          >
            {addingVehicle ? 'Cancel' : '+ Add'}
          </button>
        </div>

        {(c.vehicles ?? []).length === 0 && !addingVehicle && (
          <p className="text-xs text-slate-400">No vehicles or equipment on file.</p>
        )}
        <div className="space-y-2">
          {(c.vehicles ?? []).map((veh) => {
            const tInfo = getVehicleTypeInfo(veh.type);
            return (
              <Card key={veh.id} className="flex items-start gap-3 p-3.5">
                <span className="text-xl leading-none" role="img" aria-label={tInfo.label}>
                  {tInfo.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {vehicleLabel(veh) || 'Vehicle'}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {tInfo.shortLabel}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      veh.plate ? `${tInfo.regLabel}: ${veh.plate}` : null,
                      veh.vin ? `${tInfo.idLabel}: ${veh.vin}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No ID on file'}
                  </p>

                  {(veh.engine_hours || veh.engine_info) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                      {veh.engine_hours && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                          <ClockIcon className="h-3 w-3" />
                          {veh.engine_hours} hrs
                        </span>
                      )}
                      {veh.engine_info && (
                        <span className="text-slate-500 italic">{veh.engine_info}</span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {addingVehicle && (
          <form onSubmit={addVehicle} className="mt-3 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-900/5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Add Vehicle or Equipment
            </p>

            <Field label="Category">
              <Select
                value={v.type}
                onChange={(e) => setV({ ...v, type: e.target.value as VehicleType })}
              >
                {Object.values(VEHICLE_TYPES).map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.emoji} {opt.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Year">
                <Input
                  value={v.year}
                  onChange={(e) => setV({ ...v, year: e.target.value })}
                  type="number"
                  min="1900"
                  max="2035"
                  placeholder="2021"
                />
              </Field>
              <div className="col-span-2">
                <Field label="Make / Brand *">
                  <Input
                    value={v.make}
                    onChange={(e) => setV({ ...v, make: e.target.value })}
                    placeholder={
                      v.type === 'marine'
                        ? 'e.g. Sea-Doo / Boston Whaler'
                        : v.type === 'atv'
                          ? 'e.g. Polaris / Can-Am'
                          : v.type === 'snowmobile'
                            ? 'e.g. Ski-Doo / Polaris'
                            : v.type === 'equipment'
                              ? 'e.g. Kubota / John Deere'
                              : 'e.g. Ford / Chevy'
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Model">
                  <Input
                    value={v.model}
                    onChange={(e) => setV({ ...v, model: e.target.value })}
                    placeholder="e.g. Spark / F-150 / Ranger"
                  />
                </Field>
              </div>
              <Field label="Trim / Submodel">
                <Input
                  value={v.trim}
                  onChange={(e) => setV({ ...v, trim: e.target.value })}
                  placeholder="e.g. 2UP / XLT"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={currentTypeInfo.idLabel}>
                <Input
                  value={v.vin}
                  onChange={(e) => setV({ ...v, vin: e.target.value })}
                  placeholder={currentTypeInfo.idLabel}
                />
              </Field>
              <Field label={currentTypeInfo.regLabel}>
                <Input
                  value={v.plate}
                  onChange={(e) => setV({ ...v, plate: e.target.value })}
                  placeholder={currentTypeInfo.regLabel}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`${currentTypeInfo.hoursLabel} (optional)`}>
                <Input
                  value={v.engine_hours}
                  onChange={(e) => setV({ ...v, engine_hours: e.target.value })}
                  type="number"
                  step="0.1"
                  placeholder="e.g. 125.5"
                />
              </Field>
              <Field label="Engine / Motor details">
                <Input
                  value={v.engine_info}
                  onChange={(e) => setV({ ...v, engine_info: e.target.value })}
                  placeholder="e.g. 900cc ACE / 5.0L V8"
                />
              </Field>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" variant="accent" disabled={saving} className="flex-1">
                {saving ? 'Saving…' : 'Save Vehicle / Equipment'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAddingVehicle(false)}>
                Cancel
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
