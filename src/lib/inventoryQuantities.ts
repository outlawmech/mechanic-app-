/** Split a requested tracked-part quantity into stock on hand and customer-order quantity. */
export function splitQuantityByAvailability(requested: number, available: number) {
  const safeRequested = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  const safeAvailable = Number.isFinite(available) ? Math.max(0, available) : 0;
  const stockQuantity = Math.min(safeRequested, safeAvailable);
  return {
    stockQuantity,
    specialOrderQuantity: Math.max(0, safeRequested - stockQuantity),
  };
}
