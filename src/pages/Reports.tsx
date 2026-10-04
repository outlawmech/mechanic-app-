import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { encodeUtf8Base64, handoffCsv } from '../lib/csvHandoff';
import {
  BanknotesIcon,
  CreditCardIcon,
  ReceiptIcon,
  UsersIcon,
  BoxIcon,
  WrenchIcon,
  CheckIcon,
  ClockIcon,
  ArrowLeftIcon,
} from '../components/icons';
import { ACTION_BTN_CLS, Button, Card, PageTitle, Spinner } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { money, num, fullName, shortDate } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { getInvoiceBalanceDue, getInvoicePaidAmount } from '../lib/invoiceAccounting';
import {
  getLocalDateStamp,
  getPaymentsInDateRange,
  getReportDateBounds,
  isInReportDateRange,
  toCsv,
  toLocalDateOnly,
  type ReportDateRange,
} from '../lib/reporting';
import type { InvoiceFull, WorkItem, Part } from '../types';

export default function Reports() {
  const toast = useToast();
  const [range, setRange] = useState<ReportDateRange>('month');

  const { data, error, loading, reload } = useAsync(async () => {
    const sb = requireSupabase();
    const [invRes, itemsRes, partsRes] = await Promise.all([
      sb.from('invoices').select('*, customer:customers(*)').order('issued_at', { ascending: false }),
      sb.from('work_items').select('*'),
      sb.from('parts').select('*'),
    ]);

    check(invRes);
    check(itemsRes);
    check(partsRes);

    const invoices = (invRes.data ?? []) as InvoiceFull[];
    const items = (itemsRes.data ?? []) as WorkItem[];
    const parts = (partsRes.data ?? []) as Part[];

    return { invoices, items, parts };
  }, []);

  const rangeBounds = getReportDateBounds(range);

  // Invoice totals use issue date; collected totals use payment date.
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    return data.invoices.filter((invoice) => isInReportDateRange(invoice.issued_at, rangeBounds));
  }, [data?.invoices, rangeBounds.start, rangeBounds.endExclusive]);

  const reportingPayments = useMemo(() => {
    if (!data?.invoices) return [];
    return getPaymentsInDateRange(data.invoices.map((invoice) => ({
      ...invoice,
      customerName: fullName(invoice.customer),
    })), rangeBounds);
  }, [data?.invoices, rangeBounds.start, rangeBounds.endExclusive]);

  // Financial Metrics
  const metrics = useMemo(() => {
    let totalInvoiced = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let laborRevenue = 0;
    let partsRevenue = 0;
    let feesRevenue = 0;
    let taxCollected = 0;

    const methodTotals: Record<string, number> = {
      cash: 0,
      credit_card: 0,
      debit_card: 0,
      check: 0,
      zelle: 0,
      venmo: 0,
      cash_app: 0,
      bank_transfer: 0,
      other: 0,
    };

    const unpaidInvoices: InvoiceFull[] = [];

    filteredInvoices.forEach((inv) => {
      if (inv.status === 'void') return;
      const invTotal = num(inv.total);
      const invTax = num(inv.tax);
      totalInvoiced += invTotal;
      taxCollected += invTax;
      const balance = getInvoiceBalanceDue(inv);

      if (balance > 0) {
        totalOutstanding += balance;
        unpaidInvoices.push(inv);
      }
    });

    reportingPayments.forEach((payment) => {
      totalCollected += payment.amount;
      const method = payment.method || 'other';
      methodTotals[method] = (methodTotals[method] || 0) + payment.amount;
    });

    // Calculate labor vs parts breakdown from matching work items
    const filteredInvoiceIds = new Set(filteredInvoices
      .filter((invoice) => invoice.status !== 'void')
      .map((i) => i.work_order_id)
      .filter(Boolean));
    if (data?.items) {
      data.items.forEach((it) => {
        if (filteredInvoiceIds.has(it.work_order_id)) {
          const itemTotal = num(it.quantity) * num(it.unit_price);
          if (it.kind === 'labor') laborRevenue += itemTotal;
          else if (it.kind === 'part') partsRevenue += itemTotal;
          else feesRevenue += itemTotal;
        }
      });
    }

    // Inventory Valuation
    let totalInventoryCost = 0;
    let totalInventoryRetail = 0;
    if (data?.parts) {
      data.parts.forEach((p) => {
        const qty = num(p.qty_on_hand);
        totalInventoryCost += qty * num(p.cost_price);
        totalInventoryRetail += qty * num(p.sell_price);
      });
    }

    return {
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      laborRevenue,
      partsRevenue,
      feesRevenue,
      taxCollected,
      methodTotals,
      unpaidInvoices,
      totalInventoryCost,
      totalInventoryRetail,
    };
  }, [filteredInvoices, reportingPayments, data?.items, data?.parts]);

  // Accounting & CSV Exporters
  async function exportInvoicesCSV() {
    if (!filteredInvoices.length) {
      toast('No invoices to export for this date range', 'error');
      return;
    }

    const headers = ['Invoice Number', 'Customer', 'Email', 'Phone', 'Issue Date', 'Due Date', 'Subtotal', 'Tax', 'Total', 'Paid', 'Balance Due', 'Status'];
    const csvRows = filteredInvoices.map((inv) => {
      const paid = inv.status === 'void' ? 0 : getInvoicePaidAmount(inv);
      const balance = inv.status === 'void' ? 0 : getInvoiceBalanceDue(inv);
      return [inv.number, fullName(inv.customer), inv.customer.email || '', inv.customer.phone || '',
        toLocalDateOnly(inv.issued_at), toLocalDateOnly(inv.due_date), num(inv.subtotal), num(inv.tax),
        inv.status === 'void' ? 0 : num(inv.total), paid, balance, inv.status.toUpperCase()];
    });

    try {
      await downloadBlob(toCsv(headers, csvRows), `Invoice_Register_${range}_${getLocalDateStamp()}.csv`);
      toast(Capacitor.isNativePlatform() ? 'Invoice CSV shared' : 'Invoice register CSV ready');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not hand off invoice CSV', 'error');
    }
  }

  async function exportPaymentsCSV() {
    if (!reportingPayments.length) {
      toast('No recorded payments to export for this range', 'error');
      return;
    }

    const headers = ['Payment Date', 'Invoice Number', 'Customer', 'Amount', 'Payment Method', 'Reference Note'];
    const rows = reportingPayments.map((payment) => [
      toLocalDateOnly(payment.paymentDate), payment.invoiceNumber, payment.customerName,
      payment.amount, payment.method.toUpperCase(), payment.referenceNote,
    ]);
    try {
      await downloadBlob(toCsv(headers, rows), `Payment_Register_${range}_${getLocalDateStamp()}.csv`);
      toast(Capacitor.isNativePlatform() ? 'Payments CSV shared' : 'Payment register CSV ready');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not hand off payments CSV', 'error');
    }
  }

  async function exportInventoryCSV() {
    if (!data?.parts.length) {
      toast('No inventory items to export', 'error');
      return;
    }

    const headers = ['SKU', 'Part Name', 'Category', 'Location', 'Quantity On Hand', 'Unit Cost', 'Unit Sell', 'Total Cost Value', 'Total Retail Value', 'Supplier'];
    const rows = data.parts.map((p) => {
      const qty = num(p.qty_on_hand);
      const cost = num(p.cost_price);
      const sell = num(p.sell_price);
      return [p.sku, p.name, p.category, p.location || '', qty, cost, sell, qty * cost, qty * sell, p.supplier || ''];
    });

    try {
      await downloadBlob(toCsv(headers, rows), `Current_Inventory_Valuation_${getLocalDateStamp()}.csv`);
      toast(Capacitor.isNativePlatform() ? 'Inventory CSV shared' : 'Current inventory valuation CSV ready');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not hand off inventory CSV', 'error');
    }
  }

  async function downloadBlob(content: string, filename: string) {
    return handoffCsv(content, filename, {
      isNative: Capacitor.isNativePlatform(),
      shareNativeFile: async (csv, name) => {
        const { uri } = await Filesystem.writeFile({
          path: name,
          directory: Directory.Cache,
          data: encodeUtf8Base64(csv),
        });
        await Share.share({
          title: name,
          url: uri,
          dialogTitle: 'Save or share CSV',
        });
      },
      downloadInBrowser: (csv, name) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      },
      shareWebFile: async (file) => {
        if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
        await navigator.share({ files: [file], title: file.name });
        return true;
      },
    });
  }

  if (loading) return <Spinner />;
  if (error) return (
    <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
      <p className="font-bold">Reports could not be loaded</p>
      <p className="mt-1">Financial totals and exports are unavailable until the report data loads. {error}</p>
      <Button type="button" className="mt-4" onClick={() => void reload()}>Retry</Button>
    </div>
  );

  const rangeLabels: Record<ReportDateRange, string> = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    last_month: 'Last Month',
    year: 'Year to Date',
    all: 'All Time',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title="Financials &amp; Reports" sub="Track shop revenue, parts margins, and tax totals" />
        </div>

        {/* Date Filter Chips */}
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-200/80 p-1 text-xs font-bold">
          {(['today', 'week', 'month', 'last_month', 'year', 'all'] as ReportDateRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 transition ${
                range === r ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 space-y-1 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Collected Revenue</span>
            <BanknotesIcon className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{money(metrics.totalCollected)}</p>
          <p className="text-[11px] text-slate-300">
            Total Invoiced: <strong className="text-white">{money(metrics.totalInvoiced)}</strong>
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Accounts Receivable</span>
            <ClockIcon className="h-4 w-4 text-red-500" />
          </div>
          <p className={`text-2xl font-black ${metrics.totalOutstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {money(metrics.totalOutstanding)}
          </p>
          <p className="text-[11px] text-slate-500">
            {metrics.unpaidInvoices.length} unpaid / pending invoices
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Labor Earned</span>
            <WrenchIcon className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{money(metrics.laborRevenue)}</p>
          <p className="text-[11px] text-slate-500">
            Parts Billed: <strong className="text-slate-800">{money(metrics.partsRevenue)}</strong>
          </p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
            <span>Sales Tax on Invoices</span>
            <ReceiptIcon className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{money(metrics.taxCollected)}</p>
          <p className="text-[11px] text-slate-500">
            From nonvoid invoices issued in this range
          </p>
        </Card>
      </div>

      {/* Accounting & Spreadsheet Export Center */}
      <Card className="p-5 space-y-3 bg-orange-50/40 border-orange-200">
        <div className="flex items-center justify-between border-b border-orange-200/80 pb-2">
          <div>
            <h3 className="text-sm font-bold text-orange-950 uppercase tracking-wide">
              Accounting &amp; Bookkeeper CSVs
            </h3>
            <p className="text-xs text-orange-900/80">
              Download invoice, payment, and inventory registers to share with your bookkeeper or map during import. These files do not sync or post entries automatically.
            </p>
          </div>
          <span className="rounded-full bg-orange-200 px-2.5 py-0.5 text-[10px] font-bold text-orange-900">
            CSV Exports
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
          <Button
            type="button"
            variant="accent"
            onClick={exportInvoicesCSV}
            className={`${ACTION_BTN_CLS} shadow-xs`}
          >
            <ReceiptIcon className="h-4 w-4 text-slate-950" />
            <span>Export Invoices ({filteredInvoices.length})</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={exportPaymentsCSV}
            className={`${ACTION_BTN_CLS} bg-white border border-slate-200 font-semibold hover:bg-slate-50`}
          >
            <CreditCardIcon className="h-4 w-4 text-slate-700" />
            <span>Export Payments Received ({reportingPayments.length})</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={exportInventoryCSV}
            className={`${ACTION_BTN_CLS} bg-white border border-slate-200 font-semibold hover:bg-slate-50`}
          >
            <BoxIcon className="h-4 w-4 text-slate-700" />
            <span>Export Current Inventory ({data?.parts.length ?? 0})</span>
          </Button>
        </div>
      </Card>

      {/* 2-Column Section: Accounts Receivable & Payment Methods */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Unpaid / Overdue Invoices */}
        <div className="space-y-3 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Accounts Receivable (Unpaid Invoices)
            </h3>
            <span className="text-xs font-bold text-red-600">{money(metrics.totalOutstanding)} Due</span>
          </div>

          {metrics.unpaidInvoices.length === 0 ? (
            <Card className="p-6 text-center text-xs text-slate-400">
              <CheckIcon className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
              <p className="font-bold text-slate-700">All invoices are paid in full!</p>
              <p className="text-[11px] text-slate-400 mt-0.5">No outstanding balances in this date range.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {metrics.unpaidInvoices.map((inv) => {
                const balance = getInvoiceBalanceDue(inv);
                return (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-orange-400 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-600">{inv.number}</span>
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {fullName(inv.customer)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Issued: {shortDate(inv.issued_at)} · Due: {shortDate(inv.due_date)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-red-600">{money(balance)}</p>
                        <p className="text-[10px] text-slate-400">of {money(inv.total)}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Methods Breakdown */}
        <div className="space-y-3 lg:col-span-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            Income by Payment Method
          </h3>

          <Card className="p-4 space-y-3">
            <div className="space-y-2 divide-y divide-slate-100 text-xs">
              {Object.entries(metrics.methodTotals).map(([key, total]) => {
                const labels: Record<string, string> = {
                  cash: 'Cash',
                  credit_card: 'Credit Card',
                  debit_card: 'Debit Card',
                  check: 'Check',
                  zelle: 'Zelle',
                  venmo: 'Venmo',
                  cash_app: 'Cash App',
                  bank_transfer: 'Bank Transfer',
                  other: 'Other / Custom',
                };
                if (total <= 0) return null;
                return (
                  <div key={key} className="flex justify-between pt-1.5 first:pt-0">
                    <span className="font-medium text-slate-600">{labels[key] || key}</span>
                    <span className="font-mono font-bold text-slate-900">{money(total)}</span>
                  </div>
                );
              })}
              {metrics.totalCollected === 0 && (
                <p className="text-center text-xs text-slate-400 py-3">No payments recorded in this period.</p>
              )}
            </div>

            {metrics.totalCollected > 0 && (
              <div className="border-t border-slate-200 pt-2 flex justify-between text-xs font-bold">
                <span className="text-slate-800">Total Collected:</span>
                <span className="font-mono text-emerald-700 font-black">{money(metrics.totalCollected)}</span>
              </div>
            )}
          </Card>

          {/* Stock Inventory Value Widget */}
          <Card className="p-4 space-y-1.5 bg-slate-50 border-slate-200 text-xs">
            <div className="flex items-center justify-between text-slate-500 font-bold uppercase tracking-wide text-[10px]">
              <span>Current Stock Asset Value</span>
              <BoxIcon className="h-3.5 w-3.5 text-slate-600" />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Cost (Your Investment):</span>
              <span className="font-mono font-bold text-slate-800">{money(metrics.totalInventoryCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Retail (Potential Sales):</span>
              <span className="font-mono font-bold text-emerald-700">{money(metrics.totalInventoryRetail)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
