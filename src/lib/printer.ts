import { Capacitor } from '@capacitor/core';
import { money, num, fullName, vehicleLabel, longDate, getVehicleTypeInfo } from './format';
import type { InvoiceFull, Vehicle, WorkItem, WorkOrder, ShopSettings } from '../types';
import { buildTechWorksheetHtml, type TechWorksheetWorkOrder } from './techWorksheet';

export const isNativePlatform = Capacitor.isNativePlatform();

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build clean, standalone, self-contained HTML for US Letter Invoice printing and PDF rendering.
 * All styling is fully inlined with strict pixel boundaries to guarantee a single-page Letter output.
 */
export function buildStandaloneInvoiceHtml(
  invoice: InvoiceFull,
  items: WorkItem[],
  vehicle: Vehicle | null,
  settings: ShopSettings,
  workOrder: WorkOrder | null
): string {
  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const totalPaid = (invoice.payments || []).reduce((sum, p) => sum + num(p.amount), 0);
  const balanceDue = Math.max(0, num(invoice.total) - totalPaid);
  const isFullyPaid = invoice.status === 'paid' || balanceDue <= 0;
  const cashierRows = (invoice.payments || []).filter((payment) => payment.cashier_name)
    .map((payment) => `<div style="font-size:8pt;color:#64748b">Cashier: ${escapeHtml(payment.cashier_name)} · ${money(payment.amount)}</div>`).join('');
  const vInfo = vehicle ? getVehicleTypeInfo(vehicle.type) : null;

  const lineItemsRows =
    sortedItems.length === 0
      ? `<tr><td colspan="4" style="text-align: center; padding: 16px; color: #94a3b8; font-style: italic;">No line items on this invoice.</td></tr>`
      : sortedItems
          .map(
            (it) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
            <div style="font-weight: 600; color: #0f172a; font-size: 9.5pt;">${escapeHtml(it.description)}</div>
            <div style="font-size: 8pt; text-transform: uppercase; font-weight: 700; color: #64748b; margin-top: 1px;">${escapeHtml(it.kind)}</div>
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #334155; vertical-align: top; font-size: 9.5pt;">
            ${it.quantity}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #334155; vertical-align: top; font-size: 9.5pt;">
            ${money(it.unit_price)}
          </td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 700; color: #0f172a; vertical-align: top; font-size: 9.5pt;">
            ${money(num(it.quantity) * num(it.unit_price))}
          </td>
        </tr>
      `
          )
          .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${escapeHtml(invoice.number)}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      font-size: 9.5pt;
      line-height: 1.35;
      width: 100%;
    }
    .invoice-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .header-table td {
      vertical-align: top;
      padding: 0;
    }
    .shop-logo {
      max-height: 48px;
      max-width: 160px;
      object-fit: contain;
      margin-bottom: 4px;
      display: block;
      margin-left: auto;
    }
    .bill-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 9pt;
    }
    .bill-table td {
      vertical-align: top;
      padding: 0;
      width: 50%;
    }
    .vehicle-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 9pt;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
    }
    .items-table th {
      background-color: #f1f5f9;
      border-bottom: 2px solid #cbd5e1;
      padding: 6px 10px;
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
    }
    .totals-wrapper {
      width: 100%;
      margin-top: 10px;
      display: table;
    }
    .totals-box {
      width: 270px;
      margin-left: auto;
      font-size: 9pt;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 2.5px 0;
      color: #475569;
    }
    .totals-row.final {
      border-top: 2px solid #0f172a;
      margin-top: 4px;
      padding-top: 4px;
      font-size: 10.5pt;
      font-weight: 800;
      color: #0f172a;
    }
    .totals-row.balance {
      border-top: 1px solid #cbd5e1;
      margin-top: 4px;
      padding-top: 4px;
      font-weight: 700;
    }
    .signature-box {
      margin-top: 14px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .signature-img {
      max-height: 40px;
      max-width: 130px;
      object-fit: contain;
      display: block;
    }
    .notes-box {
      margin-top: 12px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 8pt;
      color: #64748b;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="text-align: left;">
          <div style="font-size: 20pt; font-weight: 900; letter-spacing: -0.03em; color: #0f172a;">INVOICE</div>
          <div style="font-family: monospace; font-size: 9.5pt; font-weight: 700; color: #64748b; margin-top: 2px;">
            ${escapeHtml(invoice.number)}
          </div>
        </td>
        <td style="text-align: right;">
          ${settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(settings.shop_name)}" class="shop-logo" />` : ''}
          <div style="font-size: 10.5pt; font-weight: 700; color: #0f172a;">${escapeHtml(settings.shop_name)}</div>
          ${settings.tagline ? `<div style="font-size: 8pt; color: #64748b;">${escapeHtml(settings.tagline)}</div>` : ''}
          ${settings.phone ? `<div style="font-size: 8pt; color: #475569;">${escapeHtml(settings.phone)}</div>` : ''}
          ${settings.email ? `<div style="font-size: 8pt; color: #475569;">${escapeHtml(settings.email)}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- Bill to & Dates -->
    <table class="bill-table">
      <tr>
        <td style="text-align: left;">
          <div style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">BILL TO</div>
          <div style="font-size: 10pt; font-weight: 700; color: #0f172a; margin-top: 1px;">${escapeHtml(fullName(invoice.customer))}</div>
          ${invoice.customer.address ? `<div style="color: #475569; margin-top: 1px;">${escapeHtml(invoice.customer.address)}</div>` : ''}
          ${invoice.customer.phone ? `<div style="color: #475569;">${escapeHtml(invoice.customer.phone)}</div>` : ''}
          ${invoice.customer.email ? `<div style="color: #475569;">${escapeHtml(invoice.customer.email)}</div>` : ''}
        </td>
        <td style="text-align: right;">
          <div style="color: #475569;">Issued: <strong style="color: #0f172a;">${escapeHtml(longDate(invoice.issued_at))}</strong></div>
          <div style="color: #475569; margin-top: 1px;">Due: <strong style="color: #0f172a;">${escapeHtml(longDate(invoice.due_date))}</strong></div>
          ${
            isFullyPaid
              ? `<div style="color: #16a34a; font-weight: 700; margin-top: 3px;">Paid in Full ${invoice.paid_at ? `(${escapeHtml(longDate(invoice.paid_at))})` : ''}</div>`
              : `<div style="color: #dc2626; font-weight: 700; margin-top: 3px;">Balance Due: ${money(balanceDue)}</div>`
          }
        </td>
      </tr>
    </table>

    <!-- Vehicle Details (if applicable) -->
    ${
      vehicle
        ? `
      <div class="vehicle-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <div>
            <span style="font-weight: 700; color: #0f172a;">${vInfo?.emoji || '🚗'} ${escapeHtml(vehicleLabel(vehicle))}</span>
            <span style="background: #e2e8f0; padding: 1px 5px; border-radius: 4px; font-size: 7.5pt; font-weight: 600; color: #334155; margin-left: 4px;">${escapeHtml(vInfo?.shortLabel || vehicle.type)}</span>
          </div>
          ${
            workOrder?.mileage_or_hours
              ? `<div style="font-weight: 600; color: #475569; font-size: 8.5pt;">⏱️ ${escapeHtml(workOrder.mileage_or_hours)}</div>`
              : ''
          }
        </div>
        <div style="font-size: 8pt; color: #64748b;">
          ${vehicle.vin ? `<span style="margin-right: 12px;">${escapeHtml(vInfo?.idLabel || 'VIN')}: <strong style="font-family: monospace; color: #334155;">${escapeHtml(vehicle.vin)}</strong></span>` : ''}
          ${vehicle.plate ? `<span style="margin-right: 12px;">${escapeHtml(vInfo?.regLabel || 'Plate')}: <strong style="font-family: monospace; color: #334155;">${escapeHtml(vehicle.plate)}</strong></span>` : ''}
          ${vehicle.engine_info ? `<span>Engine: <strong style="color: #334155;">${escapeHtml(vehicle.engine_info)}</strong></span>` : ''}
        </div>
      </div>
    `
        : ''
    }

    <!-- Line items table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align: left;">Item Description</th>
          <th style="text-align: right; width: 50px;">Qty</th>
          <th style="text-align: right; width: 80px;">Rate</th>
          <th style="text-align: right; width: 90px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsRows}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrapper">
      <div class="totals-box">
        <div class="totals-row">
          <span>Subtotal</span>
          <span style="font-family: monospace;">${money(invoice.subtotal)}</span>
        </div>
        ${
          num(invoice.tax) > 0
            ? `
          <div class="totals-row">
            <span>Tax (${(num(invoice.tax_rate) * 100).toFixed(1)}%)</span>
            <span style="font-family: monospace;">${money(invoice.tax)}</span>
          </div>
        `
            : ''
        }
        <div class="totals-row final">
          <span>Total</span>
          <span style="font-family: monospace;">${money(invoice.total)}</span>
        </div>
        ${
          totalPaid > 0
            ? `
          <div class="totals-row" style="color: #16a34a; font-size: 8.5pt; margin-top: 2px;">
            <span>Total Payments:</span>
            <span style="font-family: monospace; font-weight: 700;">-${money(totalPaid)}</span>
          </div>
        `
            : ''
        }
        ${cashierRows}
        <div class="totals-row balance">
          <span style="color: ${balanceDue <= 0 ? '#16a34a' : '#0f172a'};">${balanceDue <= 0 ? 'Paid in Full' : 'Balance Due:'}</span>
          <span style="font-family: monospace; font-size: 10.5pt; color: ${balanceDue <= 0 ? '#16a34a' : '#dc2626'};">${balanceDue <= 0 ? '$0.00' : money(balanceDue)}</span>
        </div>
      </div>
    </div>

    <!-- Customer Signature (if present) -->
    ${
      workOrder?.signature_url
        ? `
      <div class="signature-box">
        <div>
          <div style="font-size: 8.5pt; font-weight: 700; color: #0f172a;">Customer Authorization & Acceptance</div>
          <div style="font-size: 7.5pt; color: #64748b; margin-top: 1px;">
            Signed by ${escapeHtml(workOrder.signed_by_name || fullName(invoice.customer))} ${workOrder.signed_at ? `on ${escapeHtml(new Date(workOrder.signed_at).toLocaleDateString())}` : ''}
          </div>
        </div>
        <img src="${escapeHtml(workOrder.signature_url)}" alt="Customer Signature" class="signature-img" />
      </div>
    `
        : ''
    }

    <!-- Payment Methods & Handles (if configured) -->
    ${
      (settings.zelle_info || settings.venmo_handle || settings.cash_app_tag || settings.custom_pay_link) && !isFullyPaid
        ? `
      <div style="margin-top: 10px; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 8pt; color: #475569;">
        <strong style="color: #0f172a; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Direct Payment Options:</strong>
        <div style="display: flex; flex-wrap: wrap; gap: 12px;">
          ${settings.zelle_info ? `<div>Zelle: <strong style="color: #0f172a;">${escapeHtml(settings.zelle_info)}</strong></div>` : ''}
          ${settings.venmo_handle ? `<div>Venmo: <strong style="color: #0f172a;">${escapeHtml(settings.venmo_handle)}</strong></div>` : ''}
          ${settings.cash_app_tag ? `<div>Cash App: <strong style="color: #0f172a;">${escapeHtml(settings.cash_app_tag)}</strong></div>` : ''}
          ${settings.custom_pay_link ? `<div>Pay Online: <strong style="color: #0f172a;">${escapeHtml(settings.custom_pay_link)}</strong></div>` : ''}
        </div>
      </div>
    `
        : ''
    }

    <!-- Shop Notes / Terms -->
    ${
      invoice.notes || settings.invoice_notes
        ? `
      <div class="notes-box">
        <strong style="color: #334155;">Notes / Payment Terms:</strong>
        <div style="margin-top: 1px;">${escapeHtml(invoice.notes || settings.invoice_notes)}</div>
      </div>
    `
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * Native Android Print & Save-as-PDF Spooler
 */
export function printInvoiceDocument(
  invoice: InvoiceFull,
  items: WorkItem[],
  vehicle: Vehicle | null,
  settings: ShopSettings,
  workOrder: WorkOrder | null
) {
  const safeName = `Invoice_${invoice.number.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const cleanHtml = buildStandaloneInvoiceHtml(invoice, items, vehicle, settings, workOrder);

  printStandaloneHtml(cleanHtml, safeName);
}

export function printTechWorksheetDocument(wo: TechWorksheetWorkOrder, settings: ShopSettings) {
  const safeName = `Tech_Worksheet_WO_${String(wo.number || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  printStandaloneHtml(buildTechWorksheetHtml(wo, settings), safeName);
}

function printStandaloneHtml(cleanHtml: string, safeName: string) {
  // 1. Android Native Java Bridge with clean dedicated HTML spooler
  if (
    typeof window !== 'undefined' &&
    (window as any).AndroidNativePrinter &&
    typeof (window as any).AndroidNativePrinter.printInvoiceHtml === 'function'
  ) {
    try {
      (window as any).AndroidNativePrinter.printInvoiceHtml(cleanHtml, safeName);
      return;
    } catch (err) {
      console.warn('printInvoiceHtml failed, trying printInvoice fallback', err);
    }
  }

  // 2. Web browser: print via isolated hidden iframe
  if (typeof window !== 'undefined') {
    try {
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);

      const doc = frame.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(cleanHtml);
        doc.close();
        frame.contentWindow?.focus();
        setTimeout(() => {
          frame.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(frame);
          }, 1500);
        }, 300);
        return;
      }
    } catch (e) {
      console.warn('Iframe print failed, falling back to window.print', e);
    }

    if (typeof window.print === 'function') {
      window.print();
    }
  }
}
