-- Internal service orders are cost transfers, never customer invoices.
alter table public.work_orders
  add column if not exists internal_type text,
  add column if not exists unit_id uuid references public.dealership_units(id) on delete restrict,
  add column if not exists buyer_order_id uuid references public.buyers_orders(id) on delete restrict,
  add column if not exists internal_closed_at timestamptz;

alter table public.work_orders drop constraint if exists work_orders_internal_type_check;
alter table public.work_orders add constraint work_orders_internal_type_check
  check (internal_type is null or internal_type in ('pdi', 'rigging'));
alter table public.work_orders drop constraint if exists work_orders_internal_links_check;
alter table public.work_orders add constraint work_orders_internal_links_check
  check ((internal_type is null and unit_id is null and buyer_order_id is null and internal_closed_at is null)
    or (internal_type is not null and unit_id is not null
      and (internal_type = 'rigging' or buyer_order_id is null)));
create unique index if not exists one_pdi_per_unit on public.work_orders(unit_id)
  where internal_type = 'pdi';
create index if not exists work_orders_internal_unit_idx on public.work_orders(unit_id)
  where internal_type is not null;
create index if not exists work_orders_internal_deal_idx on public.work_orders(buyer_order_id)
  where buyer_order_id is not null;

alter table public.dealership_units
  add column if not exists base_cost_price numeric(12,2),
  add column if not exists internal_cost_total numeric(12,2) not null default 0;
update public.dealership_units set base_cost_price = cost_price where base_cost_price is null;
alter table public.dealership_units alter column base_cost_price set not null;
alter table public.shop_settings
  add column if not exists internal_labor_cost_rate numeric(10,2) not null default 0;

create table if not exists public.internal_ro_costs (
  work_order_id uuid primary key references public.work_orders(id) on delete restrict,
  user_id uuid not null references auth.users(id),
  unit_id uuid not null references public.dealership_units(id) on delete restrict,
  parts_cost numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  detail jsonb not null default '[]'::jsonb,
  posted_at timestamptz not null default now()
);
alter table public.internal_ro_costs enable row level security;
drop policy if exists internal_ro_costs_read on public.internal_ro_costs;
create policy internal_ro_costs_read on public.internal_ro_costs for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.internal_ro_costs from public, anon, authenticated;
grant select on public.internal_ro_costs to authenticated;

-- RLS still applies to the referenced records. Cross-account links are rejected.
create or replace function public.validate_internal_ro()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.internal_type is not null then
    if new.status = 'invoiced' then
      raise exception 'Internal ROs cannot be customer invoiced';
    end if;
    if not exists (select 1 from public.dealership_units u
      where u.id = new.unit_id and u.user_id = new.user_id) then
      raise exception 'Internal RO unit must belong to this account';
    end if;
    if new.buyer_order_id is not null and not exists
      (select 1 from public.buyers_orders b where b.id = new.buyer_order_id
       and b.unit_id = new.unit_id and b.user_id = new.user_id) then
      raise exception 'Rigging deal must match this unit and account';
    end if;
    if new.internal_closed_at is not null and
      not exists (select 1 from public.internal_ro_costs c where c.work_order_id = new.id
        and c.unit_id = new.unit_id and c.user_id = new.user_id) then
      raise exception 'Internal closeout must post costs first';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.internal_closed_at is not null
    and (new.internal_type, new.unit_id, new.buyer_order_id, new.internal_closed_at)
      is distinct from (old.internal_type, old.unit_id, old.buyer_order_id, old.internal_closed_at) then
    raise exception 'Closed internal RO cannot be relinked or reopened; create a correction order';
  end if;
  return new;
end $$;
drop trigger if exists validate_internal_ro_link on public.work_orders;
create trigger validate_internal_ro_link before insert or update on public.work_orders
  for each row execute function public.validate_internal_ro();

create or replace function public.guard_internal_items()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_id uuid;
begin
  target_id := coalesce(new.work_order_id, old.work_order_id);
  if exists (select 1 from public.work_orders w where w.id = target_id
    and w.internal_closed_at is not null) then
    raise exception 'Closed internal RO items are locked; create a correction order';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_internal_items on public.work_items;
