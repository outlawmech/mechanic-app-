export type ReportDateRange = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'all';

export type ReportDateBounds = {
  start: number | null;
  endExclusive: number | null;
};

export type ReportPayment = {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  method: string;
  paymentDate: string;
  referenceNote: string;
};

type PaymentSource = {
  amount: number | string;
  method?: string | null;
  created_at?: string | null;
  reference_note?: string | null;
};

type InvoicePaymentSource = {
  number: string;
  total: number | string;
  status: string;
  issued_at: string;
  paid_at?: string | null;
  payments?: PaymentSource[] | null;
  customerName?: string | null;
};

const amountValue = (value: number | string | null | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function getReportDateBounds(range: ReportDateRange, now = new Date()): ReportDateBounds {
  if (range === 'all') return { start: null, endExclusive: null };

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextDay = new Date(startOfToday);
  nextDay.setDate(nextDay.getDate() + 1);

  if (range === 'today') {
    return { start: startOfToday.getTime(), endExclusive: nextDay.getTime() };
  }

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  if (range === 'week') {
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return { start: startOfWeek.getTime(), endExclusive: endOfWeek.getTime() };
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'month') {
    return {
      start: startOfMonth.getTime(),
      endExclusive: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
    };
  }

  if (range === 'last_month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
      endExclusive: startOfMonth.getTime(),
    };
  }

  return {
    start: new Date(now.getFullYear(), 0, 1).getTime(),
    endExclusive: new Date(now.getFullYear() + 1, 0, 1).getTime(),
  };
}

export function isInReportDateRange(value: string | null | undefined, bounds: ReportDateBounds): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return (bounds.start === null || timestamp >= bounds.start)
    && (bounds.endExclusive === null || timestamp < bounds.endExclusive);
}

export function getPaymentsInDateRange(
  invoices: InvoicePaymentSource[],
  bounds: ReportDateBounds,
): ReportPayment[] {
  const result: ReportPayment[] = [];

  for (const invoice of invoices) {
    if (invoice.status === 'void') continue;

    let remaining = Math.max(0, amountValue(invoice.total));
    const recordedPayments = (invoice.payments ?? []).filter((payment) => amountValue(payment.amount) > 0);

    for (const payment of recordedPayments) {
      const amount = roundMoney(Math.min(remaining, Math.max(0, amountValue(payment.amount))));
      if (amount <= 0) continue;
      remaining = roundMoney(Math.max(0, remaining - amount));

      const paymentDate = payment.created_at || invoice.paid_at || invoice.issued_at;
      if (!isInReportDateRange(paymentDate, bounds)) continue;
      result.push({
        invoiceNumber: invoice.number,
        customerName: invoice.customerName || '',
        amount,
        method: payment.method || 'other',
        paymentDate,
        referenceNote: payment.reference_note || '',
      });
    }

    // Older invoices may be marked paid without having a payment record.
    // Keep them visible for reconciliation and label the missing detail.
    if (invoice.status === 'paid' && remaining > 0) {
      const paymentDate = invoice.paid_at || invoice.issued_at;
      if (isInReportDateRange(paymentDate, bounds)) {
        result.push({
          invoiceNumber: invoice.number,
          customerName: invoice.customerName || '',
          amount: roundMoney(remaining),
          method: 'other',
          paymentDate,
          referenceNote: 'Legacy paid invoice; payment detail unavailable',
        });
      }
    }
  }

  return result;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escapeCell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(2) : '""';

    // Prefix text that spreadsheet programs could interpret as a formula.
    const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replace(/"/g, '""')}"`;
  };

  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

export function getLocalDateStamp(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? getLocalDateStamp(date) : '';
}
