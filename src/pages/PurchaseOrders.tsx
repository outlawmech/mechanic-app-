import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckIcon, PackageCheckIcon, PlusIcon, PrinterIcon, TruckIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { useShopSettings } from '../lib/settings';
import { check, requireSupabase } from '../lib/supabase';
import { money, num } from '../lib/format';
import { toCsv } from '../lib/reporting';
import { generateUUID } from '../lib/offlineSync';
import { getPurchaseOrderLineTotal, getPurchaseOrderRemaining, getPurchaseOrderSubtotal } from '../lib/purchaseOrderMath';
import { catalogSuppliers, partsForSupplier } from '../lib/purchaseOrderSuppliers';
import type { Part, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '../types';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft / Open',
  ordered: 'Ordered',
  partially_received: 'Partially Received',
  received: 'Received / Closed',
};

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  // Let the browser start the download before removing the anchor or URL.
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function printPurchaseOrder(order: PurchaseOrder) {
  const printable = document.getElementById('purchase-order-print-content');
  const nativePrinter = (window as any).AndroidNativePrinter;
  if (printable && typeof nativePrinter?.printInvoiceHtml === 'function') {
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      @page{size:letter portrait;margin:12mm 15mm}*{box-sizing:border-box}body{font:10pt/1.35 Arial,sans-serif;color:#111827;margin:0}
      .po-print-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12mm;border-bottom:2px solid #111827;padding-bottom:5mm;margin-bottom:5mm}
      .po-print-header img{max-width:45mm;max-height:24mm;object-fit:contain}.po-print-header h1{font-size:19pt;margin:0 0 2mm}
      .po-print-shop{margin-bottom:7mm;font-size:9pt}.po-print-meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:6mm;margin-bottom:7mm}
      .po-print-table{width:100%;border-collapse:collapse;font-size:9pt}.po-print-table th,.po-print-table td{border-bottom:1px solid #cbd5e1;padding:2.5mm 2mm;text-align:left;vertical-align:top}
      .po-print-table th{border-top:1px solid #64748b;border-bottom:1px solid #64748b;background:#f1f5f9}.po-print-table td:nth-child(n+3),.po-print-table th:nth-child(n+3){text-align:right;white-space:nowrap}
      .po-print-table tr{break-inside:avoid}.po-print-totals{width:70mm;margin:7mm 0 0 auto}.po-print-totals div{display:flex;justify-content:space-between;padding:1.5mm 0}
      .po-print-grand{border-top:1px solid #111827;font-size:11pt;font-weight:bold}
    </style></head><body>${printable.outerHTML}</body></html>`;
    nativePrinter.printInvoiceHtml(html, `Purchase_Order_${order.po_number.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    return;
  }
  window.print();
}

export default function PurchaseOrders() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, shopId } = useShopSettings();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [receiptRequestId, setReceiptRequestId] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [actualCost, setActualCost] = useState<Record<string, string>>({});
  const [freight, setFreight] = useState('0');
  const [holdingBin, setHoldingBin] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [showAddStock, setShowAddStock] = useState(false);
  const [partSearch, setPartSearch] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [stockExpectedCost, setStockExpectedCost] = useState('0');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const sb = requireSupabase();
        const [result, partsResult] = await Promise.all([
          sb.from('purchase_orders')
            .select('*, lines:purchase_order_lines(*, special_order:special_orders(id,order_number,customer_name,status,quantity_received)), receipts:purchase_order_receipts(id,received_at,freight_cost,lines:purchase_order_receipt_lines(*,po_line:purchase_order_lines(part_number,description)))')
            .order('created_at', { ascending: false }),
          sb.from('parts').select('*').order('name'),
        ]);
        if (!alive) return;
        setOrders((check(result).data ?? []) as unknown as PurchaseOrder[]);
        setParts((check(partsResult).data ?? []) as Part[]);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Could not load Purchase Orders.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [refreshKey]);

  const selected = orders.find((order) => order.id === id) ?? null;
  const suppliers = useMemo(() => catalogSuppliers(parts), [parts]);
  const supplierParts = useMemo(() => partsForSupplier(parts, selected?.supplier), [parts, selected?.supplier]);
  const matchingSupplierParts = useMemo(() => {
    const query = partSearch.trim().toLowerCase();
    if (!query) return supplierParts;
    return supplierParts.filter((part) => `${part.sku} ${part.name}`.toLowerCase().includes(query));
  }, [partSearch, supplierParts]);
  const selectedStockPart = supplierParts.find((part) => part.id === selectedPartId) ?? null;
  const lineTotal = getPurchaseOrderLineTotal;
  const subtotal = selected ? getPurchaseOrderSubtotal(selected.lines) : 0;
  const selectedLines = useMemo(() => [...(selected?.lines ?? [])].sort((a, b) => a.part_number.localeCompare(b.part_number)), [selected]);

  async function createPurchaseOrder() {
    if (!newSupplier.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const result = check(await sb.rpc('create_draft_purchase_order', { p_supplier: newSupplier.trim() }));
      const created = result.data as { id?: string; po_number?: string; reused?: boolean } | null;
      if (!created?.id) throw new Error('The Purchase Order was not created. Refresh and try again.');
      setShowCreateOrder(false);
      setNewSupplier('');
      setRefreshKey((n) => n + 1);
      navigate(`/parts/purchase-orders/${created.id}`);
    } catch (e: any) {
      setError(e?.message || 'Could not create a Purchase Order.');
    } finally {
      setSaving(false);
    }
  }

  function beginAddStock() {
    setPartSearch('');
    setSelectedPartId('');
    setStockQuantity('1');
    setStockExpectedCost('0');
    setShowAddStock(true);
  }

  async function addStockPart(order: PurchaseOrder) {
    const part = supplierParts.find((candidate) => candidate.id === selectedPartId);
    const quantity = Number(stockQuantity);
    const expectedCost = Number(stockExpectedCost);
    if (!part) {
      setError('Choose a catalog part supplied by this PO’s supplier.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(expectedCost) || expectedCost < 0) {
      setError('Enter a positive quantity and a valid, non-negative expected cost.');
      return;
    }
    if (!shopId) {
      setError('Shop access is still loading. Try again in a moment.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = requireSupabase();
      const currentStockLine = order.lines.find((line) => line.part_id === part.id && !line.special_order_id);
      if (currentStockLine) {
        const oldQuantity = num(currentStockLine.quantity_ordered);
        const totalQuantity = oldQuantity + quantity;
        // Keep the existing PO line subtotal intact when quantities are combined.
        const combinedExpectedCost = totalQuantity > 0
          ? (oldQuantity * num(currentStockLine.expected_unit_cost) + quantity * expectedCost) / totalQuantity
          : expectedCost;
        const updated = check(await sb.from('purchase_order_lines').update({
          quantity_ordered: totalQuantity,
          expected_unit_cost: combinedExpectedCost,
        }).eq('id', currentStockLine.id).eq('purchase_order_id', order.id).eq('user_id', shopId).select('id').maybeSingle());
        if (!updated.data?.id) throw new Error('This PO is no longer open for edits. Refresh and review its status.');
      } else {
        check(await sb.from('purchase_order_lines').insert({
          user_id: shopId,
          purchase_order_id: order.id,
          part_id: part.id,
          special_order_id: null,
          part_number: part.sku || part.name,
          description: part.name,
          quantity_ordered: quantity,
          quantity_received: 0,
          expected_unit_cost: expectedCost,
        }));
      }
      setShowAddStock(false);
      setSelectedPartId('');
      setRefreshKey((n) => n + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not add this stock part to the PO.');
    } finally {
      setSaving(false);
    }
  }

  async function markOrdered(order: PurchaseOrder) {
    if (!window.confirm(`Confirm that ${order.po_number} was placed with ${order.supplier}?`)) return;
    setSaving(true);
    try {
      const sb = requireSupabase();
      const result = check(await sb.from('purchase_orders')
        .update({ status: 'ordered', ordered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', order.id).eq('user_id', shopId).eq('status', 'draft').select('id').maybeSingle());
      if (!result.data?.id) throw new Error('This PO is no longer a Draft. Refresh and review its current status.');
      setRefreshKey((n) => n + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not mark this PO Ordered.');
    } finally {
      setSaving(false);
    }
  }

  function beginReceive(order: PurchaseOrder) {
    setReceiptRequestId(generateUUID());
    setReceiveQty(Object.fromEntries(order.lines.map((line) => [line.id, String(getPurchaseOrderRemaining(line))])));
    setActualCost(Object.fromEntries(order.lines.map((line) => [line.id, String(num(line.expected_unit_cost))])));
    setFreight('0');
    setHoldingBin('');
    setShowReceive(true);
  }

  function receiveAll(order: PurchaseOrder) {
    setReceiveQty(Object.fromEntries(order.lines.map((line) => [line.id, String(getPurchaseOrderRemaining(line))])));
  }

  async function confirmReceive(order: PurchaseOrder) {
    setSaving(true);
    setError(null);
    try {
      const lines = order.lines.map((line) => ({
        line_id: line.id,
        quantity: Number(receiveQty[line.id] || 0),
        actual_unit_cost: Number(actualCost[line.id] || 0),
      })).filter((line) => line.quantity > 0);
      if (!lines.length && Number(freight) <= 0) throw new Error('Enter a received quantity or freight charge.');
      if (!Number.isFinite(Number(freight)) || Number(freight) < 0) throw new Error('Freight must be zero or greater.');
      if (lines.some((line) => !Number.isFinite(line.quantity) || !Number.isFinite(line.actual_unit_cost) || line.actual_unit_cost < 0)) {
        throw new Error('Check the received quantities and actual costs.');
      }

      const sb = requireSupabase();
      check(await sb.rpc('receive_purchase_order', {
        p_receipt_id: receiptRequestId || generateUUID(),
        p_purchase_order_id: order.id,
        p_lines: lines,
        p_freight_cost: Number(freight),
        p_holding_bin: holdingBin.trim(),
      }));
      setShowReceive(false);
      setReceiptRequestId('');
      setRefreshKey((n) => n + 1);
    } catch (e: any) {
      setError(e?.message || 'Could not save this receipt. No inventory was changed.');
    } finally {
      setSaving(false);
    }
  }

  async function exportOrder(order: PurchaseOrder) {
    const rows = order.lines.map((line) => [
      order.po_number,
      order.supplier,
      line.part_number,
      line.description,
      num(line.quantity_ordered),
      num(line.expected_unit_cost),
    ]);
    const csv = toCsv(['PO Number', 'Supplier', 'Part Number', 'Description', 'Quantity', 'Expected Unit Cost'], rows);
    const nativeExporter = (window as any).AndroidNativePrinter;
    if (typeof nativeExporter?.shareCsvFile === 'function') {
      try {
        const encoded = btoa(unescape(encodeURIComponent(csv)));
        nativeExporter.shareCsvFile(encoded, `${order.po_number}.csv`);
      } catch (e: any) {
        setError(e?.message || 'Could not export this order.');
      }
      return;
    }
    downloadCsv(`${order.po_number}.csv`, csv);
  }

  if (loading) return <Spinner />;
  if (error && !orders.length) return <ErrorState message={error} />;

  return (
    <div className="purchase-order-page space-y-5">
      <div className="purchase-order-screen">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle title="Purchase Orders" sub="Supplier orders for customer Special Orders and stock replenishment" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" onClick={() => { setNewSupplier(suppliers[0] ?? ''); setShowCreateOrder(true); }} disabled={!suppliers.length}>
              <PlusIcon className="h-4 w-4" /> New Purchase Order
            </Button>
            <Link to="/parts" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">
              <ArrowLeftIcon className="h-4 w-4" /> Parts Department
            </Link>
          </div>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
          <Card className="p-3">
            <h2 className="px-2 pb-2 text-xs font-black uppercase tracking-wider text-slate-500">Supplier Orders ({orders.length})</h2>
            {!orders.length ? <p className="p-3 text-sm text-slate-500">Create a supplier PO here or add a Special Order from Parts.</p> :
              <div className="space-y-1">
                {orders.map((order) => (
                  <button key={order.id} type="button" onClick={() => navigate(`/parts/purchase-orders/${order.id}`)}
                    className={`w-full rounded-xl p-3 text-left ${order.id === id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>
                    <span className="flex items-center justify-between gap-2 text-sm font-bold"><span className="font-mono">{order.po_number}</span><span className="text-[10px]">{statusLabels[order.status]}</span></span>
                    <span className={`mt-1 block text-xs ${order.id === id ? 'text-slate-300' : 'text-slate-500'}`}>{order.supplier} · {order.lines.length} line{order.lines.length === 1 ? '' : 's'}</span>
                  </button>
                ))}
              </div>}
          </Card>

          {!selected ? (
            <Card className="grid min-h-64 place-items-center p-6"><EmptyState icon={<TruckIcon className="h-10 w-10 text-slate-400" />} title="Select a Purchase Order" sub="Draft POs can include customer Special Orders and supplier-matched stock parts." /></Card>
          ) : (
            <Card className="purchase-order-screen p-4 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{statusLabels[selected.status]}</p><h2 className="font-mono text-2xl font-black">{selected.po_number}</h2><p className="mt-1 text-sm font-bold">{selected.supplier}</p><p className="mt-1 text-xs text-slate-500">Created {dateTime(selected.created_at)} · Ordered {dateTime(selected.ordered_at)}</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => printPurchaseOrder(selected)}><PrinterIcon className="h-4 w-4" /> Print / Save PDF</Button>
                  <Button type="button" variant="ghost" onClick={() => void exportOrder(selected)}>Export Order</Button>
                  {selected.status === 'draft' && <Button type="button" variant="accent" disabled={saving} onClick={() => void markOrdered(selected)}><CheckIcon className="h-4 w-4" /> Mark Ordered</Button>}
                  {['ordered','partially_received'].includes(selected.status) && <Button type="button" variant="accent" disabled={saving} onClick={() => beginReceive(selected)}><PackageCheckIcon className="h-4 w-4" /> Receive</Button>}
                  {selected.status === 'draft' && <Button type="button" variant="ghost" disabled={saving || !supplierParts.length} onClick={beginAddStock}><PlusIcon className="h-4 w-4" /> Add Stock Part</Button>}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600"><tr><th className="p-2">Part Number</th><th className="p-2">Description / Customer</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Expected Cost</th><th className="p-2 text-right">Line Total</th></tr></thead>
                  <tbody>{selectedLines.map((line) => <tr key={line.id} className="border-b border-slate-200">
                    <td className="p-2 font-mono font-bold">{line.part_number}</td>
                    <td className="p-2">{line.description}{line.special_order ? <span className="mt-1 block text-[10px] text-purple-700">{line.special_order.order_number} · {line.special_order.customer_name}{line.special_order.status === 'canceled' ? ' · canceled, will stock on receipt' : ' · customer allocation'}</span> : <span className="mt-1 block text-[10px] text-slate-500">Stock replenishment</span>}</td>
                    <td className="p-2 text-right">{num(line.quantity_ordered)}</td><td className="p-2 text-right">{num(line.quantity_received)}</td><td className="p-2 text-right">{money(num(line.expected_unit_cost))}</td><td className="p-2 text-right">{money(lineTotal(line))}</td>
                  </tr>)}</tbody>
                </table>
              </div>

              <div className="ml-auto w-full max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm">
                <div className="flex justify-between"><span>PO Subtotal</span><strong>{money(subtotal)}</strong></div>
                <div className="flex justify-between"><span>Freight / Shipping recorded</span><strong>{money(num(selected.freight_total))}</strong></div>
                <div className="flex justify-between border-t border-slate-300 pt-1 text-base"><span>Total</span><strong>{money(subtotal + num(selected.freight_total))}</strong></div>
              </div>
              {selected.receipts?.length ? <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">{selected.receipts.length} receipt{selected.receipts.length === 1 ? '' : 's'} recorded · freight is stored separately from part cost.</div> : null}
              {selected.receipts?.length ? <div className="space-y-2 border-t border-slate-100 pt-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Receiving History</h3>
                {selected.receipts.map((receipt) => <div key={receipt.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2"><strong>{dateTime(receipt.received_at)}</strong><span>Freight / Shipping: {money(num(receipt.freight_cost))}</span></div>
                  {(receipt.lines ?? []).map((line) => <div key={line.id} className="mt-1 flex flex-wrap justify-between gap-2 text-slate-600"><span>{line.po_line?.part_number} · Qty {num(line.quantity_received)} · actual {money(num(line.actual_unit_cost))} / unit</span><span>Line actual: {money(num(line.quantity_received)*num(line.actual_unit_cost))}</span></div>)}
                </div>)}
              </div> : null}
            </Card>
          )}
        </div>
      </div>

      {selected && <section id="purchase-order-print-content" className="purchase-order-print">
        <header className="po-print-header">
          {settings.logo_url ? <img src={settings.logo_url} alt="Shop logo" /> : <strong>{settings.shop_name}</strong>}
          <div><h1>Purchase Order</h1><strong>{selected.po_number}</strong><div>{statusLabels[selected.status]}</div></div>
        </header>
        <div className="po-print-shop">{settings.shop_name}<br />{[settings.address, settings.phone, settings.email].filter(Boolean).join(' · ')}</div>
        <div className="po-print-meta"><div><strong>Supplier</strong><br />{selected.supplier}</div><div><strong>Created</strong><br />{dateTime(selected.created_at)}</div><div><strong>Order Date</strong><br />{dateTime(selected.ordered_at)}</div></div>
        <table className="po-print-table"><thead><tr><th>Part Number</th><th>Description</th><th>Qty</th><th>Expected Unit Cost</th><th>Line Total</th></tr></thead>
          <tbody>{selectedLines.map((line) => <tr key={line.id}><td>{line.part_number}</td><td>{line.description}{line.special_order ? ` · Special Order ${line.special_order.order_number}` : ' · Stock replenishment'}</td><td>{num(line.quantity_ordered)}</td><td>{money(num(line.expected_unit_cost))}</td><td>{money(lineTotal(line))}</td></tr>)}</tbody>
        </table>
        <div className="po-print-totals"><div>Subtotal <strong>{money(subtotal)}</strong></div><div>Freight / Shipping <strong>{money(num(selected.freight_total))}</strong></div><div className="po-print-grand">Total <strong>{money(subtotal + num(selected.freight_total))}</strong></div></div>
      </section>}

      {showReceive && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label="Receive Purchase Order">
        <Card className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Receive {selected.po_number}</h2><p className="text-sm text-slate-500">Enter only the quantities that arrived. Customer Special Order quantities stay in their holding bins.</p></div><button type="button" onClick={() => setShowReceive(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
          {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><Field label="Special Order holding bin (optional)"><Input value={holdingBin} onChange={(e) => setHoldingBin(e.target.value)} placeholder="Parts Counter Holding Rack" /></Field><Button type="button" variant="ghost" onClick={() => receiveAll(selected)}>Receive All Remaining</Button></div>
          <div className="mt-4 space-y-3">{selectedLines.map((line) => {
            const remaining = getPurchaseOrderRemaining(line);
            return <div key={line.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-[1.3fr_0.6fr_0.8fr_0.9fr] md:items-end">
              <div><div className="font-mono text-xs font-black">{line.part_number}</div><div className="text-xs text-slate-600">{line.description}</div>{line.special_order && <div className="mt-1 text-[10px] text-purple-700">{line.special_order.customer_name} · SO {line.special_order.order_number}</div>}<div className="text-[10px] text-slate-400">Ordered {num(line.quantity_ordered)} · Previously received {num(line.quantity_received)} · Remaining {remaining}</div></div>
              <Field label="Qty Receiving Now"><Input type="number" min="0" max={remaining} step="0.01" value={receiveQty[line.id] ?? '0'} onChange={(e) => setReceiveQty((v) => ({ ...v, [line.id]: e.target.value }))} /></Field>
              <Field label={`Expected Unit Cost (${money(num(line.expected_unit_cost))})`}><Input type="number" min="0" step="0.01" value={line.expected_unit_cost} readOnly /></Field>
              <Field label="Actual Unit Cost"><Input type="number" min="0" step="0.01" value={actualCost[line.id] ?? ''} onChange={(e) => setActualCost((v) => ({ ...v, [line.id]: e.target.value }))} /></Field>
            </div>;
          })}</div>
          <div className="mt-4 max-w-xs"><Field label="Freight / Shipping on this receipt"><Input type="number" min="0" step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} /></Field></div>
          <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowReceive(false)}>Cancel</Button><Button type="button" variant="accent" disabled={saving} onClick={() => void confirmReceive(selected)}>{saving ? 'Saving Receipt…' : 'Confirm Receipt'}</Button></div>
        </Card>
      </div>}

      {showCreateOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-po-title">
        <Card className="w-full max-w-md space-y-4 p-5">
          <div><h2 id="create-po-title" className="text-lg font-black">New Purchase Order</h2><p className="mt-1 text-xs text-slate-500">Choose a supplier from your parts catalog. Existing Draft POs for that supplier will be reused.</p></div>
          <Field label="Supplier"><Select value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}</Select></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowCreateOrder(false)}>Cancel</Button><Button type="button" variant="accent" disabled={!newSupplier.trim() || saving} onClick={() => void createPurchaseOrder()}>{saving ? 'Creating…' : 'Create Draft PO'}</Button></div>
        </Card>
      </div>}

      {showAddStock && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="add-stock-title">
        <Card className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto p-5">
          <div><h2 id="add-stock-title" className="text-lg font-black">Add Stock Part</h2><p className="mt-1 text-xs text-slate-500">Showing catalog parts supplied by {selected.supplier}. Received quantities become available inventory.</p></div>
          <Field label="Search this supplier’s parts"><Input autoFocus value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Part number or description" /></Field>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
            {matchingSupplierParts.map((part) => <button key={part.id} type="button" onClick={() => { setSelectedPartId(part.id); setStockExpectedCost(String(num(part.cost_price))); }} className={`flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left text-sm ${selectedPartId === part.id ? 'bg-orange-100 ring-1 ring-orange-400' : 'hover:bg-slate-50'}`}>
              <span className="min-w-0"><strong className="font-mono">{part.sku || 'No SKU'}</strong><span className="ml-2">{part.name}</span></span><span className="shrink-0 text-xs text-slate-500">On hand {num(part.qty_on_hand)}</span>
            </button>)}
            {!matchingSupplierParts.length && <p className="p-3 text-sm text-slate-500">No catalog parts from this supplier match.</p>}
          </div>
          {selectedStockPart && <div className="grid grid-cols-2 gap-3"><Field label="Quantity to Order"><Input type="number" min="0.01" step="0.01" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} /></Field><Field label="Expected Unit Cost"><Input type="number" min="0" step="0.01" value={stockExpectedCost} onChange={(e) => setStockExpectedCost(e.target.value)} /></Field></div>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowAddStock(false)}>Cancel</Button><Button type="button" variant="accent" disabled={!selectedStockPart || saving} onClick={() => void addStockPart(selected)}>{saving ? 'Adding…' : 'Add to Draft PO'}</Button></div>
        </Card>
      </div>}
    </div>
  );
}
