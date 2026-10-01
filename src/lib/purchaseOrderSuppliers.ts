import type { Part } from '../types';

export function normalizeSupplierName(supplier?: string | null): string {
  return (supplier ?? '').trim().toLowerCase();
}

export function partsForSupplier(parts: Part[], supplier?: string | null): Part[] {
  const target = normalizeSupplierName(supplier);
  if (!target) return [];
  return parts.filter((part) => normalizeSupplierName(part.supplier) === target);
}

export function catalogSuppliers(parts: Part[]): string[] {
  const names = new Map<string, string>();
  for (const part of parts) {
    const displayName = (part.supplier ?? '').trim();
    const normalized = normalizeSupplierName(displayName);
    if (normalized && !names.has(normalized)) names.set(normalized, displayName);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}
