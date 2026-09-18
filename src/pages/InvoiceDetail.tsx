import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { ArrowLeftIcon, ClockIcon, MailIcon, PrinterIcon, ShareIcon } from '../components/icons';
import { Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
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

const KIND_LABEL: Record<string, string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };

export default function InvoiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [acting, setActing] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const sb = requireSupabase();
    const invRes = check(
      await sb.from('invoices').select('*, customer:customers(*)').eq('id', id!).maybeSingle()
    );
    const invoice = (invRes.data ?? null) as InvoiceFull | null;
    let items: WorkItem[] = [];
    let vehicle: Vehicle | null = null;
    let workOrder: WorkOrder | null = null;
    if (invoice?.work_order_id) {
      const [woRes, itemsRes] = await Promise.all([
        sb
          .from('work_orders')
          .select('*, vehicle:vehicles(*)')
          .eq('id', invoice.work_order_id)
          .maybeSingle(),
        sb.from('work_items').select('*').eq('work_order_id', invoice.work_order_id).order('sort_order'),
      ]);
      check(woRes);
      check(itemsRes);
      workOrder = (woRes.data ?? null) as WorkOrder | null;
      vehicle = ((woRes.data as { vehicle?: Vehicle | null } | null)?.vehicle ?? null) as
        Vehicle | null;
      items = (itemsRes.data ?? []) as WorkItem[];
    }
    return { invoice, items, vehicle, workOrder };
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
    const { subject, body } = formatInvoiceText(invoice!, items, vehicle);
    const mailto = `mailto:${encodeURIComponent(invoice!.customer.email || '')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  async function handleShareInvoice() {
    const { subject, body } = formatInvoiceText(invoice!, items, vehicle);
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
    <div>
      <div className="no-print">
        <Link
          to="/invoices"
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Invoices
        </Link>
        <PageTitle title={invoice.number} right={<StatusPill status={invoice.status} />} />
      </div>

      {/* Action Buttons */}
      <div className="no-print mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            onClick={handleEmailInvoice}
            title="Open email draft with full invoice breakdown"
          >
            <MailIcon className="h-4 w-4 text-slate-600" /> Email Invoice
          </Button>
          <Button
            variant="ghost"
            onClick={handleShareInvoice}
            title="Share via text/SMS or copy text"
          >
            <ShareIcon className="h-4 w-4 text-slate-600" /> Share / Text
          </Button>
        </div>

        <div className="flex gap-2">
          {invoice.status === 'unpaid' && (
            <Button variant="success" className="flex-1" disabled={acting} onClick={markPaid}>
              ✓ Mark paid
            </Button>
          )}
          <Button variant="ghost" className="flex-1" onClick={() => window.print()}>
            <span className="inline-flex items-center gap-2">
              <PrinterIcon className="h-4 w-4" /> Print / PDF
            </span>
          </Button>
        </div>
      </div>

      {/* Printable Invoice Area */}
      <div id="print-area" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xl font-black tracking-tight text-slate-900">INVOICE</p>
            <p className="mt-1 font-mono text-xs font-semibold text-slate-500">{invoice.number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">Outlaw Mech</p>
            <p className="text-xs text-slate-500">Mobile Mechanic & Field Service</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-slate-400">Bill to</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{fullName(invoice.customer)}</p>
            {invoice.customer.address && <p className="text-slate-500">{invoice.customer.address}</p>}
            {invoice.customer.phone && <p className="text-slate-500">{invoice.customer.phone}</p>}
            {invoice.customer.email && <p className="text-slate-500">{invoice.customer.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-slate-500">
              Issued <span className="font-semibold text-slate-700">{longDate(invoice.issued_at)}</span>
            </p>
            <p className="mt-1 text-slate-500">
              Due <span className="font-semibold text-slate-700">{longDate(invoice.due_date)}</span>
            </p>
            {invoice.paid_at && (
              <p className="mt-1 font-semibold text-emerald-600">
                Paid {longDate(invoice.paid_at)}
              </p>
            )}
          </div>
        </div>

        {vehicle && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{vInfo?.emoji}</span>
                <span className="font-semibold">{vehicleLabel(vehicle)}</span>
                <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] font-medium text-slate-700">
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

            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
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
              {vehicle.engine_info && (
                <span>
                  Engine: <span className="italic text-slate-700">{vehicle.engine_info}</span>
                </span>
              )}
            </div>
          </div>
        )}

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="pb-2 font-semibold">Description</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Rate</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
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
                    <p className="text-slate-800">{it.description}</p>
                    {KIND_LABEL[it.kind] && (
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">
                        {KIND_LABEL[it.kind]}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{num(it.quantity)}</td>
                  <td className="py-2.5 text-right text-slate-600">{money(it.unit_price)}</td>
                  <td className="py-2.5 text-right font-medium text-slate-900">
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
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
            <span>Total</span>
            <span>{money(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes && <p className="mt-4 text-xs text-slate-500">{invoice.notes}</p>}

        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
          Thank you for your business — Outlaw Mech · Payments due on or before the due date.
        </p>
      </div>

      <div className="no-print mt-3">
        <Card className="flex items-center justify-between p-4">
          <span className="text-xs text-slate-500">
            {invoice.status === 'paid'
              ? `Paid ${invoice.paid_at ? longDate(invoice.paid_at) : ''}`
              : 'Mark as paid once the customer pays.'}
          </span>
        </Card>
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
