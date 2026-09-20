-- =============================================================
--  Outlaw Shop Systems (OSS) — Supabase schema
--  Multi-tenant work orders, invoicing, parts & shop management
--
--  HOW TO RUN
--  1. Supabase dashboard → SQL Editor
--  2. Paste this whole file → Run
--  Safe to re-run (idempotent).
-- =============================================================

create extension if not exists pgcrypto;

-- ---------------- Customers ----------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) default auth.uid(),
  first_name  text not null,
  last_name   text not null default '',
  email       text not null default '',
  phone       text not null default '',
  address     text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------- Vehicles & Marine Vessels ----------------
create table if not exists public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) default auth.uid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  type           text not null default 'auto',
  year           int,
  make           text not null default '',
  model          text not null default '',
  trim           text not null default '',
  vin            text not null default '',
  plate          text not null default '',
  engine_hours   numeric(10,1),
  engine_info    text not null default '',
  engine_serial  text not null default '',
  engine2_info   text not null default '',
  engine2_serial text not null default '',
  engine2_hours  numeric(10,1),
  created_at     timestamptz not null default now()
);

-- ---------------- Parts & Inventory ----------------
create table if not exists public.parts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) default auth.uid(),
  sku           text not null default '',
  name          text not null,
  category      text not null default 'General',
  cost_price    numeric(12,2) not null default 0.00,
  sell_price    numeric(12,2) not null default 0.00,
  qty_on_hand   numeric(10,2) not null default 0,
  reorder_point numeric(10,2) not null default 0,
  location      text not null default '',
  supplier      text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------- Work orders ----------------
create table if not exists public.work_orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) default auth.uid(),
  number           text not null unique,
  customer_id      uuid not null references public.customers (id) on delete cascade,
  vehicle_id       uuid references public.vehicles (id) on delete set null,
  status           text not null default 'open'
                   check (status in ('open','in_progress','completed','invoiced')),
  scheduled_at     timestamptz,
  mileage_or_hours text not null default '',
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

-- ---------------- Work items (Labor, Parts, Fees) ----------------
create table if not exists public.work_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) default auth.uid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  part_id       uuid references public.parts (id) on delete set null,
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
  user_id       uuid references auth.users (id) default auth.uid(),
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

-- ---------------- Shop settings & Branding ----------------
create table if not exists public.shop_settings (
  id                 text primary key default 'default',
  user_id            uuid references auth.users (id) default auth.uid(),
  shop_name          text not null default 'Outlaw Shop Systems',
  tagline            text not null default 'Mobile & Shop Management',
  phone              text not null default '406-555-0100',
  email              text not null default 'service@outlawshopsystems.com',
  address            text not null default 'Helena, MT',
  default_labor_rate numeric(10,2) not null default 95.00,
  default_tax_rate   numeric(5,4) not null default 0.04,
  invoice_notes      text not null default 'Thank you for your business! Payments due on or before the due date.',
  logo_url           text not null default '',
  updated_at         timestamptz not null default now()
);

-- ---------------- Indexes ----------------
create index if not exists customers_user_id_idx       on public.customers (user_id);
create index if not exists vehicles_customer_id_idx    on public.vehicles (customer_id);
create index if not exists vehicles_user_id_idx        on public.vehicles (user_id);
create index if not exists parts_user_id_idx           on public.parts (user_id);
create index if not exists parts_sku_idx               on public.parts (sku);
create index if not exists parts_category_idx          on public.parts (category);
create index if not exists work_orders_customer_id_idx on public.work_orders (customer_id);
create index if not exists work_orders_user_id_idx     on public.work_orders (user_id);
create index if not exists work_orders_status_idx      on public.work_orders (status);
create index if not exists work_items_work_order_idx   on public.work_items (work_order_id);
create index if not exists invoices_customer_id_idx    on public.invoices (customer_id);
create index if not exists invoices_user_id_idx        on public.invoices (user_id);
create index if not exists invoices_status_idx         on public.invoices (status);

-- ---------------- Auto document numbers ----------------
create sequence if not exists public.work_orders_seq;
create sequence if not exists public.invoices_seq;

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

-- ---------------- Multi-Tenant Row Level Security ----------------
alter table public.customers     enable row level security;
alter table public.vehicles      enable row level security;
alter table public.parts         enable row level security;
alter table public.work_orders    enable row level security;
alter table public.work_items    enable row level security;
alter table public.invoices      enable row level security;
alter table public.shop_settings enable row level security;

-- Policies: Authenticated users only see and edit their own data
drop policy if exists "users_own_customers" on public.customers;
create policy "users_own_customers" on public.customers
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_vehicles" on public.vehicles;
create policy "users_own_vehicles" on public.vehicles
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_parts" on public.parts;
create policy "users_own_parts" on public.parts
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_work_orders" on public.work_orders;
create policy "users_own_work_orders" on public.work_orders
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_work_items" on public.work_items;
create policy "users_own_work_items" on public.work_items
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_invoices" on public.invoices;
create policy "users_own_invoices" on public.invoices
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_shop_settings" on public.shop_settings;
create policy "users_own_shop_settings" on public.shop_settings
  for all using (auth.uid() = user_id or id = 'default' or user_id is null)
  with check (auth.uid() = user_id or id = 'default' or user_id is null);
