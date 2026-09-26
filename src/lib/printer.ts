import { Capacitor } from '@capacitor/core';

export const isNativePlatform = Capacitor.isNativePlatform();

/**
 * Generate a standalone printable HTML document string for clean spooling
 */
export function getPrintableInvoiceHtml(elementId: string = 'print-area'): string {
  const element = document.getElementById(elementId);
  if (!element) return '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice</title>
  <style>
    @page {
      size: letter portrait;
      margin: 12mm 15mm;
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
      font-size: 11pt;
      line-height: 1.4;
      width: 100%;
    }
    .invoice-wrapper {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    th {
      background-color: #f8fafc;
      border-bottom: 2px solid #e2e8f0;
      padding: 8px 12px;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 11pt;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  </style>
</head>
<body>
  <div class="invoice-wrapper">
    ${element.innerHTML}
  </div>
</body>
</html>`;
}

/**
 * Native Android & Web PDF / Print Spooler
 * Hooks directly into Android PrintManager when inside the APK,
 * or standard window.print() in web browsers.
 */
export function printInvoiceDocument(documentName: string = 'Outlaw_Invoice', elementId: string = 'print-area') {
  const safeName = documentName.replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Android Native Java Bridge with clean dedicated HTML spooler
  if (
    typeof window !== 'undefined' &&
    (window as any).AndroidNativePrinter &&
    typeof (window as any).AndroidNativePrinter.printInvoiceHtml === 'function'
  ) {
    try {
      const cleanHtml = getPrintableInvoiceHtml(elementId);
      if (cleanHtml) {
        (window as any).AndroidNativePrinter.printInvoiceHtml(cleanHtml, safeName);
        return;
      }
    } catch (err) {
      console.warn('printInvoiceHtml failed, trying printInvoice fallback', err);
    }
  }

  // 2. Fallback to basic AndroidNativePrinter.print()
  if (
    typeof window !== 'undefined' &&
    (window as any).AndroidNativePrinter &&
    typeof (window as any).AndroidNativePrinter.print === 'function'
  ) {
    try {
      (window as any).AndroidNativePrinter.print(safeName);
      return;
    } catch (err) {
      console.warn('AndroidNativePrinter failed, falling back to window.print', err);
    }
  }

  // 3. Web desktop / iOS / browser fallback
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}
