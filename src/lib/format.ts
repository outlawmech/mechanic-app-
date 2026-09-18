import type { Customer, InvoiceFull, Vehicle, VehicleType, WorkItem, WorkOrderFull } from '../types';

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

export interface VehicleTypeInfo {
  type: VehicleType;
  label: string;
  shortLabel: string;
  idLabel: string;
  regLabel: string;
  hoursLabel: string;
  emoji: string;
}

export const VEHICLE_TYPES: Record<VehicleType, VehicleTypeInfo> = {
  auto: {
    type: 'auto',
    label: 'Auto / Truck',
    shortLabel: 'Auto',
    idLabel: 'VIN',
    regLabel: 'Plate',
    hoursLabel: 'Mileage / Hours',
    emoji: '🚙',
  },
  marine: {
    type: 'marine',
    label: 'Boat / Marine',
    shortLabel: 'Marine',
    idLabel: 'Hull ID (HIN)',
    regLabel: 'Reg / Decal #',
    hoursLabel: 'Engine Hours',
    emoji: '🚤',
  },
  atv: {
    type: 'atv',
    label: 'ATV / UTV',
    shortLabel: 'ATV/UTV',
    idLabel: 'Serial / PIN #',
    regLabel: 'Trail Decal #',
    hoursLabel: 'Hours / Miles',
    emoji: '🛞',
  },
  snowmobile: {
    type: 'snowmobile',
    label: 'Snowmobile / Sled',
    shortLabel: 'Sled',
    idLabel: 'Serial / VIN #',
    regLabel: 'Trail Decal #',
    hoursLabel: 'Hours / Miles',
    emoji: '🛷',
  },
  motorcycle: {
    type: 'motorcycle',
    label: 'Motorcycle / Dirt Bike',
    shortLabel: 'Motorcycle',
    idLabel: 'VIN #',
    regLabel: 'Plate #',
    hoursLabel: 'Mileage / Hours',
    emoji: '🏍️',
  },
  equipment: {
    type: 'equipment',
    label: 'Tractor / Heavy Equip',
    shortLabel: 'Equipment',
    idLabel: 'Serial # / PIN',
    regLabel: 'Equipment ID',
    hoursLabel: 'Engine Hours',
    emoji: '🚜',
  },
  other: {
    type: 'other',
    label: 'Small Engine / Other',
    shortLabel: 'Other',
    idLabel: 'Serial #',
    regLabel: 'Tag #',
    hoursLabel: 'Engine Hours',
    emoji: '🔧',
  },
};

export function getVehicleTypeInfo(type?: string | null): VehicleTypeInfo {
  if (type && type in VEHICLE_TYPES) {
    return VEHICLE_TYPES[type as VehicleType];
  }
  return VEHICLE_TYPES.auto;
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

// ---------------- Email & Share Formatters ----------------

export function formatEstimateText(wo: WorkOrderFull, shopName = 'Outlaw Mech'): { subject: string; body: string } {
  const cName = fullName(wo.customer);
  const vLabel = wo.vehicle ? vehicleLabel(wo.vehicle) : 'Equipment/Vehicle';
  const total = workOrderEstimate(wo.items ?? []);

  const subject = `Estimate ${wo.number} - ${shopName} (${vLabel})`;

  const itemLines = (wo.items ?? []).map((it) => {
    const kindTag = it.kind.toUpperCase();
    const qty = num(it.quantity);
    const price = money(it.unit_price);
    const sum = money(num(it.quantity) * num(it.unit_price));
    return `• [${kindTag}] ${it.description} (${qty} @ ${price}) = ${sum}`;
  });

  const lines = [
    `Hi ${wo.customer.first_name || 'there'},`,
    '',
    `Here is the estimate for your ${vLabel} from ${shopName}:`,
    '',
    `Work Order: ${wo.number}`,
    `Date: ${longDate(wo.created_at)}`,
    wo.vehicle ? `Vehicle/Equipment: ${vLabel}` : null,
    wo.mileage_or_hours ? `Recorded Hours/Miles: ${wo.mileage_or_hours}` : null,
    '',
    'ESTIMATED SERVICES & PARTS:',
    ...(itemLines.length > 0 ? itemLines : ['• Pending inspection / estimate']),
    '',
    `ESTIMATED TOTAL: ${money(total)}`,
    '',
    wo.notes ? `Job Notes:\n${wo.notes}\n` : null,
    'Please let us know if you approve this estimate or have any questions.',
    '',
    `Thank you,\n${shopName}\nMobile Mechanic Service`,
  ].filter((l): l is string => l !== null);

  return { subject, body: lines.join('\n') };
}

export function formatInvoiceText(
  invoice: InvoiceFull,
  items: WorkItem[],
  vehicle: Vehicle | null,
  shopName = 'Outlaw Mech'
): { subject: string; body: string } {
  const cName = fullName(invoice.customer);
  const vLabel = vehicle ? vehicleLabel(vehicle) : 'Equipment/Vehicle';
  const total = money(invoice.total);

  const subject = `Invoice ${invoice.number} from ${shopName} - ${total}`;

  const itemLines = items.map((it) => {
    const kindTag = it.kind.toUpperCase();
    const qty = num(it.quantity);
    const price = money(it.unit_price);
    const sum = money(num(it.quantity) * num(it.unit_price));
    return `• [${kindTag}] ${it.description} (${qty} @ ${price}) = ${sum}`;
  });

  const taxPct = (num(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '');

  const lines = [
    `Hi ${invoice.customer.first_name || 'there'},`,
    '',
    `Here is your invoice from ${shopName}:`,
    '',
    `Invoice: ${invoice.number}`,
    `Date Issued: ${longDate(invoice.issued_at)}`,
    `Due Date: ${longDate(invoice.due_date)}`,
    `Status: ${invoice.status.toUpperCase()}`,
    vehicle ? `Vehicle/Equipment: ${vLabel}${vehicle.plate ? ` (${vehicle.plate})` : ''}` : null,
    '',
    'SERVICES & PARTS PROVIDED:',
    ...(itemLines.length > 0 ? itemLines : ['• Service completed']),
    '',
    `Subtotal: ${money(invoice.subtotal)}`,
    num(invoice.tax) > 0 ? `Tax (${taxPct}%): ${money(invoice.tax)}` : null,
    `TOTAL: ${total}`,
    invoice.paid_at ? `Paid on ${longDate(invoice.paid_at)} - Thank you!` : 'Payment is due on or before the due date.',
    '',
    invoice.notes ? `Notes:\n${invoice.notes}\n` : null,
    `Thank you for your business!\n${shopName}\nMobile Mechanic Service`,
  ].filter((l): l is string => l !== null);

  return { subject, body: lines.join('\n') };
}
