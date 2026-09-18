-- =============================================================
--  Optional demo data — run AFTER schema.sql.
--  Adds a few customers, vehicles, work orders and invoices
--  so the app isn't empty.
--  Safe to re-run: it first removes any partial demo data.
-- =============================================================

-- Remove any partial demo rows from a previous (failed) run.
-- These UUID prefixes (a000…/b000…/c000…) are demo-only.
delete from public.invoices
  where work_order_id in (select id from public.work_orders where id like 'c0000000-0000-4000-8000-0000%');
delete from public.work_items
  where work_order_id in (select id from public.work_orders where id like 'c0000000-0000-4000-8000-0000%');
delete from public.work_orders where id like 'c0000000-0000-4000-8000-0000%';
delete from public.vehicles where id like 'b0000000-0000-4000-8000-0000%';
delete from public.customers where id like 'a0000000-0000-4000-8000-0000%';

insert into public.customers (id, first_name, last_name, email, phone, address, notes) values
  ('a0000000-0000-4000-8000-000000000001', 'Dale', 'Reyes', 'dale.reyes@example.com', '406-555-0134', '412 Ridge Rd, Bozeman, MT', 'Fleet of two trucks. Prefers morning service.'),
  ('a0000000-0000-4000-8000-000000000002', 'Priya', 'Natarajan', 'priya@example.com', '406-555-0177', '88 Main St, Helena, MT', ''),
  ('a0000000-0000-4000-8000-000000000003', 'Marcus', 'Webb', 'marcus.webb@example.com', '406-555-0119', '1540 River Rd, Whitefish, MT', 'Sends work orders ahead — usually diesel.');

insert into public.vehicles (id, customer_id, year, make, model, trim, vin, plate) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 2018, 'Ford', 'F-150', 'XLT', '1FTEW1E45JFA00001', 'MTH-4821'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 2021, 'Toyota', 'Tundra', 'SR5', '1T1FF1EP5MC000002', 'MTH-9034'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 2022, 'Honda', 'Civic', 'EX', '2HGFE1F99NH000003', 'MTH-7712'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 2019, 'Chevrolet', 'Silverado 2500HD', 'LT', '3GCUDGEG4KG000004', 'MTH-2210');

insert into public.work_orders
  (id, customer_id, vehicle_id, status, scheduled_at, notes, created_at, completed_at) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'in_progress', now() + interval '1 hour', 'Front-end clunk, worse over bumps.', now() - interval '2 hours', NULL),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'open', now() + interval '1 day', 'Brakes squealing on hard stops.', now() - interval '1 day', NULL),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'completed', (now() - interval '1 day')::date, 'Full front brake service + inspection.', now() - interval '3 days', now() - interval '1 day'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'invoiced', (now() - interval '6 days')::date, 'Annual oil, filters, inspection.', now() - interval '7 days', now() - interval '6 days');

insert into public.work_items (work_order_id, kind, description, quantity, unit_price, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', 'labor', 'Front control arm inspection', 1, 95, 1),
  ('c0000000-0000-4000-8000-000000000001', 'part', 'Front control arms (each)', 2, 88, 2),
  ('c0000000-0000-4000-8000-000000000002', 'labor', 'Brake inspection (all corners)', 1, 45, 1),
  ('c0000000-0000-4000-8000-000000000003', 'labor', 'Brake service (front): pads, rotors, labor', 1, 180, 1),
  ('c0000000-0000-4000-8000-000000000003', 'part', 'Front rotors (each)', 2, 68, 2),
  ('c0000000-0000-4000-8000-000000000003', 'part', 'Front brake pads (each axle)', 2, 54, 3),
  ('c0000000-0000-4000-8000-000000000003', 'fee', 'Old parts disposal', 1, 12.50, 4),
  ('c0000000-0000-4000-8000-000000000003', 'fee', 'Road test', 1, 50, 5),
  ('c0000000-0000-4000-8000-000000000004', 'labor', 'Oil & filter change', 1, 95, 1),
  ('c0000000-0000-4000-8000-000000000004', 'part', '0W-20 synthetic oil (each qt)', 6, 12, 2),
  ('c0000000-0000-4000-8000-000000000004', 'part', 'Oil filter', 1, 18.50, 3),
  ('c0000000-0000-4000-8000-000000000004', 'fee', 'Shop supplies', 1, 26.50, 4);

insert into public.invoices
  (work_order_id, customer_id, subtotal, tax_rate, tax, total, status, due_date, issued_at, paid_at) values
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 486.50, 0.04, 19.46, 505.96, 'unpaid', (now() + interval '10 days')::date, now() - interval '1 day', NULL),
  ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 212.00, 0.04, 8.48, 220.48, 'paid', (now() - interval '2 days')::date, now() - interval '5 days', now() - interval '3 days');
