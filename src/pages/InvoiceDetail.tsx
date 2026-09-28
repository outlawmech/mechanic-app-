import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import {
  ArrowLeftIcon,
  ClockIcon,
  MailIcon,
  PrinterIcon,
  ShareIcon,
  CheckIcon,
  TrashIcon,
  BanknotesIcon,
  CreditCardIcon,
  BuildingBankIcon,
  ChatBubbleIcon,
  TagIcon,
  SendIcon,
  SmartphoneIcon,
  ReceiptIcon,
  VehicleIcon,
} from '../components/icons';
import { Button, Card, EmptyState, ErrorState, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { useShopSettings } from '../lib/settings';
import { useAuth } from '../lib/auth';
import {
  formatInvoiceText,
  fullName,
  getVehicleTypeInfo,
  longDate,
  money,
  num,
  round2,
  vehicleLabel,
} from '../lib/format';
import { check, errMsg, requireSupabase } from '../lib/supabase';
import type { InvoiceFull, InvoicePayment, PaymentMethod, Vehicle, WorkItem, WorkOrder } from '../types';
import { safeFetchWithCache, enqueueOfflineAction, cacheLocal, generateUUID } from '../lib/offlineSync';
import { getWorkOrderSignature } from '../lib/photoStorage';
import { getInvoiceBalanceDue, getInvoicePaidAmount } from '../lib/invoiceAccounting';
import { printInvoiceDocument } from '../lib/printer';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

const KIND_LABEL: Record<string, string> = { labor: 'Labor', part: 'Part', fee: 'Fee' };

const PAYMENT_METHODS: Record<
  PaymentMethod,
  { label: string; icon: (p: { className?: string }) => React.ReactNode }
> = {
  cash: { label: 'Cash', icon: BanknotesIcon },
  credit_card: { label: 'Credit Card', icon: CreditCardIcon },
  debit_card: { label: 'Debit Card', icon: CreditCardIcon },
  check: { label: 'Check', icon: ReceiptIcon },
  zelle: { label: 'Zelle', icon: SendIcon },
  venmo: { label: 'Venmo', icon: SmartphoneIcon },
  cash_app: { label: 'Cash App', icon: SmartphoneIcon },
  bank_transfer: { label: 'Bank Transfer', icon: BuildingBankIcon },
  other: { label: 'Other', icon: TagIcon },
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { settings, memberName } = useShopSettings();
  const { user } = useAuth();
  const [acting, setActing] = useState(false);

  // Split payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payRef, setPayRef] = useState('');

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
          if (workOrder) {
            const storedSig = await getWorkOrderSignature(workOrder.id);
            if (storedSig) {
              workOrder.signature_url = storedSig.signature_url;
              workOrder.signed_by_name = storedSig.signed_by_name;
              workOrder.signed_at = storedSig.signed_at;
            }
          }
          vehicle = woData?.vehicle ?? null;
          items = (itemsRes.data ?? []) as WorkItem[];
        }

        // Initialize payments array if undefined
        if (invoice && !invoice.payments) {
          invoice.payments = [];
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
  const paymentsList = invoice.payments ?? [];

  // Use the same legacy-aware balance calculation as the invoice list and reports.
  const totalPaid = getInvoicePaidAmount(invoice);
  const balanceDue = getInvoiceBalanceDue(invoice);
  const isFullyPaid = balanceDue <= 0;
  const paymentAmount = Number(payAmount);
  const paymentAmountValid = Number.isFinite(paymentAmount) && paymentAmount > 0 && paymentAmount <= balanceDue;

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = round2(Number(payAmount));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast('Enter a payment greater than $0.00.', 'error');
      return;
    }
    if (amountNum > balanceDue) {
      toast(`Payment cannot exceed the remaining balance of ${money(balanceDue)}.`, 'error');
      return;
    }

    setActing(true);
    const newPayment: InvoicePayment = {
      id: generateUUID(),
      invoice_id: invoice!.id,
      amount: amountNum,
      method: payMethod,
      reference_note: payRef.trim(),
      created_at: new Date().toISOString(),
      cashier_user_id: user?.id,
      cashier_name: memberName,
    };

    const nextPayments = [...paymentsList, newPayment];
    const newTotalPaid = round2(nextPayments.reduce((s, p) => s + num(p.amount), 0));
    const nextStatus = newTotalPaid >= num(invoice!.total) ? 'paid' : 'partial';

    try {
      let confirmedPayments = nextPayments;
      let confirmedStatus: InvoiceFull['status'] = nextStatus as InvoiceFull['status'];
      let confirmedPaidAt = nextStatus === 'paid' ? new Date().toISOString() : null;
      let savedOffline = false;

      if (navigator.onLine) {
        const saveResult = check(
          await requireSupabase()
            .from('invoices')
            .update({
              status: nextStatus,
              payments: nextPayments,
              paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
            })
            .eq('id', invoice!.id)
            .select('id, status, payments, paid_at')
            .maybeSingle()
        );
        const savedInvoice = saveResult.data;
        if (!savedInvoice) {
          throw new Error('Supabase did not confirm an updated invoice. The payment was not marked as saved. Reload before retrying.');
        }

        const persistedPayments = (savedInvoice.payments ?? []) as InvoicePayment[];
        const persistedPayment = persistedPayments.find((payment) => payment.id === newPayment.id);
        if (!persistedPayment || num(persistedPayment.amount) !== amountNum) {
          throw new Error('Supabase did not confirm this payment in the invoice history. Reload before retrying.');
        }

        confirmedPayments = persistedPayments;
        confirmedStatus = savedInvoice.status as InvoiceFull['status'];
        confirmedPaidAt = savedInvoice.paid_at;
      } else {
        enqueueOfflineAction({
          table: 'invoices',
          type: 'update',
          payload: {
            status: nextStatus,
            payments: nextPayments,
            paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
          },
          matchField: 'id',
          matchValue: invoice!.id,
          description: `Record payment on invoice #${invoice!.number}`,
        });
        savedOffline = true;
      }

      invoice!.payments = confirmedPayments;
      invoice!.status = confirmedStatus;
      invoice!.paid_at = confirmedPaidAt;
      cacheLocal(`inv_${id}`, data);
      setShowPaymentForm(false);
      setPayAmount('');
      setPayRef('');
      toast(
        savedOffline
          ? 'Payment saved on this device; database sync is still pending.'
          : `Payment of ${money(amountNum)} confirmed in the invoice record.`
      );
    } catch (err) {
      toast(errMsg(err) || 'Payment could not be saved.', 'error');
    } finally {
      setActing(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm('Delete this payment entry?')) return;
    const nextPayments = paymentsList.filter((p) => p.id !== paymentId);
    const newTotalPaid = round2(nextPayments.reduce((s, p) => s + num(p.amount), 0));
    const nextStatus = newTotalPaid >= num(invoice!.total) ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';

    try {
      let confirmedPayments = nextPayments;
      let confirmedStatus: InvoiceFull['status'] = nextStatus as InvoiceFull['status'];
      let confirmedPaidAt = nextStatus === 'paid' ? invoice!.paid_at : null;
      let savedOffline = false;

      if (navigator.onLine) {
        const saveResult = check(
          await requireSupabase()
            .from('invoices')
            .update({
              status: nextStatus,
              payments: nextPayments,
              paid_at: confirmedPaidAt,
            })
            .eq('id', invoice!.id)
            .select('id, status, payments, paid_at')
            .maybeSingle()
        );
        const savedInvoice = saveResult.data;
        if (!savedInvoice) {
          throw new Error('Supabase did not confirm the invoice update. Reload before trying again.');
        }
        const persistedPayments = (savedInvoice.payments ?? []) as InvoicePayment[];
        if (persistedPayments.some((payment) => payment.id === paymentId)) {
          throw new Error('Supabase still returned the payment being removed. Reload before trying again.');
        }
        confirmedPayments = persistedPayments;
        confirmedStatus = savedInvoice.status as InvoiceFull['status'];
        confirmedPaidAt = savedInvoice.paid_at;
      } else {
        enqueueOfflineAction({
          table: 'invoices',
          type: 'update',
          payload: {
            status: nextStatus,
            payments: nextPayments,
            paid_at: confirmedPaidAt,
          },
          matchField: 'id',
          matchValue: invoice!.id,
          description: `Remove payment from invoice #${invoice!.number}`,
        });
        savedOffline = true;
      }

      invoice!.payments = confirmedPayments;
      invoice!.status = confirmedStatus;
      invoice!.paid_at = confirmedPaidAt;
      cacheLocal(`inv_${id}`, data);
      toast(savedOffline ? 'Payment removal queued; database sync is pending.' : 'Payment removed from the invoice record.');
    } catch (err) {
      toast(errMsg(err) || 'Payment could not be removed.', 'error');
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
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: subject,
          text: body,
          dialogTitle: `Share Invoice #${invoice!.number}`,
        });
        return;
      } catch {}
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: subject,
          text: body,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(body);
      toast('Invoice summary copied to clipboard! Ready to text or paste.');
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  }

  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const currentLineItemsSubtotal = round2(
    sortedItems.reduce((sum, item) => sum + num(item.quantity) * num(item.unit_price), 0)
  );
  const invoiceLineItemsMismatch = Boolean(invoice.work_order_id) &&
    Math.abs(currentLineItemsSubtotal - num(invoice.subtotal)) >= 0.01;

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
        {/* Left Column on Desktop (Actions, Payment Recording & Info) */}
        <div className="no-print space-y-4 lg:col-span-4">
          <PageTitle
            title={invoice.number}
            right={
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                  isFullyPaid
                    ? 'bg-emerald-100 text-emerald-800'
                    : invoice.status === 'partial'
                      ? 'bg-orange-100 text-orange-900'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {isFullyPaid ? 'Paid' : invoice.status === 'partial' ? 'Partial' : 'Unpaid'}
              </span>
            }
          />

          {/* Payment Summary Box */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Balance & Payments</h3>
              <span className="text-xs font-black text-slate-900">Total: {money(invoice.total)}</span>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total Invoiced:</span>
                <span className="font-bold text-slate-900">{money(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-emerald-700">Amount Paid:</span>
                <span className="font-bold text-emerald-700">-{money(totalPaid)}</span>
              </div>
              <div className="border-t border-slate-200/80 pt-1.5 flex justify-between text-sm">
                <span className="font-bold text-slate-800">Balance Due:</span>
                <span className={`font-black ${balanceDue <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {balanceDue <= 0 ? '$0.00 (PAID)' : money(balanceDue)}
                </span>
              </div>
            </div>

            {/* Record Payment Button / Form */}
            {balanceDue > 0 && !showPaymentForm && (
              <Button
                variant="accent"
                className="w-full text-xs font-bold shadow-sm flex items-center justify-center gap-2"
                onClick={() => {
                  setPayAmount(String(balanceDue));
                  setShowPaymentForm(true);
                }}
              >
                <CreditCardIcon className="h-4 w-4" />
                <span>Record Payment ({money(balanceDue)})</span>
              </Button>
            )}

            {/* Split Payment Form */}
            {showPaymentForm && (
              <form onSubmit={handleAddPayment} className="space-y-3 rounded-xl border border-orange-300 bg-orange-50/50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-orange-950 uppercase tracking-wide">Record Payment</p>
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Amount ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={balanceDue}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      required
                    />
                    {payAmount !== '' && !paymentAmountValid && (
                      <p className="mt-1 text-[10px] font-semibold text-red-600" role="alert">
                        Enter more than $0 and no more than {money(balanceDue)} due.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Payment Method
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900"
                    >
                      {Object.entries(PAYMENT_METHODS).map(([key, info]) => (
                        <option key={key} value={key}>
                          {info.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Check # / Transaction Ref / Note
                  </label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. Check #4102 / Zelle ref #9823 / Cash on tail"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <Button type="submit" variant="success" disabled={acting || !paymentAmountValid} className="w-full text-xs font-bold">
                  <CheckIcon className="h-4 w-4" /> Save Payment
                </Button>
              </form>
            )}

            {/* List of Recorded Payments */}
            {paymentsList.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment History</p>
                {paymentsList.map((p) => {
                  const mInfo = PAYMENT_METHODS[p.method] || PAYMENT_METHODS.other;
                  const Icon = mInfo.icon;
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                        <span className="font-semibold text-slate-800">
                          {mInfo.label} — <span className="font-bold text-emerald-700">{money(p.amount)}</span>
                        </span>
                        {p.reference_note && <span className="text-[10px] text-slate-500 truncate">({p.reference_note})</span>}
                        {p.cashier_name && <span className="text-[10px] text-slate-500 truncate">Cashier: {p.cashier_name}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(p.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Delete Payment"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Quick Actions (Print, Email, Text) */}
          <Card className="space-y-2.5 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Share & Print</h3>
            
            <Button
              variant="accent"
              className="w-full text-xs font-bold shadow-sm flex items-center justify-center gap-2"
              onClick={() => printInvoiceDocument(invoice, items, vehicle, settings, workOrder)}
              title="Open native printer spooler to Save as PDF or print wirelessly"
            >
              <PrinterIcon className="h-4 w-4 text-slate-950" />
              <span>🖨️ Print / Save PDF</span>
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={handleEmailInvoice}
                className="text-xs font-semibold"
                title="Open email draft to customer with full invoice breakdown"
              >
                <MailIcon className="h-4 w-4 text-slate-600" /> Email
              </Button>
              <Button
                variant="ghost"
                onClick={handleShareInvoice}
                className="text-xs font-semibold"
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
                  className="font-bold text-orange-600 hover:text-orange-700"
                >
                  View Associated Work Order (WO) →
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
                {isFullyPaid && (
                  <p className="mt-1 font-bold text-emerald-600">
                    Paid in Full {invoice.paid_at ? `(${longDate(invoice.paid_at)})` : ''}
                  </p>
                )}
              </div>
            </div>

            {vehicle && (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <VehicleIcon type={vehicle.type} className="h-4 w-4 text-slate-700 shrink-0" />
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
                  {vehicle.vin && <span>{vInfo?.idLabel}: <strong className="font-mono text-slate-700">{vehicle.vin}</strong></span>}
                  {vehicle.plate && <span>{vInfo?.regLabel}: <strong className="font-mono text-slate-700">{vehicle.plate}</strong></span>}
                  {vehicle.engine_info && <span>Engine: <strong className="text-slate-700">{vehicle.engine_info}</strong></span>}
                </div>
              </div>
            )}

            {invoiceLineItemsMismatch && (
              <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="alert">
                <p className="font-bold">Work order items no longer match this issued invoice.</p>
                <p className="mt-1">
                  The invoice was issued with a subtotal of {money(invoice.subtotal)}. Its linked work order now has line items totaling {money(currentLineItemsSubtotal)}. The issued invoice totals and balance have not been changed. Invoiced work order line items are locked; record additional work on a separate work order.
                </p>
              </div>
            )}

            {/* Line items table */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-slate-400 italic">
                        No line items on this invoice.
                      </td>
                    </tr>
                  ) : (
                    sortedItems.map((it) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-slate-800">{it.description}</p>
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            {KIND_LABEL[it.kind] || it.kind}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600">{it.quantity}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-600">{money(it.unit_price)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">
                          {money(num(it.quantity) * num(it.unit_price))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Subtotal, Tax, Total, and Payment Breakdown */}
            <div className="mt-4 flex justify-end text-xs">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">{money(invoice.subtotal)}</span>
                </div>
                {num(invoice.tax) > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Tax ({(num(invoice.tax_rate) * 100).toFixed(1)}%)</span>
                    <span className="font-mono">{money(invoice.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
                  <span>Total</span>
                  <span className="font-mono text-base">{money(invoice.total)}</span>
                </div>

                {/* Paid amount & Balance Due */}
                {totalPaid > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700 border-t border-slate-100 pt-1">
                    <span>Total Payments:</span>
                    <span className="font-mono font-bold">-{money(totalPaid)}</span>
                  </div>
                )}
                {paymentsList.filter((payment) => payment.cashier_name).map((payment) => (
                  <div key={payment.id} className="flex justify-between text-[10px] text-slate-500">
                    <span>Cashier: {payment.cashier_name}</span><span>{money(payment.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-300 pt-1.5 text-xs font-bold">
                  <span className={balanceDue <= 0 ? 'text-emerald-700' : 'text-slate-800'}>
                    {balanceDue <= 0 ? 'Paid in Full' : 'Balance Due:'}
                  </span>
                  <span className={`font-mono text-sm ${balanceDue <= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {balanceDue <= 0 ? '$0.00' : money(balanceDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Finger Signature Preview on Receipt (if signed) */}
            {workOrder?.signature_url && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-800">Customer Authorization & Acceptance</p>
                  <p className="text-[10px] text-slate-500">
                    Signed by {workOrder.signed_by_name || fullName(invoice.customer)}{' '}
                    {workOrder.signed_at ? `on ${new Date(workOrder.signed_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <img
                  src={workOrder.signature_url}
                  alt="Customer Signature"
                  className="max-h-12 object-contain"
                />
              </div>
            )}

            {/* Shop Notes on printable invoice */}
            {(invoice.notes || settings.invoice_notes) && (
              <div className="mt-6 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <p className="font-bold text-slate-700">Notes / Payment Terms:</p>
                <p className="mt-0.5">{invoice.notes || settings.invoice_notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