create trigger guard_internal_items before insert or update or delete on public.work_items
  for each row execute function public.guard_internal_items();

create or replace function public.guard_internal_invoice()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.work_order_id is not null and exists
    (select 1 from public.work_orders w where w.id = new.work_order_id
      and w.internal_type is not null) then
    raise exception 'Internal work orders cannot be customer invoiced';
  end if;
  return new;
end $$;
drop trigger if exists guard_internal_invoice on public.invoices;
create trigger guard_internal_invoice before insert or update on public.invoices
  for each row execute function public.guard_internal_invoice();

-- All changes, including stock and cost, commit together or not at all.
create or replace function public.close_internal_ro(p_work_order_id uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (select auth.uid());
  v_ro public.work_orders%rowtype;
  v_item public.work_items%rowtype;
  v_part public.parts%rowtype;
  v_parts numeric(12,2) := 0;
  v_labor numeric(12,2) := 0;
  v_labor_rate numeric(10,2) := 0;
  v_detail jsonb := '[]'::jsonb;
  v_cost numeric(12,2);
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  select * into v_ro from public.work_orders where id = p_work_order_id
    and user_id = v_owner for update;
  if not found or v_ro.internal_type is null then raise exception 'Internal RO not found'; end if;
  if v_ro.internal_closed_at is not null then
    select parts_cost + labor_cost into v_cost from public.internal_ro_costs
      where work_order_id = v_ro.id and user_id = v_owner;
    return v_cost;
  end if;
  if v_ro.status <> 'completed' then raise exception 'Complete the RO before closing it'; end if;
  perform 1 from public.dealership_units where id = v_ro.unit_id
    and user_id = v_owner for update;
  if not found then raise exception 'Unit not found'; end if;
  select coalesce(internal_labor_cost_rate, 0) into v_labor_rate
    from public.shop_settings where user_id = v_owner limit 1;
  v_labor_rate := coalesce(v_labor_rate, 0);

  for v_item in select * from public.work_items where work_order_id = v_ro.id
    and user_id = v_owner order by sort_order, id loop
    if v_item.kind = 'part' then
      if v_item.part_id is null then
        raise exception 'Link part line % to stocked inventory before internal closeout', v_item.description;
      end if;
      select * into v_part from public.parts where id = v_item.part_id
        and user_id = v_owner for update;
      if not found then raise exception 'Stocked part not found'; end if;
      if v_part.qty_on_hand < v_item.quantity then
        raise exception 'Insufficient stock for %', v_item.description;
      end if;
      update public.parts set qty_on_hand = qty_on_hand - v_item.quantity
        where id = v_part.id and user_id = v_owner;
      v_cost := round(v_item.quantity * v_part.cost_price, 2);
      v_parts := v_parts + v_cost;
    elsif v_item.kind = 'labor' then
      v_cost := round(v_item.quantity * v_labor_rate, 2);
      v_labor := v_labor + v_cost;
    else
      v_cost := 0;
    end if;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'item_id', v_item.id, 'description', v_item.description,
      'kind', v_item.kind, 'quantity', v_item.quantity, 'cost', v_cost));
  end loop;
  insert into public.internal_ro_costs
    (work_order_id, user_id, unit_id, parts_cost, labor_cost, detail)
    values (v_ro.id, v_owner, v_ro.unit_id, v_parts, v_labor, v_detail);
  update public.dealership_units
    set internal_cost_total = internal_cost_total + v_parts + v_labor,
        cost_price = cost_price + v_parts + v_labor, updated_at = now()
    where id = v_ro.unit_id and user_id = v_owner;
  update public.work_orders set internal_closed_at = now()
    where id = v_ro.id and user_id = v_owner;
  return v_parts + v_labor;
end $$;
revoke all on function public.close_internal_ro(uuid) from public, anon;
grant execute on function public.close_internal_ro(uuid) to authenticated;

