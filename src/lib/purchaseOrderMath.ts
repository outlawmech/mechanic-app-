import type { PurchaseOrderLine, PurchaseOrderStatus } from '../types';

const value = (input: number | string | null | undefined) => {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function getPurchaseOrderRemaining(line: Pick<PurchaseOrderLine, 'quantity_ordered' | 'quantity_received'>): number {
  return Math.max(0, value(line.quantity_ordered) - value(line.quantity_received));
}

export function getPurchaseOrderLineTotal(line: Pick<PurchaseOrderLine, 'quantity_ordered' | 'expected_unit_cost'>): number {
  return Math.round((value(line.quantity_ordered) * value(line.expected_unit_cost) + Number.EPSILON) * 100) / 100;
}

export function getPurchaseOrderSubtotal(lines: Array<Pick<PurchaseOrderLine, 'quantity_ordered' | 'expected_unit_cost'>>): number {
  return Math.round((lines.reduce((sum, line) => sum + getPurchaseOrderLineTotal(line), 0) + Number.EPSILON) * 100) / 100;
}

export function getReceiptStatus(lines: Array<Pick<PurchaseOrderLine, 'quantity_ordered' | 'quantity_received'>>): PurchaseOrderStatus {
  return lines.length > 0 && lines.every((line) => getPurchaseOrderRemaining(line) === 0) ? 'received' : 'partially_received';
}
