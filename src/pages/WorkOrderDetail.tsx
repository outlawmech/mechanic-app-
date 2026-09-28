import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  BoxIcon,
  ChevronRightIcon,
  ClockIcon,
  MailIcon,
  ScanIcon,
  SearchIcon,
  SendIcon,
  ShareIcon,
  TrashIcon,
  CheckIcon,
  PlusIcon,
  VehicleIcon,
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
import { lookupPriceBookSku } from '../lib/priceBooks';
import type { InvoiceSummary, Part, WorkItem, WorkOrderFull, WorkOrderStatus } from '../types';

const KIND_LABEL: Record<WorkItem['kind'], string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };
const KIND_CLS: Record<WorkItem['kind'], string> = {
  labor: 'bg-blue-50 text-blue-600',
  part: 'bg-violet-50 text-violet-600',
  fee: 'bg-slate-100 text-slate-500',
};

import { cacheLocal, getCachedLocal, enqueueOfflineAction, generateUUID } from '../lib/offlineSync';
import {
  saveWorkOrderSignature,
  getWorkOrderSignature,
  deleteWorkOrderSignature,
} from '../lib/photoStorage';
import SignaturePad from '../components/SignaturePad';
import PhotoGallery from '../components/PhotoGallery';
import PartScannerModal from '../components/PartScannerModal';

