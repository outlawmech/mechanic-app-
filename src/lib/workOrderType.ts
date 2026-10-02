import type { WorkOrder, WorkOrderType } from '../types';

export const WORK_ORDER_TYPES = ['customer', 'warranty', 'internal'] as const satisfies readonly WorkOrderType[];

const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = {
  customer: 'Customer',
  warranty: 'Warranty',
  internal: 'Internal',
};

/** Legacy cached PDI and rigging orders are internal; all other legacy orders are customer-pay. */
export function getWorkOrderType(workOrder: Pick<WorkOrder, 'work_order_type' | 'internal_type'>): WorkOrderType {
  if (workOrder.internal_type) return 'internal';
  if (WORK_ORDER_TYPES.includes(workOrder.work_order_type as WorkOrderType)) {
    return workOrder.work_order_type as WorkOrderType;
  }
  return 'customer';
}

export function workOrderTypeLabel(type: WorkOrderType): string {
  return WORK_ORDER_TYPE_LABELS[type];
}

export function canCreateCustomerInvoice(type: WorkOrderType): boolean {
  return type === 'customer';
}

/** Retains the current fallback for blank/zero entries without quantizing valid decimal quantities. */
export function parseWorkItemQuantity(value: string): number {
  return Number(value) || 1;
}
