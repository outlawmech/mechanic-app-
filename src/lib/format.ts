const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(v: number | string | null | undefined): string {
  return usd.format(num(v));
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function vehicleLabel(
  v: { year: number | string | null; make: string; model: string; trim?: string } | null | undefined
): string {
  if (!v) return '';
  const parts = [v.year ? String(v.year) : '', v.make, v.model, v.trim].filter(Boolean);
  return parts.join(' ');
}

export function fullName(
  c: { first_name: string; last_name: string } | null | undefined
): string {
  if (!c) return 'Unknown customer';
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown customer';
}

/** 'YYYY-MM-DD' (date-only columns) or ISO timestamp. */
function toDate(s: string): Date {
  return new Date(s.length === 10 ? `${s}T12:00:00` : s);
}

export function shortDate(s: string | null | undefined): string {
  if (!s) return '—';
  return toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(s: string | null | undefined): string {
  if (!s) return '—';
  return toDate(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isToday(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.slice(0, 10) === todayISO();
}

export function workOrderEstimate(items: { quantity: number | string; unit_price: number | string }[]): number {
  return round2(items.reduce((s, it) => s + num(it.quantity) * num(it.unit_price), 0));
}
