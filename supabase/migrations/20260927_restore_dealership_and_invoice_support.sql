-- Additive repair for existing installations.
-- Safe to rerun: existing customer, repair-order, invoice, and parts rows are not deleted.
create extension if not exists pgcrypto;

-- The app and Buyer’s Order form both use public.dealership_units.
create table if not exists public.dealership_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) default auth.uid(),
  stock_number text not null default '',
  condition text not null default 'new' check (condition in ('new', 'used', 'consignment')),
  type text not null default 'motorcycle',
  year int,
  make text not null default '',
  model text not null default '',
  trim text not null default '',
  vin text not null default '',
  color text not null default '',
  mileage_or_hours text not null default '',
  engine_info text not null default '',
  engine_serial text not null default '',
  cost_price numeric(12,2) not null default 0.00,
  msrp_price numeric(12,2) not null default 0.00,
  sale_price numeric(12,2) not null default 0.00,
  status text not null default 'in_stock' check (status in ('in_stock', 'sale_pending', 'sold', 'consignment')),
  location text not null default 'Showroom',
  notes text not null default '',
  is_floored boolean not null default false,
  floorplan_company text not null default '',
  floorplan_balance numeric(12,2) not null default 0.00,
  floorplan_curtailment_date timestamptz,
  floorplan_curtailment_amount numeric(10,2) not null default 0.00,
  floorplan_paid_off boolean not null default false,
  sold_at timestamptz,
  sold_to_customer_id uuid references public.customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyers_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) default auth.uid(),
  order_number text not null default '',
  customer_id uuid not null references public.customers (id) on delete cascade,
  unit_id uuid references public.dealership_units (id) on delete set null,
  unit_year int,
  unit_make text not null default '',
  unit_model text not null default '',
  unit_vin text not null default '',
  unit_color text not null default '',
  unit_condition text not null default 'new',
  unit_price numeric(12,2) not null default 0.00,
  freight_fee numeric(10,2) not null default 0.00,
  prep_fee numeric(10,2) not null default 0.00,
  doc_fee numeric(10,2) not null default 0.00,
  accessories_total numeric(12,2) not null default 0.00,
  trade_in_allowance numeric(12,2) not null default 0.00,
  trade_in_payoff numeric(12,2) not null default 0.00,
  trade_in_info text not null default '',
  tax_rate numeric(5,4) not null default 0.00,
  tax_amount numeric(10,2) not null default 0.00,
  title_reg_fee numeric(10,2) not null default 0.00,
  rebate_amount numeric(10,2) not null default 0.00,
  down_payment numeric(12,2) not null default 0.00,
  total_price numeric(12,2) not null default 0.00,
  balance_due numeric(12,2) not null default 0.00,
  payment_method text not null default 'cash',
  status text not null default 'quote' check (status in ('quote', 'pending', 'completed', 'canceled')),
  notes text not null default '',
  signature_url text,
  signed_by_name text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dealership_units enable row level security;
alter table public.buyers_orders enable row level security;

drop policy if exists "users_own_dealership_units" on public.dealership_units;
create policy "users_own_dealership_units" on public.dealership_units
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "users_own_buyers_orders" on public.buyers_orders;
create policy "users_own_buyers_orders" on public.buyers_orders
  for all using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

grant select, insert, update, delete on public.dealership_units, public.buyers_orders to authenticated;
create index if not exists dealership_units_user_id_idx on public.dealership_units (user_id);
create index if not exists buyers_orders_user_id_idx on public.buyers_orders (user_id);
create index if not exists buyers_orders_customer_id_idx on public.buyers_orders (customer_id);

-- Persist payment entries; old paid invoice records without entries remain paid and
-- are interpreted as fully collected by the app. Existing invoice data is preserved.
alter table public.invoices
  add column if not exists payments jsonb not null default '[]'::jsonb;
update public.invoices set payments = '[]'::jsonb where payments is null;
alter table public.invoices alter column payments set default '[]'::jsonb;
alter table public.invoices alter column payments set not null;

-- The app supports partial payments; retain all existing status values and add partial.
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check check (status in ('unpaid', 'partial', 'paid', 'void'));

-- Atomic stock deduction for counter checkout. The update is conditional and the
-- function raises if any line would exceed stock, rolling back the whole deduction.
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

-- Notify PostgREST that the public schema has changed.
notify pgrst, 'reload schema';
