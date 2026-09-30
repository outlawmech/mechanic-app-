import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageTitle } from '../components/ui';

type Topic = {
  title: string;
  summary: string;
  path?: string;
  steps: string[];
  notes?: string[];
};

const topics: Topic[] = [
  {
    title: 'Add dealership staff', summary: 'Separate logins and shared shop records', path: '/settings',
    steps: [
      'The dealership owner opens Settings, enters the staff member’s name and email, and creates an invitation code.',
      'Give that code only to the named person. They sign in or create a login using that exact email, then enter the code in Settings within seven days.',
      'Each person sets their display name in Settings. The app records who changes shop records and who records a payment.',
      'The owner can remove staff access in Settings when someone leaves.',
    ],
    notes: ['Staff share the dealership’s records and can edit operational records. Only the owner changes shop settings and manages invitations. An existing login can join if its personal shop has no records or other staff; separate shops are not merged.'],
  },
  {
    title: 'Set up your shop', summary: 'Business details, rates, tax, and payment options', path: '/settings',
    steps: [
      'Open Settings. Enter your shop name, phone, email, service area, and invoice footer, then save.',
      'Set your standard hourly labor rate and default sales tax percentage. Enter 0 when your transactions have no sales tax.',
      'Add any Zelle, Venmo, Cash App, or external payment link you want to show on invoices.',
      'Your plan determines which tools appear. Redeem a plan code in Settings if one was provided.',
    ],
    notes: ['Review tax on each document before issuing it. Payment handles do not automatically record a payment in the app.'],
  },
  {
    title: 'Reset your password', summary: 'Get a new login password from an email link',
    steps: [
      'On the sign-in screen, choose Forgot password?, enter your account email, and send the reset email.',
      'Open the newest reset email on the device you want to use and follow its link to the app.',
      'Enter and save a new password, then sign in with it.',
    ],
    notes: ['If a link has expired, request a fresh one. Do not share the full link or a screenshot showing its address; it contains a login token.'],
  },
  {
    title: 'Add customers and equipment', summary: 'Create a customer and keep service history together', path: '/customers',
    steps: [
      'Open Customers and choose Add Customer. Enter a first name and any available contact details.',
      'Add a vehicle or piece of equipment with its category, year, make, model, VIN/HIN, and mileage or hours.',
      'Open the customer record later to edit details, add equipment, or review related work and invoices.',
    ],
    notes: ['Check decoded VIN information against the actual unit. Enter missing or incorrect details manually.'],
  },
  {
    title: 'Write a work order', summary: 'Intake, work, notes, and completion', path: '/work',
    steps: [
      'Start a new work order from Home or Work Orders. Select a customer, or add one in place with + Quick New Customer; choose equipment when applicable.',
      'Record the concern and add labor, parts, or fees with the right quantity and rate.',
      'Use service notes and photos for findings. Capture a customer signature when authorization is needed.',
      'Choose Start Work Order when work begins, then Mark WO Completed when it is done.',
      'For customer work, review the lines and tax before creating an invoice.',
    ],
    notes: ['Issued invoices lock the WO’s financial lines. Put additional billable work on a separate WO.', 'For an internal PDI or rigging WO, complete the work and use Close Internal WO. This posts cost to the unit without issuing a customer invoice.'],
  },
  {
    title: 'Invoice and record payments', summary: 'Send bills, take partial payments, print receipts', path: '/invoices',
    steps: [
      'Complete a customer WO, choose Create Invoice, and check line items, total, and tax before issuing it.',
      'The new invoice opens after creation. Share it using your device’s email or messaging options, or select Print / Save PDF.',
      'After payment is actually received, choose Record Payment, enter the amount and method, then save.',
      'For a deposit or partial payment, enter only what you received. The unpaid amount remains due.',
    ],
    notes: ['Sharing an invoice does not collect or record payment automatically.'],
  },
  {
    title: 'Schedule work', summary: 'Appointments and upcoming jobs', path: '/schedule',
    steps: [
      'Open Schedule and choose the calendar or list view.',
      'Add an appointment with its customer, date, time, and job details.',
      'Save and confirm it appears on the correct day. Update the appointment when plans change.',
    ],
  },
  {
    title: 'Manage parts inventory', summary: 'Stock, SKUs, prices, and imports', path: '/parts',
    steps: [
      'Open Parts and add an item with its SKU, description, quantity, cost, and selling price.',
      'Search by SKU or name to find stocked parts for work orders and counter sales.',
      'For many parts, use Import CSV and review the imported quantities and prices.',
      'After a sale, reopen the part to confirm the remaining stock.',
    ],
    notes: ['A price book listing does not mean a part is physically in stock.'],
  },
  {
    title: 'Make a counter sale', summary: 'Walk-in parts purchases', path: '/parts/counter',
    steps: [
      'Open Parts Counter and select an existing customer or use a walk-in name.',
      'Search or scan a SKU, add the quantity, and check the price and stock.',
      'Review the discount, tax, and total, then complete the sale with the correct payment method.',
      'Open the receipt and verify that payment and stock quantity were recorded.',
    ],
  },
  {
    title: 'Track a special order', summary: 'Request, receive, bin, and notify', path: '/parts',
    steps: [
      'On Parts, switch to Special Orders and choose New Special Order.',
      'Enter the part, customer, supplier, quantity, and pricing.',
      'When it arrives, choose Receive & Bin and record where it is held.',
      'Use Notify Customer to prepare a message; verify it was sent from your messaging app.',
    ],
  },
  {
    title: 'Purchase and receive Special Orders', summary: 'Review supplier POs, place orders, and record shipments', path: '/parts/purchase-orders',
    steps: [
      'A Special Order linked to a catalog part and supplier is added to that supplier’s Draft Purchase Order. Draft POs can collect several customer orders.',
      'Open Parts → Purchase Orders. Print or export the PO, place the order with the supplier, then choose Mark Ordered.',
      'When a shipment arrives, open Receive. Receive All Remaining fills the expected quantities; adjust quantities and actual unit costs where needed, then enter freight and confirm.',
      'Customer Special Order quantities stay reserved in their holding bins. Only ordinary-stock quantities increase freely available inventory.',
      'Partial shipments remain open on the PO. Once a customer’s full quantity arrives, use the existing Special Orders screen to prepare a notification and complete pickup/fulfillment.',
    ],
    notes: ['Freight is recorded separately from part unit cost. Actual costs are saved per receipt; the part catalog cost uses the latest received unit cost.'],
  },
  {
    title: 'Add a showroom unit and PDI', summary: 'Dealer inventory and preparation', path: '/sales',
    steps: [
      'In Dealership mode, open Sales and choose Add Unit. Enter stock number, year, make, model, cost, and asking price. Add VIN and floorplan details when available.',
      'Save the unit and verify its stock number and price on the showroom list.',
      'The PDI button creates an internal work order with the stock number and two starting labor tasks. Review and adjust work as needed.',
      'After the technician finishes, mark the WO completed and choose Close Internal WO to post costs to the unit.',
      'Keep the manufacturer’s PDI form with your normal delivery records.',
    ],
    notes: ['PDI closeout uses the internal labor cost rate in Settings and the current cost of stocked parts. The WO’s labor selling rate is not the internal labor cost; if the internal rate is 0, labor adds $0 to unit cost. Closeout does not create a customer invoice or change the unit’s sale price.'],
  },
  {
    title: 'Create a Buyer’s Order', summary: 'Unit price, fees, trade, accessories, and delivery', path: '/sales',
    steps: [
      'Choose Buyer’s Order on a showroom unit, or create a new deal, then select the customer.',
      'Enter the agreed unit price. Review every prefilled freight, prep, documentation, and title fee; change or remove fees that do not apply. Add installed accessories, trade allowance and payoff, rebates, and down payment as applicable.',
      'Review taxable amount, tax, total, and remaining balance before saving.',
      'After saving a deal linked to a showroom unit, choose Dispatch Rigging WO for buyer-requested work. Service adds stocked parts and labor, then completes and closes that internal WO.',
      'Print the Buyer’s Order for handwritten buyer and salesperson signatures and dates at the conclusion of the deal. The on-screen buyer signature is optional.',
      'Mark Completed & Sold when the sale is final and the unit is delivered. A linked sold unit leaves the showroom list and appears in the buyer’s customer vehicles for future service work.',
    ],
    notes: ['Installed Parts & Accessories is added to unit price. Do not include the same charge in both fields.', 'Rigging tracks service cost and uses stocked part cost at closeout; set the customer-facing accessory price in the Buyer’s Order yourself. No separate customer invoice is created for internal rigging.', 'For a floored unit, leave the payoff confirmation unchecked until the lender has actually been paid. An unpaid floorplan balance remains on the Sales summary even after the unit is sold.'],
  },
  {
    title: 'Review reports', summary: 'Revenue, payments, and outstanding balances', path: '/reports',
    steps: [
      'Open Reports and choose the relevant date range.',
      'Compare revenue and receivables with issued invoices and recorded payments.',
      'A partial payment reduces the balance; it does not mark the entire invoice paid.',
    ],
  },
  {
    title: 'Work with a weak connection', summary: 'Local saves and cloud verification',
    steps: [
      'Load the app and records you will need while connected when possible.',
      'If an action says Saved locally or queued, reconnect and allow the app to sync.',
      'Reopen the record after reconnecting to confirm the change reached your account. Resolve any save error before continuing.',
    ],
    notes: ['Offline behavior varies by action and previously loaded data. Do not assume a queued change is already visible on another device.', 'Avoid clearing app storage or uninstalling while work is waiting to sync.'],
  },
  {
    title: 'Print or save a document', summary: 'Invoices and Buyer’s Orders',
    steps: [
      'Open the invoice or Buyer’s Order and choose its print action.',
      'Select a printer or Save as PDF in the device print dialog, when available.',
      'Preview pages and totals before giving the document to a customer.',
    ],
    notes: ['A printed Buyer’s Order has separate buyer and salesperson signature and date lines for signing by hand. Printing depends on your browser or Android print service and installed printer.'],
  },
  {
    title: 'Troubleshoot a missing record', summary: 'Checks before contacting support',
    steps: [
      'Check that you are signed into the right account and shop.',
      'Clear search text and status filters, then reopen or refresh the page. Sold units are in the buyer’s customer record and the deal list, not the showroom unit list.',
      'If you worked offline, reconnect and confirm the change synced.',
      'For billing differences, compare WO lines, invoice totals, recorded payments, and balance.',
      'When requesting help, include the screen name, record number, expected result, actual result, and an error screenshot.',
    ],
  },
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [openTitle, setOpenTitle] = useState<string | null>('Set up your shop');
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? topics.filter((topic) => `${topic.title} ${topic.summary} ${topic.steps.join(' ')} ${topic.notes?.join(' ') ?? ''}`.toLowerCase().includes(term)) : topics;
  }, [query]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <PageTitle title="Help &amp; Knowledge Base" sub="Practical steps for service, parts, billing, and unit sales." />
      <Card className="space-y-3 p-5 sm:p-6">
        <label htmlFor="help-search" className="block text-sm font-bold text-slate-900">What do you need to do?</label>
        <input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search payments, PDI, special orders…" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200" />
        <p className="text-xs leading-relaxed text-slate-600">New here? Set up your shop, add a customer and equipment, write a work order, complete the work, then invoice and record payment.</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((topic) => {
          const expanded = openTitle === topic.title || Boolean(query);
          const id = `help-${topic.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          return (
            <Card key={topic.title} className="overflow-hidden p-0">
              <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setOpenTitle(openTitle === topic.title ? null : topic.title)} className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50">
                <span><span className="block text-sm font-black text-slate-900">{topic.title}</span><span className="mt-1 block text-xs text-slate-600">{topic.summary}</span></span>
                <span aria-hidden="true" className="text-lg text-slate-500">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && <div id={id} className="space-y-3 border-t border-slate-100 px-4 pb-5 pt-4 text-sm text-slate-700">
                <ol className="list-decimal space-y-2 pl-5 leading-relaxed">{topic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                {topic.notes?.map((note) => <p key={note} className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">{note}</p>)}
                {topic.path && <Link to={topic.path} className="inline-block rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700">Open {topic.title} →</Link>}
              </div>}
            </Card>
          );
        })}
      </div>
      {filtered.length === 0 && <Card className="p-5 text-sm text-slate-600">No matching topic. Try a shorter term such as “invoice” or “part.”</Card>}
      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-black text-slate-900">Still stuck?</h2>
        <p className="text-xs leading-relaxed text-slate-600">Email the screen name, record number, what you expected, what happened, and a screenshot to <a className="font-bold text-orange-700 underline" href="mailto:service@outlawshopsystems.com">service@outlawshopsystems.com</a>. Leave passwords and payment details out of screenshots.</p>
      </Card>
    </div>
  );
}