-- Atomic PDI dispatch prevents an empty RO when default tasks fail.
create or replace function public.dispatch_unit_pdi(p_unit_id uuid, p_labor_rate numeric)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := (select auth.uid());
  v_unit public.dealership_units%rowtype;
  v_customer uuid;
  v_ro uuid;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  select * into v_unit from public.dealership_units where id = p_unit_id
    and user_id = v_owner for update;
  if not found then raise exception 'Unit not found'; end if;
  select id into v_ro from public.work_orders where unit_id = p_unit_id
    and internal_type = 'pdi' and user_id = v_owner limit 1;
  if v_ro is not null then return v_ro; end if;
  select id into v_customer from public.customers where user_id = v_owner
    and first_name = 'Showroom / Dealership' and last_name = 'Internal Unit' limit 1;
  if v_customer is null then
    insert into public.customers(user_id, first_name, last_name, phone, email, notes)
      values (v_owner, 'Showroom / Dealership', 'Internal Unit', '', '',
        'Internal dealership inventory unit') returning id into v_customer;
  end if;
  insert into public.work_orders(user_id, number, customer_id, unit_id, internal_type,
    status, notes, mileage_or_hours)
  values (v_owner, 'RO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_customer, p_unit_id, 'pdi', 'open',
    'PRE-DELIVERY INSPECTION & ASSEMBLY (PDI)' || chr(10) ||
    'Stock #: ' || v_unit.stock_number || chr(10) ||
    'VIN: ' || v_unit.vin || chr(10) || 'Location: ' || v_unit.location,
    v_unit.mileage_or_hours)
  returning id into v_ro;
  insert into public.work_items(user_id, work_order_id, kind, description,
    quantity, unit_price, sort_order)
  values
    (v_owner, v_ro, 'labor', 'Uncrate, Assemble, Battery Prep & Fluid Fill',
      2, greatest(coalesce(p_labor_rate, 0), 0), 1),
    (v_owner, v_ro, 'labor', 'Safety Inspection, Tire Pressure & Test Run',
      0.5, greatest(coalesce(p_labor_rate, 0), 0), 2);
  return v_ro;
end $$;
revoke all on function public.dispatch_unit_pdi(uuid, numeric) from public, anon;
grant execute on function public.dispatch_unit_pdi(uuid, numeric) to authenticated;

create or replace function public.dispatch_unit_rigging(p_buyer_order_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := (select auth.uid());
  v_deal public.buyers_orders%rowtype;
  v_unit public.dealership_units%rowtype;
  v_customer uuid;
  v_ro uuid;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  select * into v_deal from public.buyers_orders where id = p_buyer_order_id
    and user_id = v_owner;
  if not found or v_deal.unit_id is null then
    raise exception 'Save a deal linked to a showroom unit first';
  end if;
  select * into v_unit from public.dealership_units where id = v_deal.unit_id
    and user_id = v_owner;
  if not found then raise exception 'Unit not found'; end if;
  select id into v_customer from public.customers where user_id = v_owner
    and first_name = 'Showroom / Dealership' and last_name = 'Internal Unit' limit 1;
  if v_customer is null then
    insert into public.customers(user_id, first_name, last_name, phone, email, notes)
      values (v_owner, 'Showroom / Dealership', 'Internal Unit', '', '',
        'Internal dealership inventory unit') returning id into v_customer;
  end if;
  insert into public.work_orders(user_id, number, customer_id, unit_id, buyer_order_id,
    internal_type, status, notes)
  values (v_owner, 'RO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    v_customer, v_unit.id, v_deal.id, 'rigging', 'open',
    'BUYER RIGGING / SOLD UNIT PREP' || chr(10) ||
    'Stock #: ' || v_unit.stock_number || chr(10) ||
    'Buyer''s Order #: ' || v_deal.order_number || chr(10) ||
    'Add requested parts and labor below.')
  returning id into v_ro;
  return v_ro;
end $$;
revoke all on function public.dispatch_unit_rigging(uuid) from public, anon;
grant execute on function public.dispatch_unit_rigging(uuid) to authenticated;
