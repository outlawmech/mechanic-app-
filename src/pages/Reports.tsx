import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
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
import { Button, Card, PageTitle, Spinner, ErrorState } from '../components/ui';
import { useAsync } from '../lib/hooks';
import { money, num, fullName, longDate, shortDate } from '../lib/format';
import { check, requireSupabase } from '../lib/supabase';
import { safeFetchWithCache } from '../lib/offlineSync';
import type { InvoiceFull, WorkItem, Part } from '../types';

type DateRange = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'all';

export default function Reports() {
  const toast = useToast();
  const [range, setRange] = useState<DateRange>('month');

  const { data, error, loading } = useAsync(async () => {
    return safeFetchWithCache(
      'shop_financial_reports',
      async () => {
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
      },
      { invoices: [], items: [], parts: [] }
    );
  }, []);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

  // Filter Invoices by Range
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    return data.invoices.filter((inv) => {
      const time = new Date(inv.issued_at).getTime();
      switch (range) {
        case 'today':
          return time >= startOfToday;
        case 'week':
          return time >= startOfWeek;
        case 'month':
          return time >= startOfMonth;
        case 'last_month':
          return time >= startOfLastMonth && time <= endOfLastMonth;
        case 'year':
          return time >= startOfYear;
        case 'all':
        default:
          return true;
      }
    });
  }, [data?.invoices, range, startOfToday, startOfWeek, startOfMonth, startOfLastMonth, endOfLastMonth, startOfYear]);

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
      const invTotal = num(inv.total);
      const invTax = num(inv.tax);
      totalInvoiced += invTotal;
      taxCollected += invTax;

      const payments = inv.payments || [];
      const paidSum = payments.reduce((sum, p) => {
        const amt = num(p.amount);
        const method = p.method || 'other';
        methodTotals[method] = (methodTotals[method] || 0) + amt;
        return sum + amt;
      }, 0);

      totalCollected += paidSum;
      const balance = Math.max(0, invTotal - paidSum);

      if (balance > 0 && inv.status !== 'void') {
        totalOutstanding += balance;
        unpaidInvoices.push(inv);
      }
    });

    // Calculate labor vs parts breakdown from matching work items
    const filteredInvoiceIds = new Set(filteredInvoices.map((i) => i.work_order_id).filter(Boolean));
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
  }, [filteredInvoices, data?.items, data?.parts]);

  // QuickBooks & CSV Exporters
  function exportInvoicesCSV() {
    if (!filteredInvoices.length) {
      toast('No invoices to export for this date range', 'error');
      return;
    }

    const headers = ['InvoiceNo', 'Customer', 'Email', 'Phone', 'IssuedDate', 'DueDate', 'Subtotal', 'Tax', 'Total', 'Paid', 'BalanceDue', 'Status'];
    const rows = filteredInvoices.map((inv) => {
      const paid = (inv.payments || []).reduce((s, p) => s + num(p.amount), 0);
      const balance = Math.max(0, num(inv.total) - paid);
      return [
        `"${inv.number}"`,
        `"${fullName(inv.customer).replace(/"/g, '""')}"`,
        `"${inv.customer.email || ''}"`,
        `"${inv.customer.phone || ''}"`,
        `"${inv.issued_at.slice(0, 10)}"`,
        `"${inv.due_date ? inv.due_date.slice(0, 10) : ''}"`,
        num(inv.subtotal).toFixed(2),
        num(inv.tax).toFixed(2),
        num(inv.total).toFixed(2),
        paid.toFixed(2),
        balance.toFixed(2),
        `"${inv.status.toUpperCase()}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadBlob(csvContent, `QuickBooks_Invoices_${range}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    toast('QuickBooks Invoices CSV downloaded!');
  }

  function exportPaymentsCSV() {
    const paymentRows: string[] = [];
    filteredInvoices.forEach((inv) => {
      (inv.payments || []).forEach((p) => {
        paymentRows.push([
          `"${p.created_at.slice(0, 10)}"`,
          `"${inv.number}"`,
          `"${fullName(inv.customer).replace(/"/g, '""')}"`,
          num(p.amount).toFixed(2),
          `"${p.method.toUpperCase()}"`,
          `"${(p.reference_note || '').replace(/"/g, '""')}"`,
        ].join(','));
      });
    });

    if (!paymentRows.length) {
      toast('No recorded payments to export for this range', 'error');
      return;
    }

    const headers = ['PaymentDate', 'InvoiceNo', 'Customer', 'Amount', 'PaymentMethod', 'ReferenceNote'];
    const csvContent = [headers.join(','), ...paymentRows].join('\n');
    downloadBlob(csvContent, `QuickBooks_Payments_${range}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    toast('QuickBooks Income & Payments CSV downloaded!');
  }

  function exportInventoryCSV() {
    if (!data?.parts.length) {
      toast('No inventory items to export', 'error');
      return;
    }

    const headers = ['SKU', 'PartName', 'Category', 'Location', 'QtyOnHand', 'UnitCost', 'UnitSell', 'TotalCostValue', 'TotalRetailValue', 'Supplier'];
    const rows = data.parts.map((p) => {
      const qty = num(p.qty_on_hand);
      const cost = num(p.cost_price);
      const sell = num(p.sell_price);
      return [
        `"${p.sku}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        `"${p.location || ''}"`,
        qty,
        cost.toFixed(2),
        sell.toFixed(2),
        (qty * cost).toFixed(2),
        (qty * sell).toFixed(2),
        `"${p.supplier || ''}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadBlob(csvContent, `Shop_Inventory_Valuation_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    toast('Inventory Valuation CSV downloaded!');
  }

  function downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;

  const rangeLabels: Record<DateRange, string> = {
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
          {(['month', 'week', 'last_month', 'year', 'all'] as DateRange[]).map((r) => (
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
            <span>Sales Tax Accrued</span>
            <ReceiptIcon className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{money(metrics.taxCollected)}</p>
          <p className="text-[11px] text-slate-500">
            Ready for state sales tax filing
          </p>
        </Card>
      </div>

      {/* QuickBooks & Spreadsheet Export Center */}
      <Card className="p-5 space-y-3 bg-orange-50/40 border-orange-200">
        <div className="flex items-center justify-between border-b border-orange-200/80 pb-2">
          <div>
            <h3 className="text-sm font-bold text-orange-950 uppercase tracking-wide">
              QuickBooks &amp; CPA Export Center
            </h3>
            <p className="text-xs text-orange-900/80">
              Download standard CSV spreadsheets formatted for QuickBooks Online, Xero, Excel, or your bookkeeper.
            </p>
          </div>
          <span className="rounded-full bg-orange-200 px-2.5 py-0.5 text-[10px] font-bold text-orange-900">
            1-Click Export
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
          <Button
            type="button"
            variant="accent"
            onClick={exportInvoicesCSV}
            className="text-xs font-bold shadow-xs flex items-center justify-center gap-2"
          >
            <ReceiptIcon className="h-4 w-4 text-slate-950" />
            <span>Export Invoices ({filteredInvoices.length})</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={exportPaymentsCSV}
            className="text-xs font-semibold bg-white border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            <CreditCardIcon className="h-4 w-4 text-slate-700" />
            <span>Export Income &amp; Payments</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={exportInventoryCSV}
            className="text-xs font-semibold bg-white border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            <BoxIcon className="h-4 w-4 text-slate-700" />
            <span>Export Inventory Valuation</span>
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
                const paid = (inv.payments || []).reduce((s, p) => s + num(p.amount), 0);
                const balance = Math.max(0, num(inv.total) - paid);
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
