import type { WorkOrderStatus } from '../types';

export const COMPLETED_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ['completed', 'invoiced'];

export function isCompletedWorkOrderStatus(status: WorkOrderStatus): boolean {
  return COMPLETED_WORK_ORDER_STATUSES.includes(status);
}
