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
  signature_url    text,
  signed_by_name   text,
  signed_at        timestamptz,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

-- ---------------- Work Order Photos ----------------
create table if not exists public.work_order_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) default auth.uid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  photo_url     text not null,
  category      text not null default 'general',
  caption       text not null default '',
  created_at    timestamptz not null default now()
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
  status        text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  payments      jsonb not null default '[]'::jsonb,
  due_date      date,
  issued_at     timestamptz not null default now(),
  paid_at       timestamptz,
  notes         text not null default ''
);

alter table public.invoices add column if not exists payments jsonb not null default '[]'::jsonb;
update public.invoices set payments = '[]'::jsonb where payments is null;
alter table public.invoices alter column payments set default '[]'::jsonb;
alter table public.invoices alter column payments set not null;
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check check (status in ('unpaid','partial','paid','void'));

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
  zelle_info         text not null default '',
  venmo_handle       text not null default '',
  cash_app_tag       text not null default '',
  custom_pay_link    text not null default '',
  updated_at         timestamptz not null default now()
);

alter table public.shop_settings add column if not exists zelle_info text default '';
alter table public.shop_settings add column if not exists venmo_handle text default '';
alter table public.shop_settings add column if not exists cash_app_tag text default '';
alter table public.shop_settings add column if not exists custom_pay_link text default '';
alter table public.shop_settings add column if not exists enable_dealership_mode boolean default false;
alter table public.shop_settings add column if not exists dealership_doc_fee numeric(10,2) default 199.00;
alter table public.shop_settings add column if not exists dealership_prep_fee numeric(10,2) default 250.00;
alter table public.shop_settings add column if not exists dealership_freight_fee numeric(10,2) default 350.00;

-- ---------------- Dealership & Showroom Inventory ----------------
create table if not exists public.dealership_units (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) default auth.uid(),
  stock_number        text not null default '',
  condition           text not null default 'new' check (condition in ('new', 'used', 'consignment')),
  type                text not null default 'motorcycle',
  year                int,
  make                text not null default '',
  model               text not null default '',
  trim                text not null default '',
  vin                 text not null default '',
  color               text not null default '',
  mileage_or_hours    text not null default '',
  engine_info         text not null default '',
  engine_serial       text not null default '',
  cost_price          numeric(12,2) not null default 0.00,
  msrp_price          numeric(12,2) not null default 0.00,
  sale_price          numeric(12,2) not null default 0.00,
  status              text not null default 'in_stock' check (status in ('in_stock', 'sale_pending', 'sold', 'consignment')),
  location            text not null default 'Showroom',
  notes               text not null default '',
  is_floored          boolean not null default false,
  floorplan_company   text not null default '',
  floorplan_balance   numeric(12,2) not null default 0.00,
  floorplan_curtailment_date timestamptz,
  floorplan_curtailment_amount numeric(10,2) not null default 0.00,
  floorplan_paid_off  boolean not null default false,
  sold_at             timestamptz,
  sold_to_customer_id uuid references public.customers (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------- Buyer's Orders & Unit Bill of Sale ----------------
create table if not exists public.buyers_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) default auth.uid(),
  order_number        text not null default '',
  customer_id         uuid not null references public.customers (id) on delete cascade,
  unit_id             uuid references public.dealership_units (id) on delete set null,
  unit_year           int,
  unit_make           text not null default '',
  unit_model          text not null default '',
  unit_vin            text not null default '',
  unit_color          text not null default '',
  unit_condition      text not null default 'new',
  unit_price          numeric(12,2) not null default 0.00,
  freight_fee         numeric(10,2) not null default 0.00,
  prep_fee            numeric(10,2) not null default 0.00,
  doc_fee             numeric(10,2) not null default 0.00,
  accessories_total   numeric(12,2) not null default 0.00,
  trade_in_allowance  numeric(12,2) not null default 0.00,
  trade_in_payoff     numeric(12,2) not null default 0.00,
  trade_in_info       text not null default '',
  tax_rate            numeric(5,4) not null default 0.00,
  tax_amount          numeric(10,2) not null default 0.00,
  title_reg_fee       numeric(10,2) not null default 0.00,
  rebate_amount       numeric(10,2) not null default 0.00,
  down_payment        numeric(12,2) not null default 0.00,
  total_price         numeric(12,2) not null default 0.00,
  balance_due         numeric(12,2) not null default 0.00,
  payment_method      text not null default 'cash',
  status              text not null default 'quote' check (status in ('quote', 'pending', 'completed', 'canceled')),
  notes               text not null default '',
  signature_url       text,
  signed_by_name      text,
  signed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.dealership_units enable row level security;
alter table public.buyers_orders   enable row level security;

drop policy if exists "users_own_dealership_units" on public.dealership_units;
create policy "users_own_dealership_units" on public.dealership_units
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_buyers_orders" on public.buyers_orders;
create policy "users_own_buyers_orders" on public.buyers_orders
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

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

