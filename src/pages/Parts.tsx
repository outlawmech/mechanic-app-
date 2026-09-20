import { useState, type FormEvent } from 'react';
import { useToast } from '../components/Toast';
import {
  AlertCircleIcon,
  BoxIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '../components/icons';
import {
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
import { money, num, round2 } from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { Part } from '../types';

const CATEGORIES = [
  'General',
  'Filters',
  'Fluids & Oils',
  'Marine Cooling & Impellers',
  'Ignition & Spark Plugs',
  'Brakes & Hydraulics',
  'Electrical & Batteries',
  'Belts & Hoses',
  'Fuel System',
  'Hardware & Fasteners',
  'Tires & Tracks',
];

const emptyPart = {
  sku: '',
  name: '',
  category: 'General',
  cost_price: '',
  sell_price: '',
  qty_on_hand: '1',
  reorder_point: '0',
  location: '',
  supplier: '',
  notes: '',
};

export default function Parts() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'low_stock'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [addingPart, setAddingPart] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [form, setForm] = useState(emptyPart);
  const [saving, setSaving] = useState(false);

  const { data: parts, error, loading, reload } = useAsync(async () => {
    const sb = requireSupabase();
    const res = check(await sb.from('parts').select('*').order('name'));
    return (res.data ?? []) as Part[];
  }, []);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const allParts = parts ?? [];

  // Metrics
  const totalSkus = allParts.length;
  const lowStockCount = allParts.filter(
    (p) => num(p.qty_on_hand) <= num(p.reorder_point) && num(p.reorder_point) > 0
  ).length;
  const totalCostValue = round2(
    allParts.reduce((sum, p) => sum + num(p.cost_price) * num(p.qty_on_hand), 0)
  );
  const totalRetailValue = round2(
    allParts.reduce((sum, p) => sum + num(p.sell_price) * num(p.qty_on_hand), 0)
  );

  // Filtered list
  const filteredParts = allParts.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.supplier.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (activeTab === 'low_stock') {
      return num(p.qty_on_hand) <= num(p.reorder_point) && num(p.reorder_point) > 0;
    }
    if (categoryFilter) {
      return p.category === categoryFilter;
    }
    return true;
  });

  async function handleSavePart(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast('Part name / description is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const sb = requireSupabase();
      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        category: form.category || 'General',
        cost_price: Number(form.cost_price) || 0,
        sell_price: Number(form.sell_price) || 0,
        qty_on_hand: Number(form.qty_on_hand) || 0,
        reorder_point: Number(form.reorder_point) || 0,
        location: form.location.trim(),
        supplier: form.supplier.trim(),
        notes: form.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      if (editingPart) {
        check(await sb.from('parts').update(payload).eq('id', editingPart.id));
        toast('Part updated');
      } else {
        check(await sb.from('parts').insert(payload));
        toast('Part added to inventory');
      }

      setForm(emptyPart);
      setAddingPart(false);
      setEditingPart(null);
      await reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function adjustStock(part: Part, delta: number) {
    const newQty = Math.max(0, num(part.qty_on_hand) + delta);
    try {
      const sb = requireSupabase();
      check(await sb.from('parts').update({ qty_on_hand: newQty }).eq('id', part.id));
      await reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  async function deletePart(id: string) {
    if (!window.confirm('Delete this part from inventory?')) return;
    try {
      const sb = requireSupabase();
      check(await sb.from('parts').delete().eq('id', id));
      toast('Part deleted');
      await reload();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  function startEdit(p: Part) {
    setEditingPart(p);
    setForm({
      sku: p.sku,
      name: p.name,
      category: p.category || 'General',
      cost_price: String(p.cost_price || ''),
      sell_price: String(p.sell_price || ''),
      qty_on_hand: String(p.qty_on_hand || '0'),
      reorder_point: String(p.reorder_point || '0'),
      location: p.location || '',
      supplier: p.supplier || '',
      notes: p.notes || '',
    });
    setAddingPart(true);
  }

  // Live margin % calculation
  const formCost = Number(form.cost_price) || 0;
  const formSell = Number(form.sell_price) || 0;
  const marginPct =
    formSell > 0 ? (((formSell - formCost) / formSell) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle title="Parts &amp; Inventory" sub={`${totalSkus} SKUs in inventory`} />
        {!addingPart && (
          <Button
            variant="accent"
            onClick={() => {
              setEditingPart(null);
              setForm(emptyPart);
              setAddingPart(true);
            }}
            className="text-xs"
          >
            <PlusIcon className="h-4 w-4" /> Add Part
          </Button>
        )}
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total SKUs</p>
          <p className="mt-0.5 text-base font-bold text-slate-900">{totalSkus}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Low Stock</p>
          <p
            className={`mt-0.5 text-base font-bold ${
              lowStockCount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-900'
            }`}
          >
            {lowStockCount}
          </p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Stock Value</p>
          <p className="mt-0.5 text-xs font-bold text-slate-900">{money(totalRetailValue)}</p>
        </Card>
      </div>

      {/* Add / Edit Part Form */}
      {addingPart && (
        <form
          onSubmit={handleSavePart}
          className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              {editingPart ? 'Edit Part' : 'Add New Part to Inventory'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setAddingPart(false);
                setEditingPart(null);
              }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Part # / SKU">
              <Input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="e.g. WIX-51348"
              />
            </Field>
            <div className="col-span-2">
              <Field label="Part Name / Description *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Spin-on Oil Filter"
                  required
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Location / Bin / Shelf">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Bin 3B / Truck Shelf 2"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Cost Price ($)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Sell Price ($)">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.sell_price}
                onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Gross Margin">
              <div className="flex h-11 items-center rounded-xl bg-slate-50 px-3 text-xs font-bold text-emerald-700">
                {marginPct}%
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Qty On Hand">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.qty_on_hand}
                onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })}
                placeholder="1"
              />
            </Field>
            <Field label="Reorder Point">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.reorder_point}
                onChange={(e) => setForm({ ...form, reorder_point: e.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Vendor / Supplier">
              <Input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="e.g. NAPA / O'Reilly"
              />
            </Field>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="accent" disabled={saving} className="flex-1">
              {saving ? 'Saving…' : editingPart ? 'Update Part' : 'Save to Inventory'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAddingPart(false);
                setEditingPart(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts by SKU, name, bin, vendor…"
            className="h-10 w-full rounded-xl bg-white pl-10 pr-4 text-xs shadow-sm ring-1 ring-slate-900/10 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            onClick={() => {
              setActiveTab('all');
              setCategoryFilter('');
            }}
            className={`rounded-lg px-3 py-1.5 font-medium transition whitespace-nowrap ${
              activeTab === 'all' && !categoryFilter
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-900/5'
            }`}
          >
            All Parts ({allParts.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('low_stock');
              setCategoryFilter('');
            }}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium transition whitespace-nowrap ${
              activeTab === 'low_stock'
                ? 'bg-amber-500 text-white font-bold'
                : 'bg-white text-amber-700 ring-1 ring-amber-300'
            }`}
          >
            <AlertCircleIcon className="h-3.5 w-3.5" />
            Low Stock ({lowStockCount})
          </button>
        </div>
      </div>

      {/* Parts List */}
      {filteredParts.length === 0 ? (
        <EmptyState
          icon={<BoxIcon className="h-8 w-8" />}
          title={search ? 'No matching parts' : 'No inventory items yet'}
          sub={
            search
              ? 'Try a different part number or description search.'
              : 'Add stocked parts, fluids, filters, or shop supplies to track inventory.'
          }
          action={
            !addingPart && (
              <Button variant="accent" onClick={() => setAddingPart(true)}>
                + Add First Part
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredParts.map((part) => {
            const isLowStock =
              num(part.qty_on_hand) <= num(part.reorder_point) && num(part.reorder_point) > 0;

            return (
              <Card key={part.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {part.sku && (
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          {part.sku}
                        </span>
                      )}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {part.category}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm font-semibold text-slate-900">{part.name}</p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        Sell: <strong className="text-slate-800">{money(part.sell_price)}</strong>
                      </span>
                      {num(part.cost_price) > 0 && (
                        <span>Cost: {money(part.cost_price)}</span>
                      )}
                      {part.location && (
                        <span className="flex items-center gap-0.5 text-slate-600">
                          <MapPinIcon className="h-3 w-3 text-slate-400" /> {part.location}
                        </span>
                      )}
                      {part.supplier && <span>Vendor: {part.supplier}</span>}
                    </div>
                  </div>

                  {/* Stock Level & Quick Adjust */}
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          isLowStock
                            ? 'bg-red-100 text-red-700 ring-1 ring-red-400/30'
                            : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                        }`}
                      >
                        {part.qty_on_hand} in stock
                      </span>
                    </div>

                    {/* Stock Quick + / - Adjuster */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => adjustStock(part, -1)}
                        className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
                        title="Deduct 1"
                      >
                        -
                      </button>
                      <button
                        onClick={() => adjustStock(part, 1)}
                        className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95"
                        title="Add 1"
                      >
                        +
                      </button>
                      <button
                        onClick={() => startEdit(part)}
                        className="ml-1 text-[11px] font-semibold text-slate-500 underline hover:text-slate-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePart(part.id)}
                        className="text-slate-300 hover:text-red-500"
                        title="Delete part"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
