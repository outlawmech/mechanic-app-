import { Capacitor } from '@capacitor/core';

export const isNativePlatform = Capacitor.isNativePlatform();

/**
 * Native Android & Web PDF / Print Spooler
 * Hooks directly into Android PrintManager when inside the APK,
 * or standard window.print() in web browsers.
 */
export function printInvoiceDocument(documentName: string = 'Outlaw_Invoice') {
  const safeName = documentName.replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Android Native Java Bridge
  if (
    typeof window !== 'undefined' &&
    (window as any).AndroidNativePrinter &&
    typeof (window as any).AndroidNativePrinter.printInvoice === 'function'
  ) {
    try {
      (window as any).AndroidNativePrinter.printInvoice(safeName);
      return;
    } catch (err) {
      console.warn('AndroidNativePrinter failed, falling back to window.print', err);
    }
  }

  // 2. Standard Browser Print dialog (Desktop, iOS Safari, Chrome)
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}