-- ---------------- Activation & Promo Codes ----------------
create table if not exists public.activation_codes (
  code         text primary key,
  max_uses     int not null default 5,
  used_count   int not null default 0,
  is_active    boolean not null default true,
  description  text not null default 'Beta Tester VIP Pass',
  created_at   timestamptz not null default now()
);

create table if not exists public.code_redemptions (
  id           uuid primary key default gen_random_uuid(),
  code         text not null references public.activation_codes (code) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  redeemed_at  timestamptz not null default now(),
  unique(code, user_id)
);

alter table public.activation_codes enable row level security;
alter table public.code_redemptions enable row level security;

create policy "anyone_can_read_activation_codes" on public.activation_codes
  for select using (true);

create policy "users_can_insert_redemptions" on public.code_redemptions
  for insert with check (auth.uid() = user_id);

create policy "users_can_view_own_redemptions" on public.code_redemptions
  for select using (auth.uid() = user_id);

-- Function to safely redeem a limited code
create or replace function public.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text := upper(trim(p_code));
  v_user_id uuid := auth.uid();
  v_code_rec record;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'You must be logged in to redeem a code.');
  end if;

  -- Select code with lock
  select * into v_code_rec from public.activation_codes
  where upper(code) = v_code for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid activation code.');
  end if;

  if not v_code_rec.is_active then
    return jsonb_build_object('success', false, 'error', 'This activation code is no longer active.');
  end if;

  if v_code_rec.used_count >= v_code_rec.max_uses then
    return jsonb_build_object('success', false, 'error', 'This beta code has reached its maximum number of redemptions.');
  end if;

  -- Check if already redeemed by this user
  if exists (select 1 from public.code_redemptions where code = v_code_rec.code and user_id = v_user_id) then
    return jsonb_build_object('success', true, 'message', 'Code already redeemed for this account.');
  end if;

  -- Record redemption and increment count
  insert into public.code_redemptions (code, user_id) values (v_code_rec.code, v_user_id);
  update public.activation_codes set used_count = used_count + 1 where code = v_code_rec.code;

  -- Update shop_settings for user
  update public.shop_settings set subscription_status = 'active', updated_at = now()
  where user_id = v_user_id or id = v_user_id::text;

  return jsonb_build_object('success', true, 'message', 'VIP Pro access unlocked successfully!');
end;
$$;

-- Seed initial beta code with max 10 uses
insert into public.activation_codes (code, max_uses, used_count, is_active, description)
values ('VIP-RIG', 10, 0, true, 'Beta Tester Launch Pass (Max 10)')
on conflict (code) do nothing;

-- ---------------- Counter sale stock safety ----------------
-- Atomic stock deduction prevents concurrent counter sales from overselling.
create or replace function public.decrement_parts_for_counter_sale(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item record;
  remaining_qty numeric;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Counter-sale stock items must be a JSON array';
  end if;

  for item in
    select (entry.value ->> 'part_id')::uuid as part_id,
           sum((entry.value ->> 'quantity')::numeric) as quantity
      from jsonb_array_elements(p_items) as entry(value)
     where entry.value ->> 'part_id' is not null
     group by (entry.value ->> 'part_id')::uuid
     order by (entry.value ->> 'part_id')::uuid
  loop
    if item.quantity is null or item.quantity <= 0 then
      raise exception 'Stock deduction quantity must be greater than zero';
    end if;

    update public.parts
       set qty_on_hand = qty_on_hand - item.quantity,
           updated_at = now()
     where id = item.part_id
       and qty_on_hand >= item.quantity
     returning qty_on_hand into remaining_qty;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: Part % does not have enough quantity on hand', item.part_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.decrement_parts_for_counter_sale(jsonb) from public;
grant execute on function public.decrement_parts_for_counter_sale(jsonb) to authenticated;

-- Lock financial line items once any invoice has been issued for a repair order.
-- Existing records are not changed; only future line-item edits are rejected.
create or replace function public.reject_work_item_changes_after_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    if exists (
      select 1 from public.invoices where work_order_id = old.work_order_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'INVOICED_WORK_ORDER_ITEMS_LOCKED: this repair order already has an issued invoice; create a separate repair order for additional work';
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if exists (
      select 1 from public.invoices where work_order_id = new.work_order_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'INVOICED_WORK_ORDER_ITEMS_LOCKED: this repair order already has an issued invoice; create a separate repair order for additional work';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_work_item_changes_after_invoice() from public;
grant execute on function public.reject_work_item_changes_after_invoice() to authenticated;

drop trigger if exists lock_work_items_after_invoice on public.work_items;
create trigger lock_work_items_after_invoice
before insert or update or delete on public.work_items
for each row execute function public.reject_work_item_changes_after_invoice();
