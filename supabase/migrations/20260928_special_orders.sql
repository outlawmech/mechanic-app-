-- The parts desk writes this table directly. Without it, the browser falls back to
-- local cache and a completed checkout cannot persist fulfillment status.
create table if not exists public.special_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) default auth.uid(),
  order_number text not null,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null,
  customer_phone text not null default '',
  customer_email text not null default '',
  part_id uuid references public.parts (id) on delete set null,
  part_number text not null,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  cost_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  vendor text not null default '',
  purchase_order_number text not null default '',
  tracking_number text not null default '',
  holding_bin text not null default '',
  deposit_amount numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'deposit_paid', 'paid_in_full')),
  status text not null default 'ordered'
    check (status in ('ordered', 'in_transit', 'received', 'notified', 'fulfilled', 'canceled')),
  work_order_id uuid references public.work_orders (id) on delete set null,
  ordered_at timestamptz,
  received_at timestamptz,
  notified_at timestamptz,
  fulfilled_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists special_orders_user_id_idx on public.special_orders (user_id);
create index if not exists special_orders_customer_id_idx on public.special_orders (customer_id);
alter table public.special_orders enable row level security;

drop policy if exists users_own_special_orders on public.special_orders;
create policy users_own_special_orders on public.special_orders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (customer_id is null or exists (
      select 1 from public.customers c
      where c.id = customer_id and c.user_id = (select auth.uid())
    ))
    and (part_id is null or exists (
      select 1 from public.parts p
      where p.id = part_id and p.user_id = (select auth.uid())
    ))
    and (work_order_id is null or exists (
      select 1 from public.work_orders wo
      where wo.id = work_order_id and wo.user_id = (select auth.uid())
    ))
  );

revoke all on public.special_orders from anon;
grant select, insert, update, delete on public.special_orders to authenticated;
notify pgrst, 'reload schema';
