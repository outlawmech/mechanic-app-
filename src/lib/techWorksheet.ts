import type { DealershipUnit, ShopSettings, WorkOrderFull } from '../types';
import { getWorkOrderType, workOrderTypeLabel } from './workOrderType.ts';

export type TechWorksheetWorkOrder = WorkOrderFull & { unit?: DealershipUnit | null };

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function printableDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function row(label: string, value: unknown): string {
  return `<div class="field-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text(value))}</span></div>`;
}

function partsTable(title: string): string {
  const blankRows = Array.from({ length: 6 }, () => '<tr><td></td><td></td><td></td></tr>').join('');
  return `<section class="parts-box">
    <h2>${escapeHtml(title)}</h2>
    <table><thead><tr><th>Qty</th><th>Part Number</th><th>Description</th></tr></thead><tbody>${blankRows}</tbody></table>
  </section>`;
}

/** Build a standalone one-page, handwriting-friendly Work Order worksheet. */
export function buildTechWorksheetHtml(wo: TechWorksheetWorkOrder, settings: ShopSettings): string {
  const vehicle = wo.vehicle;
  const unit = wo.unit ?? null;
  const customer = wo.customer;
  const name = [text(customer?.first_name), text(customer?.last_name)].filter(Boolean).join(' ');
  const configuredShopName = text(settings.shop_name);
  const shopName = configuredShopName && configuredShopName !== 'Outlaw Shop Systems'
    ? configuredShopName
    : 'Dealer / Shop';
  const logo = text(settings.logo_url);
  const year = text(vehicle?.year) || text(unit?.year);
  const make = text(vehicle?.make) || text(unit?.make);
  const model = [text(vehicle?.model) || text(unit?.model), text(vehicle?.trim) || text(unit?.trim)]
    .filter(Boolean)
    .join(' ');
  const serial = text(vehicle?.vin) || text(unit?.vin) || text(vehicle?.engine_serial) || text(unit?.engine_serial);
  const unitNumber = text(unit?.stock_number);
  const engineHours = [text(vehicle?.engine_hours), text(vehicle?.engine2_hours)].filter(Boolean).join(' / ');
  const hoursOrMileage = text(wo.mileage_or_hours)
    || text(unit?.mileage_or_hours)
    || engineHours;
  const type = vehicle?.type || unit?.type || '';
  const usageLabel = type === 'marine' || type === 'equipment' ? 'Engine Hours' : 'Mileage / Hours';
  const orderTypeLabel = workOrderTypeLabel(getWorkOrderType(wo));

  const notes = text(wo.notes);
  const workItems = (wo.items ?? [])
    .filter((item) => text(item.description))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => `<div class="requested-item">${escapeHtml(item.kind.toUpperCase())} · ${escapeHtml(text(item.quantity))} × ${escapeHtml(text(item.description))}</div>`)
    .join('');
  const concernContent = [
    notes ? `<div class="concern-notes">${escapeHtml(notes).replace(/\r?\n/g, '<br>')}</div>` : '',
    workItems,
  ].filter(Boolean).join('');
  const diagnosisLines = Array.from({ length: 10 }, () => '<div class="writing-line"></div>').join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Service Worksheet — WO ${escapeHtml(wo.number)}</title>
  <style>
    @page { size: Letter portrait; margin: 7mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { font-size: 9pt; }
    .page { width: 100%; height: 265mm; display: grid; grid-template-rows: 19mm 41mm 47mm minmax(0, 1fr) 57mm 12mm; gap: 2mm; }
    .top { display: grid; grid-template-columns: 1fr 1.35fr 1fr; align-items: center; gap: 4mm; }
    .shop { min-width: 0; height: 100%; display: flex; align-items: center; gap: 2mm; overflow: hidden; font-size: 11pt; font-weight: 700; }
    .shop img { display: block; max-width: 100%; max-height: 17mm; object-fit: contain; }
    .shop-name { overflow-wrap: anywhere; }
    .worksheet-title { text-align: center; }
    .worksheet-title h1 { margin: 0; font-size: 18pt; line-height: 1.05; letter-spacing: .2pt; }
    .worksheet-title p { margin: 1mm 0 0; font-size: 8pt; letter-spacing: .8pt; }
    .meta { border-collapse: collapse; width: 100%; height: 100%; font-size: 8pt; }
    .meta th, .meta td { border: .3mm solid #333; padding: .5mm 1mm; text-align: left; }
    .meta th { width: 40%; background: #eee; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; min-height: 0; }
    .box { border: .35mm solid #333; min-width: 0; min-height: 0; }
    .box-title, .parts-box h2 { height: 6.5mm; margin: 0; padding: 1mm 2mm; background: #eee; border-bottom: .3mm solid #555; font-size: 9pt; line-height: 4.5mm; font-weight: 700; }
    .info-rows { height: calc(100% - 6.5mm); display: grid; grid-template-rows: repeat(4, 1fr); }
    .field-row { display: grid; grid-template-columns: 24mm 1fr; align-items: center; min-width: 0; padding: 0 2mm; border-bottom: .25mm solid #aaa; line-height: 1.15; }
    .field-row:last-child { border-bottom: 0; }
    .field-row strong { font-weight: 600; }
    .field-row span { min-width: 0; overflow-wrap: anywhere; }
    .unit-rows { height: calc(100% - 6.5mm); display: grid; grid-template-rows: repeat(5, 1fr); }
    .split-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: .25mm solid #aaa; }
    .split-row .field-row { border-bottom: 0; }
    .split-row .field-row + .field-row { border-left: .25mm solid #aaa; }
    .concern, .diagnosis { display: flex; flex-direction: column; }
    .lined-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 1mm 2mm; }
    .concern-copy { flex: 0 0 auto; font-size: 8pt; line-height: 1.2; overflow-wrap: anywhere; }
    .requested-item { margin-top: .6mm; }
    .writing-line { flex: 1 1 0; min-height: 4mm; border-bottom: .25mm solid #999; }
    .parts { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; min-height: 0; }
    .parts-box { border: .35mm solid #333; min-width: 0; }
    .parts-box table { border-collapse: collapse; width: 100%; height: calc(100% - 6.5mm); table-layout: fixed; }
    .parts-box th, .parts-box td { border-right: .25mm solid #888; border-bottom: .25mm solid #999; padding: .4mm 1mm; }
    .parts-box th { height: 6mm; background: #f5f5f5; text-align: center; font-weight: 600; font-size: 8pt; }
    .parts-box th:first-child, .parts-box td:first-child { width: 14%; }
    .parts-box th:nth-child(2), .parts-box td:nth-child(2) { width: 32%; }
    .parts-box td { height: 6.2mm; }
    .parts-box td:last-child, .parts-box th:last-child { border-right: 0; }
    .signature { display: grid; grid-template-columns: auto 1fr auto 30mm; align-items: end; gap: 2mm; border: .35mm solid #333; padding: 1.5mm 2mm; font-size: 9pt; }
    .signature-line, .signature-date { height: 6mm; border-bottom: .3mm solid #222; }
    @media print { html, body { width: 100%; height: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="top">
      <div class="shop">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(shopName)}">` : `<span class="shop-name">${escapeHtml(shopName)}</span>`}</div>
      <div class="worksheet-title"><h1>SERVICE WORKSHEET</h1><p>WORK ORDER / TECH NOTES</p></div>
      <table class="meta"><tbody>
        <tr><th>WO #</th><td>${escapeHtml(text(wo.number))}</td></tr>
        <tr><th>WO Type:</th><td>${escapeHtml(orderTypeLabel)}</td></tr>
        <tr><th>Date In:</th><td>${escapeHtml(printableDate(wo.created_at))}</td></tr>
        <tr><th>Target Date:</th><td>${escapeHtml(printableDate(wo.scheduled_at))}</td></tr>
      </tbody></table>
    </header>
    <div class="details">
      <section class="box"><h2 class="box-title">CUSTOMER INFORMATION</h2><div class="info-rows">
        ${row('Name:', name)}${row('Phone:', customer?.phone)}${row('Email:', customer?.email)}${row('Address:', customer?.address)}
      </div></section>
      <section class="box"><h2 class="box-title">UNIT INFORMATION</h2><div class="unit-rows">
        <div class="split-row">${row('Year:', year)}${row('Make:', make)}</div>
        ${row('Model:', model)}${row('VIN / Serial #:', serial)}${row('Unit # / Stock #:', unitNumber)}${row(`${usageLabel}:`, hoursOrMileage)}
      </div></section>
    </div>
    <section class="box concern"><h2 class="box-title">CUSTOMER CONCERN / AUTHORIZED WORK</h2><div class="lined-body">
      ${concernContent ? `<div class="concern-copy">${concernContent}</div>` : ''}
    </div></section>
    <section class="box diagnosis"><h2 class="box-title">DIAGNOSIS / WORK PERFORMED</h2><div class="lined-body">${diagnosisLines}</div></section>
    <div class="parts">${partsTable('PARTS USED')}${partsTable('PARTS NEEDED')}</div>
    <footer class="signature"><strong>Technician Signature</strong><span class="signature-line"></span><strong>Date</strong><span class="signature-date"></span></footer>
  </main>
</body>
</html>`;
}
