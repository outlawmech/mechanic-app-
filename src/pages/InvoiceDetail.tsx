import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, ClockIcon, MailIcon, PrinterIcon, ShareIcon, CheckIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useShopSettings } from '../lib/settings';
import {
  formatInvoiceText,
  fullName,
  getVehicleTypeInfo,
  longDate,
  money,
  num,
  vehicleLabel,
} from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { InvoiceFull, Vehicle, WorkItem, WorkOrder } from '../types';

import { safeFetchWithCache, enqueueOfflineAction } from '../lib/offlineSync';

const KIND_LABEL: Record<string, string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };

export default function InvoiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { settings } = useShopSettings();
  const [acting, setActing] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    return safeFetchWithCache(
      `inv_${id}`,
      async () => {
        const sb = requireSupabase();
        const invRes = check(
          await sb.from('invoices').select('*, customer:customers(*)').eq('id', id!).limit(1)
        );
        const invoice = (invRes.data?.[0] ?? null) as InvoiceFull | null;
        let items: WorkItem[] = [];
        let vehicle: Vehicle | null = null;
        let workOrder: WorkOrder | null = null;
        if (invoice?.work_order_id) {
          const [woRes, itemsRes] = await Promise.all([
            sb
              .from('work_orders')
              .select('*, vehicle:vehicles(*)')
              .eq('id', invoice.work_order_id)
              .limit(1),
            sb.from('work_items').select('*').eq('work_order_id', invoice.work_order_id).order('sort_order'),
          ]);
          check(woRes);
          check(itemsRes);
          const woData = woRes.data?.[0] as (WorkOrder & { vehicle?: Vehicle | null }) | undefined;
          workOrder = woData ?? null;
          vehicle = woData?.vehicle ?? null;
          items = (itemsRes.data ?? []) as WorkItem[];
        }
        return { invoice, items, vehicle, workOrder };
      },
      { invoice: null, items: [], vehicle: null, workOrder: null }
    );
  }, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const { invoice, items, vehicle, workOrder } = data!;
  if (!invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        action={
          <Link to="/invoices">
            <Button variant="ghost">Back to invoices</Button>
          </Link>
        }
      />
    );
  }

  const vInfo = vehicle ? getVehicleTypeInfo(vehicle.type) : null;

  async function markPaid() {
    setActing(true);
    try {
      check(
        await requireSupabase()
          .from('invoices')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', invoice!.id)
      );
      toast('Payment recorded');
      await reload();
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setActing(false);
    }
  }

  function handleEmailInvoice() {
    const { subject, body } = formatInvoiceText(invoice!, items, vehicle, settings);
    const mailto = `mailto:${encodeURIComponent(invoice!.customer.email || '')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  async function handleShareInvoice() {
    const { subject, body } = formatInvoiceText(invoice!, items, vehicle, settings);
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
      toast('Invoice text copied to clipboard! Ready to text or paste.');
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  }

  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Link
          to="/invoices"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to Invoices
        </Link>
      </div>

      {/* Responsive 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column on Desktop (Actions & Info) */}
        <div className="no-print space-y-4 lg:col-span-4">
          <PageTitle title={invoice.number} right={<StatusPill status={invoice.status} />} />

          <Card className="space-y-3 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice Actions</h3>
            
            {invoice.status === 'unpaid' && (
              <Button variant="success" className="w-full text-xs font-bold" disabled={acting} onClick={markPaid}>
                <CheckIcon className="h-4 w-4" /> Mark as Paid (${money(invoice.total)})
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full text-xs"
              onClick={() => window.print()}
            >
              <PrinterIcon className="h-4 w-4 text-slate-600" /> Print / Save PDF
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={handleEmailInvoice}
                className="text-xs"
                title="Open email draft with full invoice breakdown"
              >
                <MailIcon className="h-4 w-4 text-slate-600" /> Email
              </Button>
              <Button
                variant="ghost"
                onClick={handleShareInvoice}
                className="text-xs"
                title="Share via text/SMS or copy text"
              >
                <ShareIcon className="h-4 w-4 text-slate-600" /> Text / SMS
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-2 text-xs text-slate-600">
            <p className="font-bold text-slate-900 uppercase tracking-wide text-[10px]">Customer Details</p>
            <p className="font-semibold text-slate-800">{fullName(invoice.customer)}</p>
            {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
            {invoice.customer.email && <p>{invoice.customer.email}</p>}
            {invoice.work_order_id && (
              <div className="border-t border-slate-100 pt-2 mt-2">
                <Link
                  to={`/work/${invoice.work_order_id}`}
                  className="font-bold text-amber-600 hover:text-amber-700"
                >
                  View Associated Repair Order (RO) →
                </Link>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column on Desktop: Clean Printable Paper Layout */}
        <div className="lg:col-span-8">
          <div id="print-area" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/10 max-w-2xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-2xl font-black tracking-tight text-slate-900">INVOICE</p>
                <p className="mt-1 font-mono text-xs font-bold text-slate-500">{invoice.number}</p>
              </div>
              <div className="flex flex-col items-end text-right">
                {settings.logo_url && (
                  <img
                    src={settings.logo_url}
                    alt={settings.shop_name}
                    className="mb-1.5 max-h-14 max-w-[160px] object-contain"
                  />
                )}
                <p className="text-sm font-bold text-slate-900">{settings.shop_name}</p>
                {settings.tagline && <p className="text-xs text-slate-500">{settings.tagline}</p>}
                {settings.phone && <p className="text-[11px] text-slate-400">{settings.phone}</p>}
                {settings.email && <p className="text-[11px] text-slate-400">{settings.email}</p>}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-bold uppercase tracking-wide text-slate-400">Bill to</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{fullName(invoice.customer)}</p>
                {invoice.customer.address && <p className="text-slate-500">{invoice.customer.address}</p>}
                {invoice.customer.phone && <p className="text-slate-500">{invoice.customer.phone}</p>}
                {invoice.customer.email && <p className="text-slate-500">{invoice.customer.email}</p>}
              </div>
              <div className="text-right">
                <p className="text-slate-500">
                  Issued: <span className="font-semibold text-slate-800">{longDate(invoice.issued_at)}</span>
                </p>
                <p className="mt-1 text-slate-500">
                  Due: <span className="font-semibold text-slate-800">{longDate(invoice.due_date)}</span>
                </p>
                {invoice.paid_at && (
                  <p className="mt-1 font-bold text-emerald-600">
                    Paid {longDate(invoice.paid_at)}
                  </p>
                )}
              </div>
            </div>

            {vehicle && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{vInfo?.emoji}</span>
                    <span className="font-bold">{vehicleLabel(vehicle)}</span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      {vInfo?.shortLabel}
                    </span>
                  </div>
                  {workOrder?.mileage_or_hours && (
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
                      <ClockIcon className="h-3.5 w-3.5 text-slate-400" />
                      {workOrder.mileage_or_hours}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                  {vehicle.plate && (
                    <span>
                      {vInfo?.regLabel}: <strong className="text-slate-700">{vehicle.plate}</strong>
                    </span>
                  )}
                  {vehicle.vin && (
                    <span>
                      {vInfo?.idLabel}: <strong className="text-slate-700">{vehicle.vin}</strong>
                    </span>
                  )}
                </div>

                {/* Engine 1 & 2 details */}
                {(vehicle.engine_info || vehicle.engine2_info) && (
                  <div className="border-t border-slate-200/60 pt-1 text-[11px] text-slate-600 space-y-0.5">
                    {vehicle.engine_info && (
                      <p>
                        <strong className="text-slate-700">
                          {vehicle.engine2_info ? 'Main Engine:' : 'Engine:'}
                        </strong>{' '}
                        {vehicle.engine_info}
                        {vehicle.engine_serial ? ` (S/N: ${vehicle.engine_serial})` : ''}
                        {vehicle.engine_hours ? ` · ${vehicle.engine_hours} hrs` : ''}
                      </p>
                    )}
                    {vehicle.engine2_info && (
                      <p>
                        <strong className="text-slate-700">Second Engine / Kicker:</strong>{' '}
                        {vehicle.engine2_info}
                        {vehicle.engine2_serial ? ` (S/N: ${vehicle.engine2_serial})` : ''}
                        {vehicle.engine2_hours ? ` · ${vehicle.engine2_hours} hrs` : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-2 font-bold">Description</th>
                  <th className="pb-2 text-right font-bold">Qty</th>
                  <th className="pb-2 text-right font-bold">Rate</th>
                  <th className="pb-2 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs text-slate-400">
                      No line items
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 align-top">
                      <td className="py-2.5 pr-2">
                        <p className="font-medium text-slate-800">{it.description}</p>
                        {KIND_LABEL[it.kind] && (
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">
                            {KIND_LABEL[it.kind]}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{num(it.quantity)}</td>
                      <td className="py-2.5 text-right text-slate-600">{money(it.unit_price)}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {money(num(it.quantity) * num(it.unit_price))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mt-4 ml-auto w-56 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>{money(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Tax ({(num(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)</span>
                <span>{money(invoice.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-black text-slate-900">
                <span>Total</span>
                <span>{money(invoice.total)}</span>
              </div>
            </div>

            {invoice.notes && <p className="mt-4 text-xs text-slate-500">{invoice.notes}</p>}

            <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
              {settings.invoice_notes ||
                `${settings.shop_name} · Payments due on or before the due date.`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'paid'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : status === 'void'
        ? 'bg-red-50 text-red-600 ring-red-600/20'
        : 'bg-amber-50 text-amber-700 ring-amber-600/20';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}
