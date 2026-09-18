# Outlaw Mech

Mobile-first work order & invoicing app for a mobile mechanic. Built with React + Vite +
TypeScript + Tailwind CSS, backed by [Supabase](https://supabase.com).

## Features

- **Dashboard** — active work orders, money outstanding, paid-this-month revenue
- **Work orders** — create, schedule, add labor/part/fee line items, move through
  `open → in progress → completed → invoiced`
- **Customers & vehicles** — contacts, addresses, and every vehicle on file
- **Invoices** — generated from completed work orders with auto-numbering
  (`WO-2026-0001`, `INV-2026-0001`), tax, 14-day due date, mark paid, and a
  print/PDF view
- Installable on your phone as a PWA (add to home screen)

## Setup

### 1. Database

1. Open your Supabase project → **SQL Editor**
2. Paste and run [`supabase/schema.sql`](supabase/schema.sql)
   (idempotent — safe to re-run)
3. Optional: run [`supabase/seed.sql`](supabase/seed.sql) to load demo data

### 2. Environment

```bash
cp .env.example .env
```

Fill in your project values (Supabase dashboard → Project Settings → API):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon public key>
```

### 3. Run

```bash
npm install
npm run dev
```

Open the local URL, or add the site to your phone's home screen for a
full app-like experience.

## Project structure

```
supabase/
  schema.sql     # tables, triggers (auto numbers), RLS
  seed.sql       # optional demo data
src/
  App.tsx        # router + setup gate
  components/    # layout, nav, UI kit, toasts, icons
  lib/           # supabase client, formatting, hooks
  pages/         # Dashboard, Work Orders, Customers, Invoices
```

## Notes

- **Single-user by design.** RLS is enabled on every table, and policies grant
  the `anon` key full access (see the security note at the top of
  `supabase/schema.sql`). If you add users, replace the `anon_all_*` policies
  with policies scoped to authenticated users.
- Invoices are generated from work orders; the invoice stores its own line-item
  snapshot of totals so history stays stable.

## Roadmap (ideas — not built yet)

### Parts counter module (brick & mortar)
Full parts counter for a physical store:
- **Inventory** — parts catalog: SKU, name, make/model fit, on-hand qty,
  reorder point, cost, sell price, margin
- **Ordering** — supplier purchase orders: create, send, track open POs
- **Receiving** — receive a PO against inventory, lot/serial tracking
- **Parts counter invoices** — customer pickup / phone-in sales: parts +
  optional labor, customer or job linkage, payment at counter
- **Stock levels** — low-stock alerts, best-sellers report, stocktakes
- Likely new tables: `parts`, `suppliers`, `purchase_orders`,
  `purchase_order_lines`, `receipts`, `parts_invoices` + reuse `customers`

### Vehicle types: marine / ATV / snowmobile
- `vehicle_type` (auto / marine / atv / snowmobile / other) with type badge in UI
- `engine_make`, `engine_model`, `engine_hours` fields
- VIN field doubles as HIN / serial number; plate as hull name / decal / car number
- Hour-based "due for service" nudges (marine & off-road)
- Seasonal service view (snowmobile fall/spring, ATV spring/fall)

### Other
- **Offline mode** (PWA service worker + queue) — docks, barns, and tracks are signal deserts
- Customer payment links / deposits
- Recurring service reminders
- Low-stock and "job parts pending" dashboards