export default function WorkOrderDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { settings } = useShopSettings();

  const { data, error, loading, reload } = useAsync(async () => {
    try {
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

      // Merge local signature if saved on device
      if (wo) {
        const storedSig = await getWorkOrderSignature(wo.id);
        if (storedSig) {
          wo.signature_url = storedSig.signature_url;
          wo.signed_by_name = storedSig.signed_by_name;
          wo.signed_at = storedSig.signed_at;
        }
      }

      let invoice: InvoiceSummary | null = null;
      if (wo) {
        const invRes = check(
          await sb
            .from('invoices')
            .select('id, number, subtotal, total, status')
            .eq('work_order_id', wo.id)
            .order('issued_at', { ascending: false })
            .limit(1)
        );
        invoice = (invRes.data?.[0] ?? null) as InvoiceSummary | null;
      }
      const result = { wo, invoice, inventoryParts };
      if (wo) {
        cacheLocal(`wo_${id}`, result);
      }
      return result;
    } catch (err) {
      const cached = getCachedLocal<{ wo: WorkOrderFull; invoice: InvoiceSummary | null; inventoryParts: Part[] }>(`wo_${id}`);
      if (cached && cached.wo) {
        const storedSig = await getWorkOrderSignature(cached.wo.id);
        if (storedSig) {
          cached.wo.signature_url = storedSig.signature_url;
          cached.wo.signed_by_name = storedSig.signed_by_name;
          cached.wo.signed_at = storedSig.signed_at;
        }
        return cached;
      }
      throw err;
    }
  }, [id]);

  const [acting, setActing] = useState(false);
  const [showInvoicePanel, setShowInvoicePanel] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'items' | 'details' | 'signature'>('items');
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

  async function handleSaveSignature(dataUrl: string, signerName: string) {
    const signedAt = new Date().toISOString();
    try {
      // Save permanently in IndexedDB
      await saveWorkOrderSignature({
        work_order_id: wo!.id,
        signature_url: dataUrl,
        signed_by_name: signerName,
        signed_at: signedAt,
      });

      wo!.signature_url = dataUrl;
      wo!.signed_by_name = signerName;
      wo!.signed_at = signedAt;
      cacheLocal(`wo_${id}`, data);
      setShowSignaturePad(false);
      toast('Customer signature saved!');
    } catch {
      wo!.signature_url = dataUrl;
      wo!.signed_by_name = signerName;
      wo!.signed_at = signedAt;
      setShowSignaturePad(false);
      toast('Customer signature saved!');
    }
  }

  async function handleClearSignature() {
    if (!window.confirm('Remove saved customer signature?')) return;
    try {
      await deleteWorkOrderSignature(wo!.id);
      wo!.signature_url = null;
      wo!.signed_by_name = null;
      wo!.signed_at = null;
      cacheLocal(`wo_${id}`, data);
      toast('Signature removed');
    } catch {
      wo!.signature_url = null;
      wo!.signed_by_name = null;
      wo!.signed_at = null;
      toast('Signature removed');
    }
  }

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
  const financialItemsLocked = Boolean(invoice);
  const invoiceItemsMismatch = Boolean(invoice) && Math.abs(subtotal - num(invoice?.subtotal)) >= 0.01;
  const vehicleTypeInfo = wo.vehicle ? getVehicleTypeInfo(wo.vehicle.type) : null;

  async function updateStatus(next: WorkOrderStatus) {
    setActing(true);
    const completedAt = next === 'completed' ? new Date().toISOString() : wo!.completed_at;
    try {
      if (navigator.onLine) {
        check(
          await requireSupabase()
            .from('work_orders')
            .update({
              status: next,
              completed_at: completedAt,
            })
            .eq('id', wo!.id)
        );
        toast(`Status updated to ${next.replace('_', ' ')}`);
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'work_orders',
          type: 'update',
          payload: { status: next, completed_at: completedAt },
          matchField: 'id',
          matchValue: wo!.id,
          description: `Update RO #${wo!.number} status to ${next}`,
        });
        wo!.status = next;
        cacheLocal(`wo_${id}`, data);
        toast(`Status updated to ${next.replace('_', ' ')} (Saved locally)`);
      }
    } catch (e) {
      enqueueOfflineAction({
        table: 'work_orders',
        type: 'update',
        payload: { status: next, completed_at: completedAt },
        matchField: 'id',
        matchValue: wo!.id,
        description: `Update RO #${wo!.number} status to ${next}`,
      });
      wo!.status = next;
      cacheLocal(`wo_${id}`, data);
      toast(`Status updated to ${next.replace('_', ' ')} (Saved offline)`);
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
    if (financialItemsLocked) {
      toast('This repair order has an issued invoice. Its financial line items are locked; record additional work on a separate repair order.', 'error');
      return;
    }
    if (!desc.trim()) {
      toast('Please enter a description or pick a part', 'error');
      return;
    }
    setAdding(true);
    const quantityNum = Number(qty) || 1;
    const unitPriceNum = Number(price) || 0;
    const newItemPayload = {
      work_order_id: wo!.id,
      kind,
      description: desc.trim(),
      quantity: quantityNum,
      unit_price: unitPriceNum,
      sort_order: items.length,
    };

    try {
      if (navigator.onLine) {
        const sb = requireSupabase();
        check(await sb.from('work_items').insert(newItemPayload));

        // If item was pulled from inventory, deduct stock on hand
        if (kind === 'part' && selectedPartId) {
          const chosen = inventoryParts.find((p) => p.id === selectedPartId);
          if (chosen) {
            const newStock = Math.max(0, num(chosen.qty_on_hand) - quantityNum);
            await sb.from('parts').update({ qty_on_hand: newStock }).eq('id', chosen.id);
          }
        }

        toast('Line item added');
        await reload();
      } else {
        const itemId = generateUUID();
        const offlineItemPayload = {
          id: itemId,
          ...newItemPayload,
        };

        enqueueOfflineAction({
          table: 'work_items',
          type: 'insert',
          payload: offlineItemPayload,
          description: `Add ${kind}: ${desc.trim()}`,
        });

        // Update local items array
        const tempItem: WorkItem = {
          id: itemId,
          ...newItemPayload,
          created_at: new Date().toISOString(),
        };
        wo!.items = [...(wo!.items ?? []), tempItem];
        cacheLocal(`wo_${id}`, data);
        toast('Line item added (Saved locally)');
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
    } catch (e) {
      if (navigator.onLine) {
        toast(errMsg(e) || 'Line item could not be saved.', 'error');
      } else {
        const itemId = generateUUID();
        const offlineItemPayload = {
          id: itemId,
          ...newItemPayload,
        };

        enqueueOfflineAction({
          table: 'work_items',
          type: 'insert',
          payload: offlineItemPayload,
          description: `Add ${kind}: ${desc.trim()}`,
        });
        const tempItem: WorkItem = {
          id: itemId,
          ...newItemPayload,
          created_at: new Date().toISOString(),
        };
        wo!.items = [...(wo!.items ?? []), tempItem];
        cacheLocal(`wo_${id}`, data);
        toast('Line item added (Saved offline)');
      }
    } finally {
      setAdding(false);
    }
  }

  async function removeItem(itemId: string) {
    if (financialItemsLocked) {
      toast('This repair order has an issued invoice. Its financial line items are locked.', 'error');
      return;
    }
    try {
      if (navigator.onLine) {
        check(await requireSupabase().from('work_items').delete().eq('id', itemId));
        toast('Item removed');
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'work_items',
          type: 'delete',
          matchField: 'id',
          matchValue: itemId,
          description: 'Remove line item',
        });
        wo!.items = (wo!.items ?? []).filter((i) => i.id !== itemId);
        cacheLocal(`wo_${id}`, data);
        toast('Item removed (Saved locally)');
      }
    } catch (e) {
      if (navigator.onLine) {
        toast(errMsg(e) || 'Line item could not be removed.', 'error');
      } else {
        enqueueOfflineAction({
          table: 'work_items',
          type: 'delete',
          matchField: 'id',
          matchValue: itemId,
          description: 'Remove line item',
        });
        wo!.items = (wo!.items ?? []).filter((i) => i.id !== itemId);
        cacheLocal(`wo_${id}`, data);
        toast('Item removal queued (Saved offline)');
      }
    }
  }

  async function saveDetails() {
    const updates: { notes?: string; mileage_or_hours?: string } = {};
    if (notesDraft !== null) updates.notes = notesDraft;
    if (hoursDraft !== null) updates.mileage_or_hours = hoursDraft;

    try {
      if (navigator.onLine) {
        check(await requireSupabase().from('work_orders').update(updates).eq('id', wo!.id));
        toast('Saved');
        await reload();
      } else {
        enqueueOfflineAction({
          table: 'work_orders',
          type: 'update',
          payload: updates,
          matchField: 'id',
          matchValue: wo!.id,
          description: `Update details for RO #${wo!.number}`,
        });
        if (updates.notes !== undefined) wo!.notes = updates.notes;
        if (updates.mileage_or_hours !== undefined) wo!.mileage_or_hours = updates.mileage_or_hours;
        cacheLocal(`wo_${id}`, data);
        toast('Saved locally (Offline Mode)');
      }
      setNotesDraft(null);
      setHoursDraft(null);
    } catch (e) {
      enqueueOfflineAction({
        table: 'work_orders',
        type: 'update',
        payload: updates,
        matchField: 'id',
        matchValue: wo!.id,
        description: `Update details for RO #${wo!.number}`,
      });
      if (updates.notes !== undefined) wo!.notes = updates.notes;
      if (updates.mileage_or_hours !== undefined) wo!.mileage_or_hours = updates.mileage_or_hours;
      cacheLocal(`wo_${id}`, data);
      toast('Saved offline');
      setNotesDraft(null);
      setHoursDraft(null);
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
        <ArrowLeftIcon className="h-3.5 w-3.5" /> All Repair Orders
      </Link>

      <PageTitle
        title={`RO #${wo.number}`}
        sub={`Created ${longDate(wo.created_at)}`}
        right={<Badge status={wo.status} />}
      />

      {/* Mobile Ergonomic Segmented Tabs (Visible on mobile only) */}
      <div className="flex rounded-2xl bg-slate-200 p-1 text-xs font-black lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('items')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition ${
            mobileTab === 'items' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
          }`}
        >
          <span>📋 Items &amp; Rates</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-700">
            {items.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('details')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition ${
            mobileTab === 'details' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
          }`}
        >
          <span>🔍 Vehicle &amp; Notes</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('signature')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 transition ${
            mobileTab === 'signature' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600'
          }`}
        >
          <span>✍️ Signature</span>
          {wo.signature_url && (
            <span className="text-[10px] text-emerald-600 font-black">✓</span>
          )}
        </button>
      </div>

      {/* 2-Column Responsive Desktop Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (5 Cols on desktop): Customer, Vehicle, Status Actions, Notes, Photos, & Signature */}
        <div className="space-y-4 lg:col-span-5">
          {/* Details Tab Content (Mobile 'details' tab or Desktop always) */}
          <div className={mobileTab === 'details' ? 'space-y-4' : 'hidden lg:block lg:space-y-4'}>
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
                      <VehicleIcon type={wo.vehicle.type} className="h-5 w-5 text-slate-700 shrink-0 mt-0.5" />
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
                  ▶ Start Repair Order
                </Button>
              )}
              {wo.status === 'in_progress' && (
                <Button variant="success" className="w-full text-xs font-bold" disabled={acting} onClick={() => updateStatus('completed')}>
                  ✓ Mark RO Completed
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
                <Card className="space-y-3 border-orange-300 bg-orange-50/50 p-4">
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
                    <p className="text-xs text-orange-600">Add at least one line item first.</p>
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
            <Card className="space-y-3.5 p-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Technician Notes &amp; Diagnoses
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Expandable</span>
              </div>

              <Field label={vehicleTypeInfo ? `${vehicleTypeInfo.hoursLabel} at service` : 'Service Hours / Miles'}>
                <Input
                  value={hoursValue}
                  onChange={(e) => setHoursDraft(e.target.value)}
                  placeholder="e.g. 145.2 hrs / 102,400 mi"
                />
              </Field>

              <Field label="Service Notes, Diagnoses &amp; Findings">
                <Textarea
                  rows={8}
                  value={notesValue}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Enter detailed diagnostic findings, customer complaints, tech steps, clearance specs, gate codes, etc."
                  className="min-h-[180px] font-mono text-xs leading-relaxed"
                />
              </Field>

              {(notesDraft !== null || hoursDraft !== null) && (
                <Button variant="accent" className="w-full text-xs font-bold shadow-sm" onClick={saveDetails}>
                  ✓ Save Notes &amp; Hours Updates
                </Button>
              )}
            </Card>

            {/* Job Site Photos & Pre-Inspection Gallery */}
            <PhotoGallery workOrderId={wo.id} />
          </div>

          {/* Signature Tab Content (Mobile 'signature' tab or Desktop always) */}
          <div className={mobileTab === 'signature' ? 'space-y-2' : 'hidden lg:block lg:space-y-2'}>
            {wo.signature_url ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      Customer Authorization
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    Signed &amp; Verified
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2 flex items-center justify-center">
                  <img src={wo.signature_url} alt="Customer Signature" className="max-h-20 object-contain" />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <p>
                    Signed by <strong className="text-slate-800">{wo.signed_by_name || 'Customer'}</strong>
                  </p>
                  <p>{wo.signed_at ? new Date(wo.signed_at).toLocaleDateString() : ''}</p>
                </div>
                <div className="flex gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowSignaturePad(true)}
                    className="text-[11px] font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Re-sign / Update
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={handleClearSignature}
                    className="text-[11px] font-semibold text-slate-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : showSignaturePad ? (
              <SignaturePad
                onSave={handleSaveSignature}
                onCancel={() => setShowSignaturePad(false)}
                defaultName={fullName(wo.customer)}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckIcon className="h-4 w-4 text-orange-700" />
                    <span className="text-xs font-bold text-orange-950">Customer Signature</span>
                  </div>
                  <Button
                    type="button"
                    variant="accent"
                    onClick={() => setShowSignaturePad(true)}
                    className="text-xs font-bold shadow-xs px-2.5 py-1.5"
                  >
                    Get Signature
                  </Button>
                </div>
                <p className="text-[11px] text-orange-800/80">
                  Capture customer finger signature &amp; authorization directly on your phone screen.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (7 Cols on desktop): Line Items & Fast Part Number Search */}
        <div className={`space-y-4 lg:col-span-7 ${mobileTab === 'items' ? 'block' : 'hidden lg:block'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Line Items ({items.length}) {financialItemsLocked ? '· LOCKED' : ''}
            </h3>
            {items.length > 0 && (
              <span className="text-sm font-black text-slate-900">Est. Total: {money(subtotal)}</span>
            )}
          </div>

          {financialItemsLocked && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
              <p className="font-bold">Invoice {invoice!.number} has been issued. Repair-order financial line items are locked.</p>
              <p className="mt-1">Record additional work on a separate repair order; this keeps issued invoice totals unchanged.</p>
            </div>
          )}
          {invoiceItemsMismatch && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="alert">
              Current repair-order items total {money(subtotal)}, but invoice {invoice!.number} was issued with a subtotal of {money(invoice!.subtotal)}. The invoice has not been recalculated or changed.
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState title="No line items" sub={financialItemsLocked ? 'No line items were saved on this repair order.' : 'Add labor, parts or fees below to build the estimate.'} />
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
                  {!financialItemsLocked && (
                    <button
                      onClick={() => removeItem(it.id)}
                      className="mt-1 text-slate-300 transition hover:text-red-500"
                      aria-label="Remove item"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}

          {!financialItemsLocked && (
            <>
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
                    Inventory Stock
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
                    Custom / Manual Part
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-black text-slate-950 hover:bg-orange-400 active:scale-95 transition shadow-xs"
                  >
                    <ScanIcon className="h-3.5 w-3.5" />
                    <span>📷 Scan</span>
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Item Type">
                <Select value={kind} onChange={(e) => handleKindChange(e.target.value as WorkItem['kind'])}>
                  <option value="labor">Labor</option>
                  <option value="part">Part / Material</option>
                  <option value="fee">Shop Fee / Sublet</option>
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
              <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
                {selectedPart ? (
                  // Selected Part Preview Card
                  <div className="flex items-start justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-orange-400">
                    <div>
                      <div className="flex items-center gap-2">
                        {selectedPart.sku && (
                          <span className="font-mono text-xs font-bold rounded bg-orange-100 text-orange-900 px-1.5 py-0.5">
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
                        {selectedPart.location ? ` · Bin: ${selectedPart.location}` : ''}
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
                        className="h-9 w-full rounded-xl bg-white pl-9 pr-3 text-xs shadow-sm ring-1 ring-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                            className="mt-1 font-bold text-orange-600 underline"
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
                            className="flex w-full items-center justify-between rounded-lg p-2 text-left transition hover:bg-orange-50/80 active:scale-[0.99]"
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
                                {p.category} {p.location ? `· Bin: ${p.location}` : ''}
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
              + Add to Repair Order
            </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Part Barcode Scanner for Work Order Parts */}
      <PartScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        parts={inventoryParts}
        onSelectPart={(p) => {
          setKind('part');
          setPartEntryMode('inventory');
          setSelectedPartId(p.id);
          setDesc(p.sku ? `${p.sku} - ${p.name}` : p.name);
          setPrice(String(p.sell_price));
          setScannerOpen(false);
          toast(`Selected ${p.sku} for repair order!`);
        }}
        onAddNewPart={async (sku) => {
          setKind('part');
          const pb = await lookupPriceBookSku(sku);
          if (pb) {
            setPartEntryMode('manual');
            setSelectedPartId('');
            setDesc(`${pb.sku} - ${pb.name}`);
            setPrice(String(pb.sell_price));
            toast(`Pre-filled ${pb.sku} from ${pb.brand || pb.manufacturer} Price Book!`);
          } else {
            setPartEntryMode('manual');
            setSelectedPartId('');
            setDesc(`Part #${sku}`);
            setPrice('0');
            toast(`Scanned part #${sku}`);
          }
          setScannerOpen(false);
        }}
      />
    </div>
  );
}
