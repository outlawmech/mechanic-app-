-- =============================================================
--  Outlaw Mech — Supabase schema
--  Work orders & invoicing for a mobile mechanic
--
--  HOW TO RUN
--  1. Supabase dashboard → SQL Editor
--  2. Paste this whole file → Run
--  Safe to re-run (idempotent).
--
--  SECURITY NOTE
--  This is a single-user setup. RLS is enabled on every table,
--  and the "anon_all_*" policies grant the anon (public) API key
--  full access so the mobile app works without login.
--  If you ever add users or share the project, replace those
--  policies with authenticated-user-scoped policies.
-- =============================================================

create extension if not exists pgcrypto;

-- ---------------- Customers ----------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null default '',
  email       text not null default '',
  phone       text not null default '',
  address     text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  year        int,
  make        text not null default '',
  model       text not null default '',
  trim        text not null default '',
  vin         text not null default '',
  plate       text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------- Work orders ----------------
create table if not exists public.work_orders (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  vehicle_id   uuid references public.vehicles (id) on delete set null,
  status       text not null default 'open'
               check (status in ('open','in_progress','completed','invoiced')),
  scheduled_at timestamptz,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.work_items (
  id            uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  kind          text not null default 'labor' check (kind in ('labor','part','fee')),
  description   text not null,
  quantity      numeric(10,2) not null default 1,
  unit_price    numeric(12,2) not null default 0,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------- Invoices ----------------
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,
  work_order_id uuid references public.work_orders (id) on delete set null,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  subtotal      numeric(12,2) not null default 0,
  tax_rate      numeric(5,4) not null default 0,
  tax           numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  status        text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  due_date      date,
  issued_at     timestamptz not null default now(),
  paid_at       timestamptz,
  notes         text not null default ''
);

-- ---------------- Indexes ----------------
create index if not exists vehicles_customer_id_idx    on public.vehicles (customer_id);
create index if not exists work_orders_customer_id_idx on public.work_orders (customer_id);
create index if not exists work_orders_status_idx      on public.work_orders (status);
create index if not exists work_items_work_order_idx   on public.work_items (work_order_id);
create index if not exists invoices_customer_id_idx    on public.invoices (customer_id);
create index if not exists invoices_status_idx         on public.invoices (status);

-- ---------------- Auto document numbers ----------------
-- Dedicated sequences for document numbering
create sequence if not exists public.work_orders_seq;
create sequence if not exists public.invoices_seq;

-- WO-2026-0001, INV-2026-0001, etc. (set when number is left empty)
create or replace function public.next_doc_number(seq regclass, prefix text)
returns text
language sql
volatile
as $$
  select format('%s-%s-%s', prefix, extract(year from current_date), lpad(nextval(seq)::text, 4, '0'));
$$;

create or replace function public.tg_work_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_doc_number('public.work_orders_seq'::regclass, 'WO');
  end if;
  return new;
end;
$$;

create or replace function public.tg_invoice_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or btrim(new.number) = '' then
    new.number := public.next_doc_number('public.invoices_seq'::regclass, 'INV');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_work_order_number on public.work_orders;
create trigger trg_work_order_number
  before insert on public.work_orders
  for each row execute function public.tg_work_order_number();

drop trigger if exists trg_invoice_number on public.invoices;
create trigger trg_invoice_number
  before insert on public.invoices
  for each row execute function public.tg_invoice_number();

-- ---------------- Row level security ----------------
alter table public.customers  enable row level security;
alter table public.vehicles   enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_items enable row level security;
alter table public.invoices   enable row level security;

-- Single-user access for the anon key (see security note at top).
drop policy if exists "anon_all_customers" on public.customers;
create policy "anon_all_customers" on public.customers
  for all to anon using (true) with check (true);

drop policy if exists "anon_all_vehicles" on public.vehicles;
create policy "anon_all_vehicles" on public.vehicles
  for all to anon using (true) with check (true);

drop policy if exists "anon_all_work_orders" on public.work_orders;
create policy "anon_all_work_orders" on public.work_orders
  for all to anon using (true) with check (true);

drop policy if exists "anon_all_work_items" on public.work_items;
create policy "anon_all_work_items" on public.work_items
  for all to anon using (true) with check (true);

drop policy if exists "anon_all_invoices" on public.invoices;
create policy "anon_all_invoices" on public.invoices
  for all to anon using (true) with check (true);
