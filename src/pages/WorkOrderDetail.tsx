import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  BoxIcon,
  ChevronRightIcon,
  ClockIcon,
  MailIcon,
  SearchIcon,
  SendIcon,
  ShareIcon,
  TrashIcon,
  CheckIcon,
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
  Textarea,
} from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useShopSettings } from '../lib/settings';
import {
  formatEstimateText,
  fullName,
  getVehicleTypeInfo,
  longDate,
  money,
  num,
  round2,
  vehicleLabel,
  workOrderEstimate,
} from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { InvoiceSummary, Part, WorkItem, WorkOrderFull, WorkOrderStatus } from '../types';

const KIND_LABEL: Record<WorkItem['kind'], string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };
const KIND_CLS: Record<WorkItem['kind'], string> = {
  labor: 'bg-blue-50 text-blue-600',
  part: 'bg-violet-50 text-violet-600',
  fee: 'bg-slate-100 text-slate-500',
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { settings } = useShopSettings();

  const { data, error, loading, reload } = useAsync(async () => {
    const sb = requireSupabase();
    const [woRes, partsRes] = await Promise.all([
      sb
        .from('work_orders')
        .select('*, customer:customers(*), vehicle:vehicles(*), items:work_items(*)')
        .eq('id', id!)
        .limit(1),
      sb
        .from('parts')
        .select('id, sku, name, category, sell_price, cost_price, qty_on_hand, location, supplier')
        .order('name'),
    ]);

    check(woRes);
    const wo = (woRes.data?.[0] ?? null) as WorkOrderFull | null;
    const inventoryParts = (partsRes.data ?? []) as Part[];

    let invoice: InvoiceSummary | null = null;
    if (wo) {
      const invRes = check(
        await sb
          .from('invoices')
          .select('id, number, total, status')
          .eq('work_order_id', wo.id)
          .order('issued_at', { ascending: false })
          .limit(1)
      );
      invoice = (invRes.data?.[0] ?? null) as InvoiceSummary | null;
    }
    return { wo, invoice, inventoryParts };
  }, [id]);

  const [acting, setActing] = useState(false);
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const [taxPct, setTaxPct] = useState('0');
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [hoursDraft, setHoursDraft] = useState<string | null>(null);

  // Line item form state
  const [kind, setKind] = useState<WorkItem['kind']>('labor');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState(String(settings.default_labor_rate || '95'));
  const [selectedPartId, setSelectedPartId] = useState('');
  const [partSearchQuery, setPartSearchQuery] = useState('');
  const [partEntryMode, setPartEntryMode] = useState<'inventory' | 'manual'>('inventory');
  const [adding, setAdding] = useState(false);

  // Sync default tax % from shop settings
  useEffect(() => {
    if (settings.default_tax_rate !== undefined) {
      setTaxPct((Number(settings.default_tax_rate) * 100).toFixed(2).replace(/\.?0+$/, ''));
    }
  }, [settings.default_tax_rate]);

  const wo = data?.wo;
  const invoice = data?.invoice;
  const inventoryParts = data?.inventoryParts ?? [];

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!wo) {
    return (
      <EmptyState
        title="Work order not found"
        action={
          <Link to="/work">
            <Button variant="ghost">Back to work orders</Button>
          </Link>
        }
      />
    );
  }

  const items = wo.items ?? [];
  const subtotal = workOrderEstimate(items);
  const vehicleTypeInfo = wo.vehicle ? getVehicleTypeInfo(wo.vehicle.type) : null;

  async function updateStatus(next: WorkOrderStatus) {
    setActing(true);
    try {
      check(
        await requireSupabase()
          .from('work_orders')
          .update({
            status: next,
            completed_at: next === 'completed' ? new Date().toISOString() : wo!.completed_at,
          })
          .eq('id', wo!.id)
      );
      toast(`Status updated to ${next.replace('_', ' ')}`);
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setActing(false);
    }
  }

  function handleKindChange(newKind: WorkItem['kind']) {
    setKind(newKind);
    setSelectedPartId('');
    setPartSearchQuery('');
    if (newKind === 'labor') {
      setPrice(String(settings.default_labor_rate || '95'));
      setDesc('');
    } else if (newKind === 'part') {
      setPrice('0');
      setDesc('');
    } else {
      setPrice('0');
      setDesc('');
    }
  }

  function handleSelectInventoryPart(p: Part) {
    setSelectedPartId(p.id);
    setDesc(p.sku ? `[${p.sku}] ${p.name}` : p.name);
    setPrice(String(p.sell_price));
    setPartSearchQuery('');
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!desc.trim()) {
      toast('Please enter a description or pick a part', 'error');
      return;
    }
    setAdding(true);
    try {
      const sb = requireSupabase();
      const quantityNum = Number(qty) || 1;
      const unitPriceNum = Number(price) || 0;

      check(
        await sb.from('work_items').insert({
          work_order_id: wo!.id,
          kind,
          description: desc.trim(),
          quantity: quantityNum,
          unit_price: unitPriceNum,
          sort_order: items.length,
        })
      );

      // If item was pulled from inventory, deduct stock on hand
      if (kind === 'part' && selectedPartId) {
        const chosen = inventoryParts.find((p) => p.id === selectedPartId);
        if (chosen) {
          const newStock = Math.max(0, num(chosen.qty_on_hand) - quantityNum);
          await sb.from('parts').update({ qty_on_hand: newStock }).eq('id', chosen.id);
        }
      }

      setDesc('');
      setQty('1');
      setSelectedPartId('');
      setPartSearchQuery('');
      if (kind === 'labor') {
        setPrice(String(settings.default_labor_rate || '95'));
      } else {
        setPrice('0');
      }

      toast('Line item added');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(itemId: string) {
    try {
      check(await requireSupabase().from('work_items').delete().eq('id', itemId));
      toast('Item removed');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  async function saveDetails() {
    try {
      const updates: { notes?: string; mileage_or_hours?: string } = {};
      if (notesDraft !== null) updates.notes = notesDraft;
      if (hoursDraft !== null) updates.mileage_or_hours = hoursDraft;

      check(await requireSupabase().from('work_orders').update(updates).eq('id', wo!.id));
      toast('Saved');
      setNotesDraft(null);
      setHoursDraft(null);
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }

  async function createInvoice() {
    setActing(true);
    try {
      const taxRateNum = (Number(taxPct) || 0) / 100;
      const taxAmt = round2(subtotal * taxRateNum);
      const totalAmt = round2(subtotal + taxAmt);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invRes = check(
        await requireSupabase()
          .from('invoices')
          .insert({
            work_order_id: wo!.id,
            customer_id: wo!.customer_id,
            subtotal,
            tax_rate: taxRateNum,
            tax: taxAmt,
            total: totalAmt,
            due_date: dueDate.toISOString(),
            status: 'unpaid',
          })
          .select('id')
      );

      await requireSupabase()
        .from('work_orders')
        .update({ status: 'invoiced' })
        .eq('id', wo!.id);

      const newInvId = ((invRes.data as Array<{ id: string }>)?.[0])?.id;
      toast('Invoice created');
      setShowInvoicePanel(false);
      await reload();
      if (newInvId) {
        window.location.href = `#/invoices/${newInvId}`;
      }
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setActing(false);
    }
  }

  const notesValue = notesDraft !== null ? notesDraft : wo.notes || '';
  const hoursValue = hoursDraft !== null ? hoursDraft : wo.mileage_or_hours || '';

  function handleEmailEstimate() {
    if (!wo) return;
    const { subject, body } = formatEstimateText(wo, settings);
    const mailto = `mailto:${encodeURIComponent(wo.customer.email || '')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  async function handleShareEstimate() {
    if (!wo) return;
    const { subject, body } = formatEstimateText(wo, settings);
    if (navigator.share) {
      try {
        await navigator.share({
          title: subject,
          text: body,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(body);
      toast('Estimate text copied to clipboard! Ready to text or paste.');
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  }

  const invoiceTotal = round2(subtotal + round2(subtotal * ((Number(taxPct) || 0) / 100)));

  // Instant Inventory Parts Filter for Fast Tech Search
  const selectedPart = inventoryParts.find((p) => p.id === selectedPartId);
  const filteredInventoryParts = inventoryParts.filter((p) => {
    const q = partSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.sku || '').toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.supplier || '').toLowerCase().includes(q) ||
      (p.location || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <Link
        to="/work"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All Work Orders
      </Link>

      <PageTitle
        title={wo.number}
        sub={`Created ${longDate(wo.created_at)}`}
        right={<Badge status={wo.status} />}
      />

      {/* 2-Column Responsive Desktop Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (5 Cols on desktop): Customer, Vehicle, Status Actions & Notes */}
        <div className="space-y-4 lg:col-span-5">
          <Card className="p-4">
            <Link to={`/customers/${wo.customer_id}`} className="block">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{fullName(wo.customer)}</p>
                  {wo.customer.phone && <p className="text-xs text-slate-500">{wo.customer.phone}</p>}
                </div>
                <ChevronRightIcon className="h-4 w-4 text-slate-400" />
              </div>

              {wo.vehicle ? (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg leading-none" role="img" aria-label="Vehicle type">
                      {vehicleTypeInfo?.emoji || '🚙'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">
                        {vehicleLabel(wo.vehicle)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[
                          wo.vehicle.plate ? `${vehicleTypeInfo?.regLabel}: ${wo.vehicle.plate}` : null,
                          wo.vehicle.vin ? `${vehicleTypeInfo?.idLabel}: ${wo.vehicle.vin}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {/* Engine Spec Details */}
                  {(wo.vehicle.engine_info || wo.vehicle.engine2_info) && (
                    <div className="border-t border-slate-200/60 pt-1.5 text-[11px] text-slate-600">
                      {wo.vehicle.engine_info && (
                        <p>
                          <strong className="text-slate-700">
                            {wo.vehicle.engine2_info ? 'Main Motor:' : 'Motor:'}
                          </strong>{' '}
                          {wo.vehicle.engine_info}
                          {wo.vehicle.engine_serial ? ` (S/N: ${wo.vehicle.engine_serial})` : ''}
                          {wo.vehicle.engine_hours ? ` · ${wo.vehicle.engine_hours} hrs` : ''}
                        </p>
                      )}
                      {wo.vehicle.engine2_info && (
                        <p className="mt-0.5">
                          <strong className="text-slate-700">Kicker / 2nd Motor:</strong>{' '}
                          {wo.vehicle.engine2_info}
                          {wo.vehicle.engine2_serial ? ` (S/N: ${wo.vehicle.engine2_serial})` : ''}
                          {wo.vehicle.engine2_hours ? ` · ${wo.vehicle.engine2_hours} hrs` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">No vehicle on file</p>
              )}
            </Link>
          </Card>

          {/* Action bar for Emailing & Sharing Estimate */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={handleEmailEstimate}
              title="Open email draft with formatted estimate"
            >
              <MailIcon className="h-4 w-4 text-slate-600" /> Email Estimate
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={handleShareEstimate}
              title="Share via text/SMS or copy text"
            >
              <ShareIcon className="h-4 w-4 text-slate-600" /> Share / Text
            </Button>
          </div>

          {/* Status Buttons & Invoice Generator */}
          <div className="space-y-2">
            {wo.status === 'open' && (
              <Button variant="accent" className="w-full text-xs font-bold" disabled={acting} onClick={() => updateStatus('in_progress')}>
                ▶ Start Work Ticket
              </Button>
            )}
            {wo.status === 'in_progress' && (
              <Button variant="success" className="w-full text-xs font-bold" disabled={acting} onClick={() => updateStatus('completed')}>
                ✓ Mark Job Completed
              </Button>
            )}
            {wo.status === 'completed' && !showInvoicePanel && (
              <Button
                variant="accent"
                className="w-full text-xs font-bold"
                onClick={() => setShowInvoicePanel(true)}
              >
                <SendIcon className="h-4 w-4" /> Create &amp; Send Invoice
              </Button>
            )}

            {showInvoicePanel && (
              <Card className="space-y-3 border-amber-300 bg-amber-50/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Generate Customer Invoice
                </p>
                <Field label="Sales Tax Rate (%)">
                  <Input
                    type="number"
                    step="0.01"
                    value={taxPct}
                    onChange={(e) => setTaxPct(e.target.value)}
                    placeholder="e.g. 7.5"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    variant="accent"
                    className="flex-1 text-xs font-bold"
                    disabled={acting || items.length === 0}
                    onClick={createInvoice}
                  >
                    Invoice {money(invoiceTotal)}
                  </Button>
                  <Button variant="ghost" className="text-xs" onClick={() => setShowInvoicePanel(false)}>
                    Cancel
                  </Button>
                </div>
                {items.length === 0 && (
                  <p className="text-xs text-amber-600">Add at least one line item first.</p>
                )}
              </Card>
            )}

            {wo.status === 'invoiced' && invoice && (
              <Link
                to={`/invoices/${invoice.id}`}
                className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-3.5 text-white transition hover:bg-slate-800"
              >
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Invoice {invoice.number}
                  </p>
                  <p className="text-sm font-bold">
                    {money(invoice.total)} · <span className="capitalize">{invoice.status}</span>
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-slate-400" />
              </Link>
            )}
          </div>

          {/* Job Notes & Hour Tracking */}
          <Card className="space-y-3 p-4">
            <Field label={vehicleTypeInfo ? `${vehicleTypeInfo.hoursLabel} at service` : 'Service Hours / Miles'}>
              <Input
                value={hoursValue}
                onChange={(e) => setHoursDraft(e.target.value)}
                placeholder="e.g. 145.2 hrs / 102,400 mi"
              />
            </Field>

            <Field label="Job Notes & Diagnoses">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Customer requests, diagnoses, gate codes, part numbers, etc."
              />
            </Field>

            {(notesDraft !== null || hoursDraft !== null) && (
              <Button variant="ghost" className="w-full text-xs font-semibold" onClick={saveDetails}>
                Save Updates
              </Button>
            )}
          </Card>
        </div>

        {/* Right Column (7 Cols on desktop): Line Items & Fast Part Number Search */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Line Items ({items.length})
            </h3>
            {items.length > 0 && (
              <span className="text-sm font-black text-slate-900">Est. Total: {money(subtotal)}</span>
            )}
          </div>

          {items.length === 0 ? (
            <EmptyState title="No line items" sub="Add labor, parts or fees below to build the estimate." />
          ) : (
            <Card className="divide-y divide-slate-100 px-4 shadow-sm">
              {items.map((it) => (
                <div key={it.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{it.description}</p>
                    <span
                      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${KIND_CLS[it.kind]}`}
                    >
                      {KIND_LABEL[it.kind]}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">
                      {money(num(it.quantity) * num(it.unit_price))}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {num(it.quantity)} × {money(it.unit_price)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(it.id)}
                    className="mt-1 text-slate-300 transition hover:text-red-500"
                    aria-label="Remove item"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </Card>
          )}

          {/* Add Line Item Form with Instant Part Number Search */}
          <form onSubmit={addItem} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Add Line Item</p>
              {kind === 'part' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPartEntryMode('inventory');
                      setSelectedPartId('');
                      setPartSearchQuery('');
                    }}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      partEntryMode === 'inventory'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    📦 Inventory Search
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPartEntryMode('manual');
                      setSelectedPartId('');
                      setDesc('');
                      setPrice('0');
                    }}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      partEntryMode === 'manual'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    ✏️ Custom / Misc Part
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Item Type">
                <Select value={kind} onChange={(e) => handleKindChange(e.target.value as WorkItem['kind'])}>
                  <option value="labor">🔧 Labor</option>
                  <option value="part">📦 Part / Material</option>
                  <option value="fee">🧾 Shop Fee / Sublet</option>
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Qty / Hours">
                  <Input type="number" min="0" step="0.25" value={qty} onChange={(e) => setQty(e.target.value)} />
                </Field>
                <Field label="Rate ($)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
              </div>
            </div>

            {/* INSTANT PART NUMBER SEARCH (When kind === 'part' and partEntryMode === 'inventory') */}
            {kind === 'part' && partEntryMode === 'inventory' && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                {selectedPart ? (
                  // Selected Part Preview Card
                  <div className="flex items-start justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-amber-400">
                    <div>
                      <div className="flex items-center gap-2">
                        {selectedPart.sku && (
                          <span className="font-mono text-xs font-bold rounded bg-amber-100 text-amber-900 px-1.5 py-0.5">
                            {selectedPart.sku}
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-900">{selectedPart.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Sell: <strong className="text-slate-800">{money(selectedPart.sell_price)}</strong> ·{' '}
                        <span
                          className={`font-semibold ${
                            num(selectedPart.qty_on_hand) <= 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {selectedPart.qty_on_hand} in stock
                        </span>
                        {selectedPart.location ? ` · 📍 ${selectedPart.location}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPartId('');
                        setDesc('');
                        setPrice('0');
                        setPartSearchQuery('');
                      }}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
                    >
                      Change Part
                    </button>
                  </div>
                ) : (
                  // Search Input & Live Results
                  <div className="space-y-2">
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={partSearchQuery}
                        onChange={(e) => setPartSearchQuery(e.target.value)}
                        placeholder="Search SKU # (e.g. WIX-51348), part name, or brand…"
                        className="h-9 w-full rounded-xl bg-white pl-9 pr-3 text-xs shadow-sm ring-1 ring-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus
                      />
                    </div>

                    {/* Quick Matching Results Box */}
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
                      {filteredInventoryParts.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          No parts found matching "{partSearchQuery}".
                          <br />
                          <button
                            type="button"
                            onClick={() => {
                              setPartEntryMode('manual');
                              setDesc(partSearchQuery);
                            }}
                            className="mt-1 font-bold text-amber-600 underline"
                          >
                            Add as custom part instead
                          </button>
                        </div>
                      ) : (
                        filteredInventoryParts.slice(0, 8).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectInventoryPart(p)}
                            className="flex w-full items-center justify-between rounded-lg p-2 text-left transition hover:bg-amber-50/80 active:scale-[0.99]"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5">
                                {p.sku && (
                                  <span className="font-mono text-[11px] font-bold rounded bg-slate-100 px-1 py-0.5 text-slate-700">
                                    {p.sku}
                                  </span>
                                )}
                                <p className="truncate text-xs font-bold text-slate-800">{p.name}</p>
                              </div>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {p.category} {p.location ? `· 📍 ${p.location}` : ''}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-slate-900">{money(p.sell_price)}</p>
                              <p
                                className={`text-[10px] font-semibold ${
                                  num(p.qty_on_hand) <= 0 ? 'text-red-500' : 'text-emerald-600'
                                }`}
                              >
                                {p.qty_on_hand} in stock
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                      {filteredInventoryParts.length > 8 && (
                        <p className="py-1 text-center text-[10px] text-slate-400 border-t border-slate-100">
                          + {filteredInventoryParts.length - 8} more matches. Type to refine SKU.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description field */}
            {(kind !== 'part' || partEntryMode === 'manual' || selectedPart) && (
              <Field
                label={
                  kind === 'labor'
                    ? 'Labor Description'
                    : kind === 'part'
                      ? 'Part Description / Notes'
                      : 'Fee Description'
                }
              >
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder={
                    kind === 'labor'
                      ? 'e.g. Brake service / Diagnostic / Oil change labor'
                      : kind === 'part'
                        ? 'e.g. NGK Spark Plugs / 10W-40 Synthetic Oil'
                        : 'e.g. Shop supplies / Environmental fee / Hazmat'
                  }
                  required
                />
              </Field>
            )}

            <Button
              type="submit"
              variant="accent"
              disabled={adding || !desc.trim()}
              className="w-full text-xs font-bold"
            >
              + Add to Ticket
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
