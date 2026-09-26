import { useState, useMemo, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  BanknotesIcon,
  BoxIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  TrashIcon,
  VehicleIcon,
  WrenchIcon,
} from '../components/icons';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
} from '../components/ui';
import { useAsync } from '../lib/hooks';
import { money, num, shortDate, fullName, VEHICLE_TYPES } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID } from '../lib/offlineSync';
import { decodeVehicleVIN } from '../lib/vinDecoder';
import { useShopSettings } from '../lib/settings';
import type { DealershipUnit, BuyersOrderFull, UnitCondition, UnitStatus, VehicleType } from '../types';

const emptyUnit = {
  stock_number: '',
  condition: 'new' as UnitCondition,
  type: 'motorcycle' as VehicleType,
  year: new Date().getFullYear().toString(),
  make: '',
  model: '',
  trim: '',
  vin: '',
  color: '',
  mileage_or_hours: '0',
  engine_info: '',
  engine_serial: '',
  cost_price: '',
  msrp_price: '',
  sale_price: '',
  location: 'Main Showroom',
  notes: '',
};

export default function Sales() {
  const toast = useToast();
  const navigate = useNavigate();
  const { settings } = useShopSettings();

  const [activeTab, setActiveTab] = useState<'units' | 'deals'>('units');
  const [filterCondition, setFilterCondition] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<DealershipUnit | null>(null);
  const [form, setForm] = useState(emptyUnit);
  const [decoding, setDecoding] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache(
      'dealership_sales_data',
      async () => {
        const sb = requireSupabase();
        const [unitsRes, dealsRes] = await Promise.all([
          sb.from('dealership_units').select('*').order('created_at', { ascending: false }),
          sb.from('buyers_orders').select('*, customer:customers(*)').order('created_at', { ascending: false }),
        ]);
        check(unitsRes);
        check(dealsRes);
        return {
          units: (unitsRes.data ?? []) as DealershipUnit[],
          deals: (dealsRes.data ?? []) as BuyersOrderFull[],
        };
      },
      { units: [], deals: [] }
    );
  }, []);

  const allUnits = data?.units ?? [];
  const allDeals = data?.deals ?? [];

  // Metrics
  const inStockUnits = allUnits.filter((u) => u.status === 'in_stock' || u.status === 'sale_pending');
  const totalShowroomValue = inStockUnits.reduce((sum, u) => sum + num(u.sale_price || u.msrp_price), 0);
  const totalCostValue = inStockUnits.reduce((sum, u) => sum + num(u.cost_price), 0);
  const soldUnits = allUnits.filter((u) => u.status === 'sold');

  // Filtered Units List
  const filteredUnits = useMemo(() => {
    let list = allUnits;
    if (filterCondition !== 'all') {
      if (filterCondition === 'in_stock') {
        list = list.filter((u) => u.status === 'in_stock');
      } else if (filterCondition === 'sold') {
        list = list.filter((u) => u.status === 'sold');
      } else {
        list = list.filter((u) => u.condition === filterCondition);
      }
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((u) => {
      const matchMake = (u.make || '').toLowerCase().includes(q);
      const matchModel = (u.model || '').toLowerCase().includes(q);
      const matchVin = (u.vin || '').toLowerCase().includes(q);
      const matchStock = (u.stock_number || '').toLowerCase().includes(q);
      const matchYear = String(u.year || '').includes(q);
      return matchMake || matchModel || matchVin || matchStock || matchYear;
    });
  }, [allUnits, filterCondition, searchQuery]);

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

  async function handleSaveUnit(e: FormEvent) {
    e.preventDefault();
    if (!form.make.trim() || !form.model.trim()) {
      toast('Make and Model are required', 'error');
      return;
    }
    setSaving(true);

    const unitPayload = {
      stock_number: form.stock_number.trim() || `STK-${Date.now().toString().slice(-4)}`,
      condition: form.condition,
      type: form.type,
      year: parseInt(form.year, 10) || new Date().getFullYear(),
      make: form.make.trim(),
      model: form.model.trim(),
      trim: form.trim.trim(),
      vin: form.vin.trim().toUpperCase(),
      color: form.color.trim(),
      mileage_or_hours: form.mileage_or_hours.trim(),
      engine_info: form.engine_info.trim(),
      engine_serial: form.engine_serial.trim(),
      cost_price: num(form.cost_price),
      msrp_price: num(form.msrp_price),
      sale_price: num(form.sale_price) || num(form.msrp_price),
      status: editingUnit ? editingUnit.status : ('in_stock' as UnitStatus),
      location: form.location.trim() || 'Main Showroom',
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        if (editingUnit) {
          check(await sb.from('dealership_units').update(unitPayload).eq('id', editingUnit.id));
          toast('Unit updated');
        } else {
          check(await sb.from('dealership_units').insert(unitPayload));
          toast('Showroom unit added');
        }
        await reload();
      } else {
        // Offline handling
        if (editingUnit) {
          enqueueOfflineAction({
            table: 'dealership_units',
            type: 'update',
            payload: unitPayload,
            matchField: 'id',
            matchValue: editingUnit.id,
            description: `Update unit ${unitPayload.make} ${unitPayload.model}`,
          });
          const updated = allUnits.map((u) =>
            u.id === editingUnit.id ? { ...u, ...unitPayload } : u
          );
          cacheLocal('dealership_sales_data', { units: updated, deals: allDeals });
          toast('Unit updated (Saved offline)');
        } else {
          const tempId = generateUUID();
          const newUnitData: DealershipUnit = {
            id: tempId,
            ...unitPayload,
            created_at: new Date().toISOString(),
          };
          enqueueOfflineAction({
            table: 'dealership_units',
            type: 'insert',
            payload: newUnitData,
            description: `Add unit ${unitPayload.make} ${unitPayload.model}`,
          });
          cacheLocal('dealership_sales_data', { units: [newUnitData, ...allUnits], deals: allDeals });
          toast('Unit added (Saved offline)');
        }
      }

      setForm(emptyUnit);
      setAddingUnit(false);
      setEditingUnit(null);
    } catch (err: any) {
      toast(err.message || 'Failed to save unit', 'error');
    } finally {
      setSaving(false);
    }
  }

  // 1-Tap PDI Dispatch (Creates an Uncrate / Assembly / PDI Work Order for the shop techs)
  async function dispatchPDIWorkOrder(unit: DealershipUnit) {
    if (!window.confirm(`Create a PDI & Assembly Repair Order for ${unit.year} ${unit.make} ${unit.model}?`)) return;

    try {
      const sb = requireSupabase();
      const woNumber = `RO-${Date.now().toString().slice(-4)}`;
      const woPayload = {
        number: woNumber,
        status: 'open',
        notes: `PRE-DELIVERY INSPECTION & ASSEMBLY (PDI)\nStock #: ${unit.stock_number}\nVIN: ${unit.vin}\nColor: ${unit.color}\nLocation: ${unit.location || 'Showroom'}`,
        mileage_or_hours: unit.mileage_or_hours || '0.0 hrs',
      };

      // Find or create Dealer Internal Customer
      const custRes = await sb.from('customers').select('id').eq('first_name', 'Showroom / Dealership').limit(1);
      let customerId = custRes.data?.[0]?.id;
      if (!customerId) {
        const newCustRes = await sb.from('customers').insert({
          first_name: 'Showroom / Dealership',
          last_name: 'Internal Unit',
          phone: settings.phone || '406-555-0100',
          email: settings.email || 'sales@outlawshopsystems.com',
          notes: 'Internal dealership inventory unit',
        }).select('id').single();
        customerId = newCustRes.data?.id;
      }

      const newWo = check(
        await sb.from('work_orders').insert({
          ...woPayload,
          customer_id: customerId,
        }).select('id').single()
      );

      const woId = newWo.data?.id;
      if (woId) {
        // Add PDI Labor & Prep work items
        await sb.from('work_items').insert([
          {
            work_order_id: woId,
            kind: 'labor',
            name: 'Uncrate, Assemble, Battery Prep & Fluid Fill',
            quantity: 2.0,
            unit_price: num(settings.default_labor_rate) || 95,
            sort_order: 1,
          },
          {
            work_order_id: woId,
            kind: 'labor',
            name: 'Safety Inspection, Tire Pressure & Test Run',
            quantity: 0.5,
            unit_price: num(settings.default_labor_rate) || 95,
            sort_order: 2,
          },
        ]);

        toast(`PDI Work Order created (${woNumber})!`);
        navigate(`/work/${woId}`);
      } else {
        toast(`PDI Work Order created (${woNumber})!`);
        navigate('/work');
      }
    } catch (err: any) {
      toast(err.message || 'Could not dispatch PDI work order', 'error');
    }
  }

  async function deleteUnit(id: string) {
    if (!window.confirm('Delete this unit from inventory?')) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const sb = requireSupabase();
        check(await sb.from('dealership_units').delete().eq('id', id));
        toast('Unit deleted');
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'dealership_units',
          type: 'delete',
          matchField: 'id',
          matchValue: id,
          description: 'Delete unit',
        });
        const remaining = allUnits.filter((u) => u.id !== id);
        cacheLocal('dealership_sales_data', { units: remaining, deals: allDeals });
        toast('Unit deleted (Saved offline)');
      }
    } catch (err: any) {
      toast(err.message || 'Could not delete unit', 'error');
    }
  }

  function startEditUnit(u: DealershipUnit) {
    setEditingUnit(u);
    setForm({
      stock_number: u.stock_number || '',
      condition: u.condition || 'new',
      type: u.type || 'motorcycle',
      year: String(u.year || ''),
      make: u.make || '',
      model: u.model || '',
      trim: u.trim || '',
      vin: u.vin || '',
      color: u.color || '',
      mileage_or_hours: u.mileage_or_hours || '',
      engine_info: u.engine_info || '',
      engine_serial: u.engine_serial || '',
      cost_price: String(u.cost_price || ''),
      msrp_price: String(u.msrp_price || ''),
      sale_price: String(u.sale_price || ''),
      location: u.location || 'Main Showroom',
      notes: u.notes || '',
    });
    setAddingUnit(true);
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      {/* Header & Main Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle
            title="Showroom &amp; Unit Sales"
            sub={`${inStockUnits.length} units in stock · ${money(totalShowroomValue)} retail floor value`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!addingUnit && (
            <>
              <Link
                to="/sales/deal/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow transition hover:bg-slate-800"
              >
                <ReceiptIcon className="h-4 w-4 text-amber-400" />
                <span>+ Write Buyer's Order</span>
              </Link>
              <Button
                variant="accent"
                onClick={() => {
                  setEditingUnit(null);
                  setForm(emptyUnit);
                  setAddingUnit(true);
                }}
                className="text-xs font-bold"
              >
                <PlusIcon className="h-4 w-4" /> Add Unit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Top 4 Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">In-Stock Units</p>
          <p className="text-2xl font-black text-slate-900">{inStockUnits.length}</p>
          <p className="text-[11px] text-slate-500">Available on floor</p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Floor MSRP</p>
          <p className="text-2xl font-black text-emerald-600">{money(totalShowroomValue)}</p>
          <p className="text-[11px] text-slate-500">Cost: <strong className="text-slate-700">{money(totalCostValue)}</strong></p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer's Orders</p>
          <p className="text-2xl font-black text-slate-900">{allDeals.length}</p>
          <p className="text-[11px] text-slate-500">Deals generated</p>
        </Card>

        <Card className="p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sold Units</p>
          <p className="text-2xl font-black text-amber-600">{soldUnits.length}</p>
          <p className="text-[11px] text-slate-500">Delivered to customers</p>
        </Card>
      </div>

      {/* Section Subtabs: Showroom Units vs Buyer's Orders */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('units')}
          className={`pb-2.5 transition border-b-2 ${
            activeTab === 'units'
              ? 'border-amber-500 text-slate-950 font-black'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          Showroom Units ({allUnits.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('deals')}
          className={`pb-2.5 transition border-b-2 ${
            activeTab === 'deals'
              ? 'border-amber-500 text-slate-950 font-black'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          Buyer's Orders &amp; Bills of Sale ({allDeals.length})
        </button>
      </div>

      {/* Add / Edit Unit Form */}
      {addingUnit && (
        <form
          onSubmit={handleSaveUnit}
          className="space-y-4 rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-900/10 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                {editingUnit ? 'Edit Showroom Unit' : 'Add New Unit / Motorcycle / ATV'}
              </h3>
              <p className="text-xs text-slate-500">
                Enter vehicle specs, VIN, dealer cost, and advertised price.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
              {form.condition.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Condition">
              <Select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as UnitCondition })}
              >
                <option value="new">New (Crate / Factory)</option>
                <option value="used">Pre-Owned / Trade</option>
                <option value="consignment">Consignment</option>
              </Select>
            </Field>

            <Field label="Category">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as VehicleType })}
              >
                {Object.values(VEHICLE_TYPES).map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Stock Number">
              <Input
                value={form.stock_number}
                onChange={(e) => setForm({ ...form, stock_number: e.target.value })}
                placeholder="e.g. STK-2024-042"
              />
            </Field>
          </div>

          {/* 1-Tap VIN / HIN Decoder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="VIN / Hull ID (1-Tap Auto-Fill)">
              <div className="flex gap-2">
                <Input
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                  placeholder="17-Digit VIN or 12-Digit HIN"
                  className="font-mono uppercase text-xs flex-1"
                />
                <button
                  type="button"
                  onClick={handleDecodeVin}
                  disabled={decoding || !form.vin.trim()}
                  className="flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  <span>{decoding ? 'Decoding…' : 'Decode'}</span>
                </button>
              </div>
            </Field>

            <Field label="Color / Graphics">
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="e.g. Champion Yellow / Matte Black"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Year">
              <Input
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                type="number"
                min="1980"
                max="2035"
                placeholder="2024"
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Make / Brand *">
                <Input
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                  placeholder="e.g. Suzuki / Beta / KYMCO / SSR"
                  required
                />
              </Field>
            </div>
            <Field label="Model *">
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. RM-Z450 / 300 RR"
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Trim / Edition">
              <Input
                value={form.trim}
                onChange={(e) => setForm({ ...form, trim: e.target.value })}
                placeholder="e.g. Race Edition / 4-Stroke"
              />
            </Field>
            <Field label="Engine Specs / Motor">
              <Input
                value={form.engine_info}
                onChange={(e) => setForm({ ...form, engine_info: e.target.value })}
                placeholder="e.g. 449cc DOHC Liquid Cooled"
              />
            </Field>
            <Field label="Hours / Odometer">
              <Input
                value={form.mileage_or_hours}
                onChange={(e) => setForm({ ...form, mileage_or_hours: e.target.value })}
                placeholder="e.g. 0.0 hrs / 1,420 mi"
              />
            </Field>
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl bg-slate-50 p-3.5 border border-slate-200">
            <Field label="Dealer Invoice / Cost ($)">
              <Input
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </Field>
            <Field label="Factory MSRP ($)">
              <Input
                value={form.msrp_price}
                onChange={(e) => setForm({ ...form, msrp_price: e.target.value })}
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </Field>
            <Field label="Advertised Sale Price ($)">
              <Input
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="accent" disabled={saving} className="flex-1 font-bold">
              {saving ? 'Saving…' : editingUnit ? 'Update Unit' : 'Save Unit to Showroom'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAddingUnit(false);
                setEditingUnit(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* 1. Showroom Units Tab */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          {/* Search & Filter Chips */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md w-full">
              <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Make, Model, Stock #, VIN…"
                className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs shadow-sm ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
              {[
                { id: 'all', label: 'All Units' },
                { id: 'in_stock', label: 'In Stock' },
                { id: 'new', label: 'New' },
                { id: 'used', label: 'Used' },
                { id: 'sold', label: 'Sold' },
              ].map((c) => (
                <Chip
                  key={c.id}
                  active={filterCondition === c.id}
                  onClick={() => setFilterCondition(c.id)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>

          {filteredUnits.length === 0 ? (
            <EmptyState
              icon={<BoxIcon className="h-8 w-8" />}
              title="No showroom units found"
              sub="Add your first motorcycle, ATV, or boat to track showroom floor inventory and write buyer's orders."
              action={
                <Button
                  variant="accent"
                  onClick={() => {
                    setForm(emptyUnit);
                    setAddingUnit(true);
                  }}
                  className="text-xs"
                >
                  + Add First Unit
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredUnits.map((u) => {
                const margin =
                  num(u.sale_price || u.msrp_price) - num(u.cost_price);
                const marginPct =
                  num(u.sale_price) > 0
                    ? ((margin / num(u.sale_price)) * 100).toFixed(1)
                    : '0';

                return (
                  <Card key={u.id} className="p-4 space-y-3 hover:border-amber-400/60 transition flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                            {u.stock_number || 'STK'}
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                            u.condition === 'new' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {u.condition}
                          </span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          u.status === 'sold'
                            ? 'bg-slate-200 text-slate-600'
                            : u.status === 'sale_pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {u.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <VehicleIcon type={u.type} className="h-4 w-4 text-amber-600 shrink-0" />
                          <h4 className="text-sm font-black text-slate-900 truncate">
                            {u.year} {u.make} {u.model}
                          </h4>
                        </div>
                        {u.trim && <p className="text-xs text-slate-600 mt-0.5">{u.trim}</p>}
                        {u.color && <p className="text-[11px] text-slate-400">{u.color}</p>}
                      </div>

                      {u.vin && (
                        <p className="font-mono text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          VIN: <strong className="text-slate-800">{u.vin}</strong>
                        </p>
                      )}

                      <div className="flex items-baseline justify-between border-t border-slate-100 pt-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Sale Price</span>
                          <span className="text-base font-black text-slate-900">
                            {money(u.sale_price || u.msrp_price)}
                          </span>
                        </div>
                        {num(u.cost_price) > 0 && (
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase font-bold">Margin</span>
                            <span className="font-mono text-xs font-bold text-emerald-700">
                              {money(margin)} ({marginPct}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/sales/deal/new?unit_id=${u.id}`}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-amber-400 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition shadow-xs"
                      >
                        <ReceiptIcon className="h-3.5 w-3.5" />
                        <span>Buyer's Order</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => dispatchPDIWorkOrder(u)}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                        title="Create PDI & Assembly ticket for service shop"
                      >
                        <WrenchIcon className="h-3.5 w-3.5 text-amber-600" />
                        <span>PDI</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditUnit(u)}
                        className="rounded-xl border border-slate-200 p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        title="Edit unit"
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteUnit(u.id)}
                        className="rounded-xl border border-slate-200 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete unit"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Buyer's Orders / Deals Tab */}
      {activeTab === 'deals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Recent Buyer's Orders &amp; Deal Sheets
            </h3>
            <Link
              to="/sales/deal/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 shadow hover:bg-amber-300"
            >
              <PlusIcon className="h-4 w-4" /> New Buyer's Order
            </Link>
          </div>

          {allDeals.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon className="h-8 w-8" />}
              title="No Buyer's Orders yet"
              sub="Create your first unit deal sheet with itemized freight, prep, documentation fees, trade-ins, and customer bill of sale."
              action={
                <Link
                  to="/sales/deal/new"
                  className="inline-flex rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950"
                >
                  Write First Deal
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allDeals.map((d) => (
                <Link
                  key={d.id}
                  to={`/sales/deal/${d.id}`}
                  className="block transition hover:-translate-y-0.5"
                >
                  <Card className="p-4 space-y-2 hover:border-amber-400/60">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-500">{d.order_number}</span>
                      <Badge status={d.status === 'completed' ? 'paid' : d.status === 'quote' ? 'draft' : 'unpaid'} />
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {fullName(d.customer)}
                      </p>
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">
                        {d.unit_year} {d.unit_make} {d.unit_model}
                      </p>
                      {d.unit_vin && (
                        <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                          VIN: {d.unit_vin}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-slate-400">{shortDate(d.created_at)}</span>
                      <span className="text-sm font-black text-slate-900">{money(d.total_price)}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
