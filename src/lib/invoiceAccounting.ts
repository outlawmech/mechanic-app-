import { num, round2 } from './format.ts';
import type { InvoicePayment, InvoiceStatus } from '../types.ts';

type InvoiceFinancialRecord = {
  total: number | string;
  status: InvoiceStatus | string;
  payments?: InvoicePayment[] | null;
};

export type InvoiceReceivable<T extends InvoiceFinancialRecord = InvoiceFinancialRecord> = {
  invoice: T;
  balance: number;
};

/**
 * Current accounts receivable is the balance of every nonvoid invoice in the
 * organization. It is a point-in-time balance and must not be restricted by a
 * revenue report's invoice-date range.
 */
export function getInvoiceReceivables<T extends InvoiceFinancialRecord>(invoices: T[]): {
  total: number;
  invoices: InvoiceReceivable<T>[];
} {
  const receivables = invoices
    .map((invoice) => ({ invoice, balance: getInvoiceBalanceDue(invoice) }))
    .filter(({ balance }) => balance > 0);
  return {
    total: round2(receivables.reduce((sum, entry) => sum + entry.balance, 0)),
    invoices: receivables,
  };
}

/** Total amount recorded as paid, with a legacy fallback for paid invoices
 * created before individual payment entries were stored. */
export function getInvoicePaidAmount(invoice: InvoiceFinancialRecord): number {
  if (invoice.status === 'void') return 0;

  const invoiceTotal = Math.max(0, num(invoice.total));
  const recordedTotal = round2(
    (invoice.payments ?? []).reduce((sum, payment) => {
      const amount = num(payment.amount);
      return amount > 0 ? sum + amount : sum;
    }, 0)
  );

  if (invoice.status === 'paid') return invoiceTotal;

  return Math.min(invoiceTotal, recordedTotal);
}

/** Outstanding balance used by invoice lists, reports, and the dashboard. */
export function getInvoiceBalanceDue(invoice: InvoiceFinancialRecord): number {
  if (invoice.status === 'void' || invoice.status === 'paid') return 0;
  return round2(Math.max(0, num(invoice.total) - getInvoicePaidAmount(invoice)));
}

/**
 * Return payment entries for reporting. Historical paid invoices without
 * payment rows are treated as collected in an unassigned payment method.
 */
export function getInvoicePaymentsForReporting(invoice: InvoiceFinancialRecord): Array<Pick<InvoicePayment, 'amount' | 'method'>> {
  if (invoice.status === 'void') return [];

  let remaining = Math.max(0, num(invoice.total));
  const payments: Array<Pick<InvoicePayment, 'amount' | 'method'>> = [];
  for (const payment of invoice.payments ?? []) {
    const amount = round2(Math.min(remaining, Math.max(0, num(payment.amount))));
    if (amount <= 0) continue;
    payments.push({ amount, method: payment.method || 'other' });
    remaining = round2(Math.max(0, remaining - amount));
  }

  if (invoice.status === 'paid' && remaining > 0) {
    payments.push({ amount: remaining, method: 'other' });
  }
  return payments;
}

export function getInvoiceEffectiveStatus(invoice: InvoiceFinancialRecord): InvoiceStatus {
  if (invoice.status === 'void') return 'void';
  const paid = getInvoicePaidAmount(invoice);
  if (paid >= Math.max(0, num(invoice.total))) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}
