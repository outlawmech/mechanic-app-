import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { money, fullName } from './format';
import type { InvoiceFull } from '../types';

/**
 * Capture the clean invoice element and render a professional US Letter PDF
 */
export async function createInvoicePDFBlob(
  elementId: string = 'print-area',
  invoiceNumber: string = 'Invoice'
): Promise<{ blob: Blob; file: File; dataUrl: string }> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Invoice container element not found');
  }

  // Clone element to render cleanly off-screen without mobile screen responsive limits
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = '780px';
  clone.style.maxWidth = '780px';
  clone.style.padding = '32px';
  clone.style.backgroundColor = '#ffffff';
  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  clone.style.zIndex = '-1000';
  clone.style.borderRadius = '0';
  clone.style.boxShadow = 'none';
  clone.style.border = 'none';
  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2.5, // 240 DPI high resolution
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 800,
    });

    const imgData = canvas.toDataURL('image/png');

    // US Letter in points: 612 x 792 pt
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter',
    });

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 36; // 0.5 inch margins
    const printableWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * printableWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, Math.min(imgHeight, pageHeight - margin * 2));

    const pdfBlob = pdf.output('blob');
    const fileName = `${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
    const dataUrl = pdf.output('datauristring');

    return { blob: pdfBlob, file: pdfFile, dataUrl };
  } finally {
    document.body.removeChild(clone);
  }
}

/**
 * 1-Tap Direct PDF Download to Phone or Desktop
 */
export async function downloadInvoicePDF(
  elementId: string = 'print-area',
  invoiceNumber: string = 'Invoice'
): Promise<void> {
  const { blob, file } = await createInvoicePDFBlob(elementId, invoiceNumber);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Share PDF directly via Email / SMS with PDF Attachment on Mobile
 */
export async function shareInvoicePDFWithEmail(
  elementId: string = 'print-area',
  invoice: InvoiceFull,
  customerEmail?: string
): Promise<{ method: 'share' | 'mailto' | 'download' }> {
  const fileName = `Invoice_${invoice.number.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  try {
    const { blob, file, dataUrl } = await createInvoicePDFBlob(elementId, invoice.number);

    // 1. If running on Mobile with Capacitor Share plugin
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: `Invoice ${invoice.number}`,
          text: `Invoice #${invoice.number} - Total: ${money(invoice.total)}. Please find your invoice PDF attached.`,
          url: dataUrl,
          dialogTitle: 'Share Invoice PDF (Email / Messages / Drive)',
        });
        return { method: 'share' };
      } catch (err) {
        console.warn('Capacitor Share failed, attempting browser share', err);
      }
    }

    // 2. If modern browser supports file sharing (Web Share API Level 2)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Invoice #${invoice.number}`,
        text: `Here is Invoice #${invoice.number} for ${money(invoice.total)}.`,
      });
      return { method: 'share' };
    }

    // 3. Fallback: Download the PDF and open mailto draft
    downloadInvoicePDF(elementId, invoice.number);
    const mailSubject = encodeURIComponent(`Invoice #${invoice.number}`);
    const mailBody = encodeURIComponent(
      `Hello ${fullName(invoice.customer)},\n\nHere is your invoice #${invoice.number} in the amount of ${money(
        invoice.total
      )}.\n\n(Your invoice PDF has been downloaded to your device — please attach it to this email.)\n\nThank you for your business!`
    );
    window.location.href = `mailto:${customerEmail || invoice.customer.email || ''}?subject=${mailSubject}&body=${mailBody}`;
    return { method: 'mailto' };
  } catch (e) {
    console.error('Failed to share PDF', e);
    // Ultimate fallback: direct download
    downloadInvoicePDF(elementId, invoice.number);
    return { method: 'download' };
  }
}
