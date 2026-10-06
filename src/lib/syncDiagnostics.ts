// Deliberately project queue entries onto a small, non-sensitive view.
// Never return payload, raw description, record identifiers, or raw errors.
const tables: Record<string, string> = {
  customers: 'Customer', vehicles: 'Vehicle', work_orders: 'Work Order',
  work_order_items: 'Work Order Item', parts: 'Part', dealership_units: 'Showroom Unit',
  invoices: 'Invoice', payments: 'Payment', work_order_photos: 'Work Order Photo',
  work_order_signatures: 'Work Order Signature', appointments: 'Appointment',
};
const operations: Record<string, string> = { insert: 'Create', update: 'Update', delete: 'Delete' };

export function sanitizeSyncError(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'No error recorded.';
  // Recognize standard error categories; do not try to safely echo arbitrary text.
  const error = value.slice(0, 4000);
  let message = 'Error details hidden to protect private data.';
  if (/duplicate key|unique constraint|23505/i.test(error)) message = 'Duplicate record or unique constraint conflict.';
  else if (/foreign key|23503/i.test(error)) message = 'Related record is missing or unavailable.';
  else if (/row.level security|permission denied|not authorized|42501/i.test(error)) message = 'Access denied by database permissions.';
  else if (/jwt|token.*expired|refresh token|unauthorized/i.test(error)) message = 'Authentication or session rejected.';
  else if (/invalid input syntax|22P02/i.test(error)) message = 'A submitted value has an invalid format.';
  else if (/not.null constraint|23502/i.test(error)) message = 'A required value is missing.';
  else if (/check constraint|23514/i.test(error)) message = 'A database validation constraint rejected the change.';
  else if (/could not find.*column|column.*does not exist|PGRST204/i.test(error)) message = 'A database field was not recognized.';
  else if (/failed to fetch|networkerror|network request failed|timeout|timed out/i.test(error)) message = 'Network request failed or timed out.';
  const codes = [...new Set(error.match(/\b(?:23505|23503|23502|23514|42501|22P02|PGRST\d{3})\b/g) ?? [])];
  const status = error.match(/\b(?:HTTP|status(?: code)?)\s*[:=]?\s*([45]\d{2})\b/i)?.[1];
  const constraint = error.match(/constraint\s+["']([a-z][a-z0-9_]{0,62})["']/i)?.[1];
  const knownConstraints = new Set(['customers_pkey', 'vehicles_pkey', 'vehicles_customer_id_fkey',
    'parts_pkey', 'parts_sku_key', 'dealership_units_pkey', 'dealership_units_stock_number_key',
    'work_orders_pkey', 'work_orders_customer_id_fkey', 'work_order_items_work_order_id_fkey',
    'invoices_pkey', 'payments_invoice_id_fkey']);
  const safeConstraint = constraint && knownConstraints.has(constraint) ? constraint : null;
  return [message, ...codes.map(code => `Code: ${code}`), status ? `HTTP: ${status}` : null,
    safeConstraint ? `Constraint: ${safeConstraint}` : null].filter(Boolean).join(' ');
}

export function getSyncDiagnostics(entries: readonly unknown[]) {
  return entries.map((entry) => {
    const action = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const table = typeof action.table === 'string' && Object.hasOwn(tables, action.table) ? action.table : null;
    const operation = typeof action.type === 'string' && Object.hasOwn(operations, action.type) ? operations[action.type] : 'Unknown operation';
    const timestamp = typeof action.createdAt === 'number' && Number.isFinite(action.createdAt) ? new Date(action.createdAt) : null;
    return {
      description: `${operation} ${table ? tables[table].toLowerCase() : 'record'}`,
      table: table ?? 'Unknown table', label: table ? tables[table] : 'Record', operation,
      queuedAt: timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toISOString() : 'Unknown',
      retries: typeof action.retryCount === 'number' && Number.isSafeInteger(action.retryCount) && action.retryCount >= 0 ? action.retryCount : 0,
      lastError: sanitizeSyncError(action.lastError),
    };
  });
}
