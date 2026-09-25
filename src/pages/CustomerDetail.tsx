import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, MailIcon, MapPinIcon, PhoneIcon, ClockIcon, PlusIcon } from '../components/icons';
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
  engine_serial: '',
  has_second_engine: false,
  engine2_info: '',
  engine2_serial: '',
  engine2_hours: '',
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
        .limit(1)
    );
    return (res.data?.[0] ?? null) as CustomerFull | null;
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
            engine_serial: v.engine_serial.trim(),
            engine2_info: v.engine2_info.trim(),
            engine2_serial: v.engine2_serial.trim(),
            engine2_hours: v.engine2_hours ? Number(v.engine2_hours) : null,
          })
      );
      toast('Vehicle / Vessel added');
      setV(emptyVehicle);
      setAddingVehicle(false);
      await reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  const vehs = c.vehicles ?? [];
  const wos = c.work_orders ?? [];
  const invs = c.invoices ?? [];

  const totalSpent = invs
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + num(i.total), 0);

  return (
    <div className="space-y-4">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All customers
      </Link>

      <PageTitle
        title={fullName(c)}
        sub={`Customer since ${longDate(c.created_at)}`}
        right={
          <Link to={`/work/new?customer=${c.id}`}>
            <Button variant="accent" className="text-xs">
              + New Work Order
            </Button>
          </Link>
        }
      />

      {/* Responsive 2-Column Desktop Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (5 Cols on desktop): Customer Info & Invoices */}
        <div className="space-y-5 lg:col-span-5">
          <Card className="space-y-3 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Contact Info</h3>
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-950"
              >
                <PhoneIcon className="h-4 w-4 text-slate-400" />
                {c.phone}
              </a>
            )}
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900"
              >
                <MailIcon className="h-4 w-4 text-slate-400" />
                {c.email}
              </a>
            )}
            {c.address && (
              <p className="flex items-center gap-2 text-xs text-slate-600">
                <MapPinIcon className="h-4 w-4 text-slate-400" />
                {c.address}
              </p>
            )}
            {c.notes && (
              <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                <strong className="text-slate-700">Notes:</strong> {c.notes}
              </div>
            )}
          </Card>

          {/* Invoices History Card */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoices</h3>
              {totalSpent > 0 && (
                <span className="text-xs font-bold text-emerald-600">Paid: {money(totalSpent)}</span>
              )}
            </div>

            {invs.length === 0 ? (
              <Card className="p-4 text-center text-xs text-slate-400">No invoices yet.</Card>
            ) : (
              <div className="space-y-2">
                {invs.map((i) => (
                  <Link key={i.id} to={`/invoices/${i.id}`}>
                    <Card className="flex items-center justify-between p-3.5 hover:border-amber-400/50">
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-600">{i.number}</p>
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

        {/* Right Column (7 Cols on desktop): Vehicles & Work Orders */}
        <div className="space-y-5 lg:col-span-7">
          {/* Vehicles / Vessels Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Vehicles &amp; Vessels ({vehs.length})
              </h3>
              {!addingVehicle && (
                <button
                  type="button"
                  onClick={() => setAddingVehicle(true)}
                  className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> + Add Vehicle
                </button>
              )}
            </div>

            {vehs.length === 0 && !addingVehicle ? (
              <Card className="p-4 text-center text-xs text-slate-400">
                No vehicles or vessels attached to this customer.
              </Card>
            ) : (
              <div className="space-y-2.5">
                {vehs.map((veh) => {
                  const info = getVehicleTypeInfo(veh.type);
                  return (
                    <Card key={veh.id} className="p-3.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{info.emoji}</span>
                          <span className="text-xs font-bold text-slate-900">
                            {vehicleLabel(veh)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {[
                            veh.plate ? `${info.regLabel}: ${veh.plate}` : null,
                            veh.vin ? `${info.idLabel}: ${veh.vin}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No ID on file'}
                        </p>

                        {/* Primary Motor / Engine */}
                        {(veh.engine_info || veh.engine_serial || veh.engine_hours) && (
                          <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
                            <div className="flex items-center justify-between font-semibold text-slate-800">
                              <span>
                                {veh.type === 'marine' && veh.engine2_info ? '⚓ Main Motor:' : 'Engine / Motor:'}
                              </span>
                              {veh.engine_hours && (
                                <span className="inline-flex items-center gap-1 text-amber-800">
                                  <ClockIcon className="h-3 w-3" />
                                  {veh.engine_hours} hrs
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-slate-600">
                              {veh.engine_info && <span>{veh.engine_info}</span>}
                              {veh.engine_serial && (
                                <span className="text-slate-400"> (S/N: {veh.engine_serial})</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Secondary Engine / Kicker */}
                        {(veh.engine2_info || veh.engine2_serial || veh.engine2_hours) && (
                          <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2 text-[11px] text-slate-700">
                            <div className="flex items-center justify-between font-semibold text-slate-800">
                              <span>⚓ Second Motor / Kicker:</span>
                              {veh.engine2_hours && (
                                <span className="inline-flex items-center gap-1 text-amber-800">
                                  <ClockIcon className="h-3 w-3" />
                                  {veh.engine2_hours} hrs
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-slate-600">
                              {veh.engine2_info && <span>{veh.engine2_info}</span>}
                              {veh.engine2_serial && (
                                <span className="text-slate-400"> (S/N: {veh.engine2_serial})</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {addingVehicle && (
              <form onSubmit={addVehicle} className="mt-3 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Add Vehicle or Vessel
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
                            ? 'e.g. Lund / Boston Whaler / Sea-Doo'
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
                        placeholder="e.g. 1875 Pro-V / F-150 / Ranger"
                      />
                    </Field>
                  </div>
                  <Field label="Trim / Length">
                    <Input
                      value={v.trim}
                      onChange={(e) => setV({ ...v, trim: e.target.value })}
                      placeholder="e.g. 19ft / XLT"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label={currentTypeInfo.idLabel}>
                    <Input
                      value={v.vin}
                      onChange={(e) => setV({ ...v, vin: e.target.value })}
                      placeholder="e.g. 1HGCR2F8XHA000000"
                    />
                  </Field>
                  <Field label={currentTypeInfo.regLabel}>
                    <Input
                      value={v.plate}
                      onChange={(e) => setV({ ...v, plate: e.target.value })}
                      placeholder="e.g. MT-1234-AB"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Engine / Motor (Make & HP)">
                      <Input
                        value={v.engine_info}
                        onChange={(e) => setV({ ...v, engine_info: e.target.value })}
                        placeholder="e.g. Mercury 150 4-Stroke / 5.0L V8"
                      />
                    </Field>
                  </div>
                  <Field label={`${currentTypeInfo.hoursLabel} (optional)`}>
                    <Input
                      value={v.engine_hours}
                      onChange={(e) => setV({ ...v, engine_hours: e.target.value })}
                      type="number"
                      step="0.1"
                      placeholder="e.g. 145.5"
                    />
                  </Field>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button type="submit" variant="accent" disabled={saving} className="flex-1">
                    {saving ? 'Saving…' : 'Save Vehicle / Vessel'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAddingVehicle(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </section>

          {/* Work Orders History Section */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Work Orders ({wos.length})
            </h3>
            {wos.length === 0 ? (
              <Card className="p-4 text-center text-xs text-slate-400">No work orders on file.</Card>
            ) : (
              <div className="space-y-2">
                {wos.map((w) => (
                  <Link key={w.id} to={`/work/${w.id}`}>
                    <Card className="flex items-center justify-between p-3.5 hover:border-amber-400/50">
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-600">{w.number}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{longDate(w.created_at)}</p>
                      </div>
                      <Badge status={w.status} />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
