import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  PlusIcon,
  SparklesIcon,
  VehicleIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  WrenchIcon,
  ScanIcon,
} from '../components/icons';
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
import { decodeVehicleVIN, type DecodedVehicleInfo } from '../lib/vinDecoder';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID } from '../lib/offlineSync';
import VinScannerModal from '../components/VinScannerModal';
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
    return safeFetchWithCache<CustomerFull | null>(
      `cust_${id}`,
      async () => {
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
      },
      null
    );
  }, [id]);

  // Customer Edit State
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [custForm, setCustForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });

  // Vehicle Add / Edit State
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [vinScannerOpen, setVinScannerOpen] = useState(false);
  const [v, setV] = useState(emptyVehicle);

  function handleVinDetected(scannedVin: string, decoded?: DecodedVehicleInfo) {
    setV((prev) => ({
      ...prev,
      vin: scannedVin,
      year: decoded?.year || prev.year,
      make: decoded?.make || prev.make,
      model: decoded?.model || prev.model,
      trim: decoded?.trim || prev.trim,
      engine_info: decoded?.engine_info || prev.engine_info,
      type: (decoded?.vehicle_type as VehicleType) || prev.type,
    }));
    toast(`✓ Scanned VIN: ${scannedVin} ${decoded?.make ? `(${decoded.make} ${decoded.model})` : ''}`);
  }

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

  function startEditCustomer() {
    setCustForm({
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || '',
    });
    setEditingCustomer(true);
  }

  async function handleSaveCustomer(e: FormEvent) {
    e.preventDefault();
    if (!custForm.first_name.trim() && !custForm.last_name.trim()) {
      toast('Please enter a customer name', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      first_name: custForm.first_name.trim(),
      last_name: custForm.last_name.trim(),
      phone: custForm.phone.trim(),
      email: custForm.email.trim(),
      address: custForm.address.trim(),
      notes: custForm.notes.trim(),
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        check(await requireSupabase().from('customers').update(payload).eq('id', c.id));
        toast('Customer details updated');
        await reload();
      } else {
        const updatedCust: CustomerFull = {
          ...c,
          ...payload,
        };
        cacheLocal(`cust_${c.id}`, updatedCust);
        enqueueOfflineAction({
          table: 'customers',
          type: 'update',
          payload,
          matchField: 'id',
          matchValue: c.id,
          description: `Update customer ${payload.first_name} ${payload.last_name}`,
        });
        toast('Customer details updated (Saved to device)');
        await reload();
      }
      setEditingCustomer(false);
    } catch (err: any) {
      toast(err.message || 'Could not update customer', 'error');
    } finally {
      setSaving(false);
    }
  }

  function startEditVehicle(veh: Vehicle) {
    setEditingVehicleId(veh.id);
    setV({
      type: (veh.type as VehicleType) || 'auto',
      year: veh.year ? String(veh.year) : '',
      make: veh.make || '',
      model: veh.model || '',
      trim: veh.trim || '',
      vin: veh.vin || '',
      plate: veh.plate || '',
      engine_hours: veh.engine_hours ? String(veh.engine_hours) : '',
      engine_info: veh.engine_info || '',
      engine_serial: veh.engine_serial || '',
      has_second_engine: Boolean(veh.engine2_info || veh.engine2_serial || veh.engine2_hours),
      engine2_info: veh.engine2_info || '',
      engine2_serial: veh.engine2_serial || '',
      engine2_hours: veh.engine2_hours ? String(veh.engine2_hours) : '',
    });
    setAddingVehicle(true);
  }

  async function handleDeleteVehicle(vehId: string, label: string) {
    if (!window.confirm(`Delete ${label} from this customer profile?`)) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        check(await requireSupabase().from('vehicles').delete().eq('id', vehId));
        toast('Vehicle / Vessel removed');
        await reload();
      } else {
        const remainingVehicles = (c.vehicles ?? []).filter((item) => item.id !== vehId);
        const updatedCust = { ...c, vehicles: remainingVehicles };
        cacheLocal(`cust_${c.id}`, updatedCust);
        enqueueOfflineAction({
          table: 'vehicles',
          type: 'delete',
          matchField: 'id',
          matchValue: vehId,
          description: `Delete vehicle ${label}`,
        });
        toast('Vehicle / Vessel removed (Saved to device)');
        await reload();
      }
    } catch (err: any) {
      toast(err.message || 'Failed to delete vehicle', 'error');
    }
  }

  async function handleDecodeVin() {
    const raw = v.vin.trim();
    if (!raw) {
      toast('Please enter a VIN or Hull ID first', 'error');
      return;
    }
    setDecoding(true);
    try {
      const decoded = await decodeVehicleVIN(raw);
      if (decoded.make || decoded.year || decoded.model) {
        setV((prev) => ({
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

  async function saveVehicle(e: FormEvent) {
    e.preventDefault();
    if (!v.make.trim() && !v.model.trim()) {
      toast('Please enter a make or model', 'error');
      return;
    }
    setSaving(true);
    const vehiclePayload = {
      customer_id: c.id,
      type: v.type,
      year: v.year ? Number(v.year) : null,
      make: v.make.trim(),
      model: v.model.trim(),
      trim: v.trim.trim(),
      vin: v.vin.trim().toUpperCase(),
      plate: v.plate.trim().toUpperCase(),
      engine_hours: v.engine_hours ? Number(v.engine_hours) : null,
      engine_info: v.engine_info.trim(),
      engine_serial: v.engine_serial.trim(),
      engine2_info: v.engine2_info.trim(),
      engine2_serial: v.engine2_serial.trim(),
      engine2_hours: v.engine2_hours ? Number(v.engine2_hours) : null,
    };

    try {
      if (editingVehicleId) {
        // Update existing vehicle
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          check(await requireSupabase().from('vehicles').update(vehiclePayload).eq('id', editingVehicleId));
          toast('Vehicle / Vessel updated');
          await reload();
        } else {
          const updatedVehicles = (c.vehicles ?? []).map((veh) =>
            veh.id === editingVehicleId ? { ...veh, ...vehiclePayload } : veh
          );
          const updatedCust = { ...c, vehicles: updatedVehicles };
          cacheLocal(`cust_${c.id}`, updatedCust);
          enqueueOfflineAction({
            table: 'vehicles',
            type: 'update',
            payload: vehiclePayload,
            matchField: 'id',
            matchValue: editingVehicleId,
            description: `Update vehicle ${vehiclePayload.make} ${vehiclePayload.model}`,
          });
          toast('Vehicle / Vessel updated (Saved to device)');
          await reload();
        }
      } else {
        // Insert new vehicle
        const vehId = generateUUID();
        const newPayloadWithId = { id: vehId, ...vehiclePayload };
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          check(await requireSupabase().from('vehicles').insert(newPayloadWithId));
          toast('Vehicle / Vessel added');
          await reload();
        } else {
          const tempVeh: Vehicle = {
            ...newPayloadWithId,
            created_at: new Date().toISOString(),
          };
          c.vehicles = [...(c.vehicles ?? []), tempVeh];
          cacheLocal(`cust_${c.id}`, c);
          enqueueOfflineAction({
            table: 'vehicles',
            type: 'insert',
            payload: newPayloadWithId,
            description: `Add vehicle for ${fullName(c)}`,
          });
          toast('Vehicle / Vessel added (Saved to device)');
        }
      }

      setV(emptyVehicle);
      setAddingVehicle(false);
      setEditingVehicleId(null);
    } catch (err: any) {
      toast(err.message || 'Could not save vehicle', 'error');
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={startEditCustomer}
              className="text-xs font-bold"
            >
              <PencilIcon className="h-3.5 w-3.5 mr-1" /> Edit Profile
            </Button>
            <Link to={`/work/new?customer=${c.id}`}>
              <Button variant="accent" className="text-xs font-bold">
                + New Repair Order (RO)
              </Button>
            </Link>
          </div>
        }
      />

      {/* Edit Customer Form (Modal/Inline) */}
      {editingCustomer && (
        <form
          onSubmit={handleSaveCustomer}
          className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-900/10 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Edit Customer Details
              </h3>
              <p className="text-xs text-slate-500">
                Update name, phone number, email, billing/service address, and customer notes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First Name *">
              <Input
                value={custForm.first_name}
                onChange={(e) => setCustForm({ ...custForm, first_name: e.target.value })}
                required
                placeholder="First name"
              />
            </Field>
            <Field label="Last Name">
              <Input
                value={custForm.last_name}
                onChange={(e) => setCustForm({ ...custForm, last_name: e.target.value })}
                placeholder="Last name"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone Number">
              <Input
                value={custForm.phone}
                onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                placeholder="(406) 555-0199"
                type="tel"
              />
            </Field>
            <Field label="Email Address">
              <Input
                value={custForm.email}
                onChange={(e) => setCustForm({ ...custForm, email: e.target.value })}
                placeholder="customer@email.com"
                type="email"
              />
            </Field>
          </div>

          <Field label="Street Address / City / State / Zip">
            <Input
              value={custForm.address}
              onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
              placeholder="123 Main St, Helena, MT 59601"
            />
          </Field>

          <Field label="Customer Account Notes (Internal)">
            <textarea
              value={custForm.notes}
              onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
              placeholder="e.g. VIP client, preferred tech, gate code, fleet discount..."
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="accent" disabled={saving} className="flex-1 font-bold">
              {saving ? 'Saving…' : 'Save Customer Profile'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditingCustomer(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Responsive 2-Column Desktop Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (5 Cols on desktop): Customer Info & Invoices */}
        <div className="space-y-5 lg:col-span-5">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Contact Info</h3>
              <button
                type="button"
                onClick={startEditCustomer}
                className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                <PencilIcon className="h-3 w-3" /> Edit
              </button>
            </div>

            {c.phone ? (
              <a
                href={`tel:${c.phone}`}
                className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-950"
              >
                <PhoneIcon className="h-4 w-4 text-slate-400" />
                {c.phone}
              </a>
            ) : (
              <p className="text-xs text-slate-400 italic">No phone number on file</p>
            )}

            {c.email ? (
              <a
                href={`mailto:${c.email}`}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900"
              >
                <MailIcon className="h-4 w-4 text-slate-400" />
                {c.email}
              </a>
            ) : (
              <p className="text-xs text-slate-400 italic">No email on file</p>
            )}

            {c.address ? (
              <p className="flex items-center gap-2 text-xs text-slate-600">
                <MapPinIcon className="h-4 w-4 text-slate-400" />
                {c.address}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No address on file</p>
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
                    <Card className="flex items-center justify-between p-3.5 hover:border-orange-400/50 transition">
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
                  onClick={() => {
                    setEditingVehicleId(null);
                    setV(emptyVehicle);
                    setAddingVehicle(true);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> + Add Vehicle
                </button>
              )}
            </div>

            {/* Vehicle Add / Edit Form */}
            {addingVehicle && (
              <form onSubmit={saveVehicle} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    {editingVehicleId ? 'Edit Vehicle / Vessel' : 'Add Vehicle or Equipment'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setVinScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-orange-500/20 hover:bg-orange-400 transition active:scale-95"
                  >
                    <ScanIcon className="h-4 w-4" />
                    <span>📷 Scan VIN</span>
                  </button>
                </div>

                <Field label="Category">
                  <Select
                    value={v.type}
                    onChange={(e) => setV({ ...v, type: e.target.value as VehicleType })}
                  >
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
                      value={v.year}
                      onChange={(e) => setV({ ...v, year: e.target.value })}
                      type="number"
                      min="1900"
                      max="2035"
                      placeholder="2024"
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
                        required
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Model *">
                      <Input
                        value={v.model}
                        onChange={(e) => setV({ ...v, model: e.target.value })}
                        placeholder="e.g. 1875 Pro-V / F-150 / Ranger"
                        required
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={currentTypeInfo.idLabel}>
                    <div className="flex gap-2">
                      <Input
                        value={v.vin}
                        onChange={(e) => setV({ ...v, vin: e.target.value.toUpperCase() })}
                        placeholder={v.type === 'marine' ? 'HIN # (12 chars)' : 'VIN (17 chars)'}
                        className="font-mono uppercase text-xs flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleDecodeVin}
                        disabled={decoding || !v.vin.trim()}
                        className="flex items-center gap-1 rounded-xl bg-orange-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-orange-300 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs"
                      >
                        <SparklesIcon className="h-3.5 w-3.5" />
                        <span>{decoding ? 'Decoding…' : 'Decode'}</span>
                      </button>
                    </div>
                  </Field>
                  <Field label={currentTypeInfo.regLabel}>
                    <Input
                      value={v.plate}
                      onChange={(e) => setV({ ...v, plate: e.target.value.toUpperCase() })}
                      placeholder={v.type === 'marine' ? 'e.g. MT-1234-AB' : 'Plate / Tag #'}
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
                  <Button type="submit" variant="accent" disabled={saving} className="flex-1 font-bold">
                    {saving ? 'Saving…' : editingVehicleId ? 'Update Vehicle' : 'Save Vehicle / Vessel'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAddingVehicle(false);
                      setEditingVehicleId(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {vehs.length === 0 && !addingVehicle ? (
              <Card className="p-4 text-center text-xs text-slate-400">
                No vehicles or vessels attached to this customer.
              </Card>
            ) : (
              <div className="space-y-2.5">
                {vehs.map((veh) => {
                  const info = getVehicleTypeInfo(veh.type);
                  return (
                    <Card key={veh.id} className="p-3.5 hover:border-orange-400/50 transition">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <VehicleIcon type={veh.type} className="h-4 w-4 text-slate-700 shrink-0" />
                            <span className="text-xs font-bold text-slate-900 truncate">
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
                                  {veh.type === 'marine' && veh.engine2_info ? 'Main Motor:' : 'Engine / Motor:'}
                                </span>
                                {veh.engine_hours && (
                                  <span className="inline-flex items-center gap-1 text-orange-800">
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
                                <span>Second Motor / Aux:</span>
                                {veh.engine2_hours && (
                                  <span className="inline-flex items-center gap-1 text-orange-800">
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

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Link
                            to={`/work/new?customer=${c.id}&vehicle=${veh.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-orange-400 px-2 py-1 text-[11px] font-black text-slate-950 hover:bg-orange-300 transition shadow-2xs"
                            title="Start new repair order for this machine"
                          >
                            <WrenchIcon className="h-3 w-3" />
                            <span>+ RO</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => startEditVehicle(veh)}
                            className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                            title="Edit vehicle details"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVehicle(veh.id, vehicleLabel(veh))}
                            className="rounded-lg border border-slate-200 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete vehicle"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Repair Orders History Section */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Repair Orders ({wos.length})
            </h3>
            {wos.length === 0 ? (
              <Card className="p-4 text-center text-xs text-slate-400">No repair orders on file.</Card>
            ) : (
              <div className="space-y-2">
                {wos.map((w) => (
                  <Link key={w.id} to={`/work/${w.id}`}>
                    <Card className="flex items-center justify-between p-3.5 hover:border-orange-400/50 transition">
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

      {/* Vehicle VIN / HIN Scanner Modal */}
      <VinScannerModal
        isOpen={vinScannerOpen}
        onClose={() => setVinScannerOpen(false)}
        onVinDetected={handleVinDetected}
      />
    </div>
  );
}
