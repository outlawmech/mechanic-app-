import { fullName, money, num } from './format.ts';
import type { BuyersOrderFull, ShopSettings } from '../types';

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Print saved transaction data, never unsaved form values or recalculated totals. */
export function buildBuyersOrderHtml(order: BuyersOrderFull, settings: ShopSettings, stockNumber = ''): string {
  const identity = order.document_identity ?? {
    shop_name: settings.shop_name, buyer_name: fullName(order.customer),
    buyer_address: order.customer?.address ?? '', buyer_phone: order.customer?.phone ?? '', stock_number: stockNumber,
  };
  const rows: [string, unknown, boolean?][] = [
    ['Unit selling price', order.unit_price], ['Freight / destination', order.freight_fee],
    ['Assembly / dealer prep', order.prep_fee], ['Documentation fee', order.doc_fee],
    ['Installed parts & accessories', order.accessories_total], ['Trade-in allowance', order.trade_in_allowance, true],
    ['Trade-in lien payoff', order.trade_in_payoff], [`Sales tax (${num(order.tax_rate) * 100}%)`, order.tax_amount],
    ['Title / registration', order.title_reg_fee], ['Rebate / promotion', order.rebate_amount, true],
    ['Total delivered price', order.total_price], ['Deposit / down payment', order.down_payment, true],
    ['Balance due / financed', order.balance_due],
  ];
  const textSection = (title: string, text?: string) => text?.trim()
    ? `<section class="text-section"><h2>${escape(title)}</h2><div class="multiline">${escape(text)}</div></section>` : '';
  const documentTitle = `Buyer’s Order #${order.order_number}`;
  // Long text is allowed to fragment; only short financial rows/signatures stay together.
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(documentTitle)}</title><style>
    @page { size: letter portrait; margin: 12mm 15mm 15mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9pt Arial; } }
    * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font: 11pt/1.35 Arial, sans-serif; }
    .document { width: 100%; border-collapse: collapse; } .document > thead { display: table-header-group; }
    .document > tbody > tr { break-inside: auto; } .document > tbody > tr > td { padding: 0; }
    .identity { text-align: left; font-size: 9pt; font-weight: normal; padding: 0 0 3mm; border-bottom: 1px solid #cbd5e1; }
    header { display: flex; justify-content: space-between; gap: 20mm; border-bottom: 2px solid #0f172a; padding: 5mm 0; margin-bottom: 7mm; }
    h1 { font-size: 18pt; margin: 2mm 0 0; } .details { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-bottom: 7mm; }
    .prices { width: 100%; border-collapse: collapse; } .prices tr { break-inside: avoid; }
    .prices td { padding: 1.5mm 2mm; border-bottom: 1px solid #cbd5e1; } .prices td:last-child { text-align: right; white-space: nowrap; }
    .total { font-weight: bold; border-top: 2px solid #0f172a; }
    h2 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; } .multiline { white-space: pre-wrap; overflow-wrap: anywhere; orphans: 3; widows: 3; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 16mm; break-inside: avoid; page-break-inside: avoid; }
    .signatures div { display: flex; flex-direction: column; } .signatures span { border-bottom: 1px solid #0f172a; height: 11mm; }
    .signatures strong { font-size: 9pt; margin-top: 1mm; } .signatures p { margin: 5mm 0 0; font-size: 9pt; }
    .signature-image { max-width: 65mm; height: 11mm; object-fit: contain; object-position: left; }
  </style></head><body><table class="document"><thead><tr><th class="identity">${escape(documentTitle)} · ${escape(identity.buyer_name)}</th></tr></thead><tbody><tr><td>
    <header><div><strong>${escape(identity.shop_name)}</strong><h1>Buyer’s Order &amp; Bill of Sale</h1></div><div>${escape(documentTitle)}</div></header>
    <div class="details"><div><strong>Buyer</strong><br>${escape(identity.buyer_name)}<br><div class="multiline">${escape(identity.buyer_address)}</div>${escape(identity.buyer_phone)}</div>
    <div><strong>Unit</strong><br>${escape(order.unit_year)} ${escape(order.unit_make)} ${escape(order.unit_model)}<br>${order.unit_color ? `Color: ${escape(order.unit_color)}<br>` : ''}VIN / HIN: ${escape(order.unit_vin || '—')}${identity.stock_number ? `<br>Stock #: ${escape(identity.stock_number)}` : ''}</div></div>
    <table class="prices"><tbody>${rows.map(([label, value, credit]) => `<tr${label === 'Total delivered price' || label === 'Balance due / financed' ? ' class="total"' : ''}><td>${escape(label)}</td><td>${credit ? '− ' : ''}${money(value as number | string)}</td></tr>`).join('')}</tbody></table>
    ${textSection('Trade-in', order.trade_in_info)}${textSection('Deal notes', order.notes)}
    ${textSection('Accessories / Rigging Instructions', order.rigging_instructions)}${textSection('Sales Disclaimer', order.sales_disclaimer)}
    <div class="signatures"><div>${order.signature_url?.startsWith('data:image/png;base64,') ? `<img class="signature-image" src="${escape(order.signature_url)}" alt="Buyer signature">` : '<span></span>'}<strong>Buyer signature</strong><p>Printed name: ${escape(order.signed_by_name || identity.buyer_name)}</p><span></span><strong>Date${order.signed_at ? `: ${escape(order.signed_at.slice(0, 10))}` : ''}</strong></div>
    <div><span></span><strong>Salesperson signature</strong><p>Printed name: __________________________</p><span></span><strong>Date</strong></div></div>
  </td></tr></tbody></table></body></html>`;
}
