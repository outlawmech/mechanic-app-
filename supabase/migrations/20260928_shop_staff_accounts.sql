-- One Auth login per person; legacy user_id remains the shop owner's ID.
-- Apply before deploying the staff UI. No existing data is reassigned.
create table if not exists public.shop_members (
  member_id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  role text not null check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  check (role <> 'owner' or member_id = shop_id)
);
create index if not exists shop_members_shop_id_idx on public.shop_members(shop_id);
alter table public.shop_members enable row level security;
revoke all on public.shop_members from anon, authenticated;
grant select on public.shop_members to authenticated;
create policy shop_members_read on public.shop_members for select to authenticated
  using (member_id = (select auth.uid()) or shop_id = (select auth.uid()));

-- Every existing account owns its existing records; do not merge shops.
insert into public.shop_members(member_id,shop_id,display_name,role)
select s.user_id,s.user_id,coalesce(nullif(split_part(u.email,'@',1),''),'Shop owner'),'owner'
from public.shop_settings s join auth.users u on u.id=s.user_id where s.user_id is not null
on conflict (member_id) do nothing;

create table if not exists public.shop_invites (
  token uuid primary key default gen_random_uuid(),
  shop_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  expires_at timestamptz not null default now() + interval '7 days',
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.shop_invites enable row level security;
revoke all on public.shop_invites from anon, authenticated;
grant select on public.shop_invites to authenticated;
create policy shop_invites_owner_read on public.shop_invites for select to authenticated
  using (shop_id = (select auth.uid()));

-- Only these narrowly scoped functions may issue and redeem invites.
create or replace function public.create_shop_invite(p_email text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid; v_owner uuid := auth.uid();
begin
  if v_owner is not null then
    insert into public.shop_members(member_id,shop_id,display_name,role)
    select v_owner,v_owner,coalesce(nullif(trim(shop_name),''),'Shop owner'),'owner'
    from public.shop_settings where user_id=v_owner
    on conflict(member_id) do nothing;
  end if;
  if v_owner is null or not exists (select 1 from public.shop_members
      where member_id=v_owner and shop_id=v_owner and role='owner') then
    raise exception 'Only a shop owner can invite staff.';
  end if;
  if not exists (select 1 from public.shop_settings where user_id=v_owner
      and enable_dealership_mode=true and subscription_status in ('active','lifetime')) then
    raise exception 'An active dealership plan is required for staff accounts.';
  end if;
  if p_email is null or position('@' in p_email)=0 or length(trim(p_name)) not between 1 and 100 then
    raise exception 'Enter a valid email and staff name.';
  end if;
  insert into public.shop_invites(shop_id,email,display_name)
  values(v_owner,lower(trim(p_email)),trim(p_name)) returning token into v_token;
  return v_token;
end $$;
create or replace function public.set_shop_member_name(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or length(trim(coalesce(p_name,''))) not between 1 and 100 then
    raise exception 'Enter your name.';
  end if;
  update public.shop_members set display_name=trim(p_name) where member_id=auth.uid();
  if not found then raise exception 'Shop membership not found.'; end if;
end $$;

create or replace function public.redeem_shop_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invite public.shop_invites%rowtype; v_user uuid := auth.uid(); v_email text;
begin
  if v_user is null then raise exception 'Sign in first.'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_invite from public.shop_invites where token=p_token for update;
  if not found or v_invite.expires_at < now() or v_invite.redeemed_by is not null
     or v_invite.email <> v_email then
    raise exception 'Invite is invalid, expired, or addressed to a different email.';
  end if;
  if exists(select 1 from public.shop_members where member_id=v_user) then
    raise exception 'This login already belongs to a shop.';
  end if;
  insert into public.shop_members(member_id,shop_id,display_name,role)
  values(v_user,v_invite.shop_id,v_invite.display_name,'staff');
  update public.shop_invites set redeemed_by=v_user,redeemed_at=now() where token=p_token;
  return v_invite.shop_id;
end $$;

create or replace function public.remove_shop_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_member_id=auth.uid() or not exists(
    select 1 from public.shop_members where member_id=auth.uid() and shop_id=auth.uid() and role='owner') then
    raise exception 'Only the shop owner can remove staff.';
  end if;
  delete from public.shop_members where member_id=p_member_id and shop_id=auth.uid() and role='staff';
end $$;
revoke all on function public.create_shop_invite(text,text) from public,anon;
revoke all on function public.redeem_shop_invite(uuid) from public,anon;
revoke all on function public.remove_shop_member(uuid) from public,anon;
revoke all on function public.set_shop_member_name(text) from public,anon;
grant execute on function public.create_shop_invite(text,text),public.redeem_shop_invite(uuid),public.remove_shop_member(uuid),public.set_shop_member_name(text) to authenticated;

-- Membership is read from the protected table, never from user-editable metadata.
create schema if not exists private;
create or replace function private.can_access_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_shop is not null and (
    p_shop = auth.uid() or exists(select 1 from public.shop_members m
      where m.member_id=auth.uid() and m.shop_id=p_shop));
$$;
revoke all on function private.can_access_shop(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_shop(uuid) to authenticated;

-- Preserve parent ownership checks when expanding access to staff.
drop policy if exists users_own_customers on public.customers;
create policy shop_customers on public.customers for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id));
drop policy if exists users_own_parts on public.parts;
create policy shop_parts on public.parts for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id));
drop policy if exists users_own_vehicles on public.vehicles;
create policy shop_vehicles on public.vehicles for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id) and exists(
    select 1 from public.customers c where c.id=customer_id and c.user_id=vehicles.user_id));
drop policy if exists users_own_work_orders on public.work_orders;
create policy shop_work_orders on public.work_orders for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id) and exists(
    select 1 from public.customers c where c.id=customer_id and c.user_id=work_orders.user_id)
    and (vehicle_id is null or exists(select 1 from public.vehicles v
      where v.id=vehicle_id and v.user_id=work_orders.user_id and v.customer_id=work_orders.customer_id)));
drop policy if exists users_own_work_items on public.work_items;
create policy shop_work_items on public.work_items for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id) and exists(
    select 1 from public.work_orders w where w.id=work_order_id and w.user_id=work_items.user_id));
drop policy if exists users_own_work_order_photos on public.work_order_photos;
create policy shop_work_order_photos on public.work_order_photos for all to authenticated
  using (private.can_access_shop(user_id) and exists(
    select 1 from public.work_orders w where w.id=work_order_id and w.user_id=work_order_photos.user_id))
  with check (private.can_access_shop(user_id) and exists(
    select 1 from public.work_orders w where w.id=work_order_id and w.user_id=work_order_photos.user_id));
drop policy if exists users_own_invoices on public.invoices;
create policy shop_invoices on public.invoices for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id) and exists(
    select 1 from public.customers c where c.id=customer_id and c.user_id=invoices.user_id)
    and (work_order_id is null or exists(select 1 from public.work_orders w
      where w.id=work_order_id and w.user_id=invoices.user_id)));
drop policy if exists users_own_dealership_units on public.dealership_units;
create policy shop_dealership_units on public.dealership_units for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id)
    and (sold_to_customer_id is null or exists(select 1 from public.customers c
      where c.id=sold_to_customer_id and c.user_id=dealership_units.user_id)));
drop policy if exists users_own_buyers_orders on public.buyers_orders;
create policy shop_buyers_orders on public.buyers_orders for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id) and exists(
    select 1 from public.customers c where c.id=customer_id and c.user_id=buyers_orders.user_id)
    and (unit_id is null or exists(select 1 from public.dealership_units u
      where u.id=unit_id and u.user_id=buyers_orders.user_id)));
drop policy if exists users_own_special_orders on public.special_orders;
create policy shop_special_orders on public.special_orders for all to authenticated
  using (private.can_access_shop(user_id)) with check (private.can_access_shop(user_id)
    and (customer_id is null or exists(select 1 from public.customers c where c.id=customer_id and c.user_id=special_orders.user_id))
    and (part_id is null or exists(select 1 from public.parts p where p.id=part_id and p.user_id=special_orders.user_id))
    and (work_order_id is null or exists(select 1 from public.work_orders w where w.id=work_order_id and w.user_id=special_orders.user_id)));
drop policy if exists internal_ro_costs_read on public.internal_ro_costs;
create policy shop_internal_costs_read on public.internal_ro_costs for select to authenticated
  using (private.can_access_shop(user_id));
drop policy if exists users_own_shop_settings on public.shop_settings;
create policy shop_settings_read on public.shop_settings for select to authenticated
  using (private.can_access_shop(user_id));
create policy shop_settings_owner_insert on public.shop_settings for insert to authenticated
  with check (user_id=(select auth.uid()) and id=(select auth.uid())::text);
create policy shop_settings_owner_update on public.shop_settings for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Staff-created records belong to the existing shop owner, even when old client
-- code supplies the signing-in user's ID or relies on auth.uid() defaults.
create or replace function private.assign_shop_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_shop uuid;
begin
  if auth.uid() is null then return new; end if;
  select shop_id into v_shop from public.shop_members where member_id=auth.uid();
  if v_shop is null then return new; end if;
  if new.user_id is null or new.user_id=auth.uid() then new.user_id := v_shop; end if;
  return new;
end $$;
do $$
declare v_table text;
begin
  foreach v_table in array array['customers','vehicles','parts','work_orders','work_items',
    'work_order_photos','invoices','dealership_units','buyers_orders','special_orders'] loop
    execute format('create trigger assign_shop_owner_before_insert before insert on public.%I for each row execute function private.assign_shop_owner()',v_table);
  end loop;
end $$;

-- The database stamps the cashier; clients cannot choose their own attribution.
create or replace function private.stamp_invoice_payments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_name text; v_pay jsonb; v_list jsonb := '[]'::jsonb;
begin
  if v_actor is null or new.payments is not distinct from old.payments then return new; end if;
  select display_name into v_name from public.shop_members
    where member_id=v_actor and shop_id=new.user_id;
  if v_name is null then
    select coalesce(nullif(split_part(email,'@',1),''),'Shop owner') into v_name from auth.users where id=v_actor;
  end if;
  for v_pay in select value from jsonb_array_elements(coalesce(new.payments,'[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(old.payments,'[]'::jsonb)) p
                  where p->>'id'=v_pay->>'id') then
      v_pay := v_pay || jsonb_build_object('cashier_user_id',v_actor,'cashier_name',v_name);
    else
      -- Preserve the original cashier on edits to existing entries.
      select (v_pay - 'cashier_user_id' - 'cashier_name') ||
        jsonb_strip_nulls(jsonb_build_object('cashier_user_id',p->'cashier_user_id','cashier_name',p->'cashier_name')) into v_pay
      from jsonb_array_elements(coalesce(old.payments,'[]'::jsonb)) p
      where p->>'id'=v_pay->>'id' limit 1;
    end if;
    v_list := v_list || jsonb_build_array(v_pay);
  end loop;
  new.payments := v_list;
  return new;
end $$;
create trigger stamp_invoice_payments_before_update before update of payments on public.invoices
for each row execute function private.stamp_invoice_payments();

create table if not exists public.invoice_payment_events (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  shop_id uuid not null references auth.users(id),
  payment_id text not null,
  action text not null check(action in ('recorded','removed')),
  actor_id uuid references auth.users(id),
  actor_name text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists invoice_payment_events_shop_id_idx on public.invoice_payment_events(shop_id,occurred_at);
alter table public.invoice_payment_events enable row level security;
revoke all on public.invoice_payment_events from anon,authenticated;
grant select on public.invoice_payment_events to authenticated;
create policy shop_payment_events_read on public.invoice_payment_events for select to authenticated
  using (private.can_access_shop(shop_id));
create or replace function private.audit_invoice_payments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_payment jsonb; v_name text;
begin
  if new.payments is not distinct from old.payments then return new; end if;
  select display_name into v_name from public.shop_members where member_id=auth.uid() and shop_id=new.user_id;
  v_name := coalesce(v_name,'Shop owner');
  for v_payment in select value from jsonb_array_elements(coalesce(new.payments,'[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(old.payments,'[]'::jsonb)) p where p->>'id'=v_payment->>'id') then
      insert into public.invoice_payment_events(invoice_id,shop_id,payment_id,action,actor_id,actor_name)
      values(new.id,new.user_id,v_payment->>'id','recorded',auth.uid(),v_name);
    end if;
  end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(old.payments,'[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(new.payments,'[]'::jsonb)) p where p->>'id'=v_payment->>'id') then
      insert into public.invoice_payment_events(invoice_id,shop_id,payment_id,action,actor_id,actor_name)
      values(new.id,new.user_id,v_payment->>'id','removed',auth.uid(),v_name);
    end if;
  end loop;
  return new;
end $$;
create trigger audit_invoice_payments_after_update after update of payments on public.invoices
for each row execute function private.audit_invoice_payments();
notify pgrst,'reload schema';

-- Internal work RPCs use the shared shop owner ID for staff callers.
create or replace function public.close_internal_ro(p_work_order_id uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := coalesce((select shop_id from public.shop_members where member_id=auth.uid()),auth.uid());
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
  v_owner uuid := coalesce((select shop_id from public.shop_members where member_id=auth.uid()),auth.uid());
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
  v_owner uuid := coalesce((select shop_id from public.shop_members where member_id=auth.uid()),auth.uid());
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
-- Immutable attribution for changes throughout the shop. Historical changes
-- before this migration have no actor and are not backfilled.
create table if not exists public.shop_activity (
  id bigint generated always as identity primary key,
  shop_id uuid not null references auth.users(id),
  actor_id uuid references auth.users(id),
  actor_name text not null,
  record_type text not null,
  record_id text not null,
  action text not null check (action in ('created','updated','deleted')),
  happened_at timestamptz not null default now()
);
create index if not exists shop_activity_shop_id_idx on public.shop_activity(shop_id,happened_at desc);
alter table public.shop_activity enable row level security;
revoke all on public.shop_activity from anon,authenticated;
grant select on public.shop_activity to authenticated;
create policy shop_activity_read on public.shop_activity for select to authenticated
  using (private.can_access_shop(shop_id));
create or replace function private.record_shop_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_name text; v_shop uuid; v_id text;
begin
  if v_actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  v_shop := case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_id := case when tg_op='DELETE' then old.id::text else new.id::text end;
  select display_name into v_name from public.shop_members where member_id=v_actor and shop_id=v_shop;
  if v_name is null then
    select coalesce(nullif(split_part(email,'@',1),''),'Shop owner') into v_name from auth.users where id=v_actor;
  end if;
  insert into public.shop_activity(shop_id,actor_id,actor_name,record_type,record_id,action)
  values(v_shop,v_actor,coalesce(v_name,'Shop owner'),tg_table_name,v_id,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$
declare v_table text;
begin
  foreach v_table in array array['customers','vehicles','parts','work_orders','work_items',
    'work_order_photos','invoices','dealership_units','buyers_orders','special_orders','shop_settings'] loop
    execute format('create trigger shop_activity_after_change after insert or update or delete on public.%I for each row execute function private.record_shop_activity()',v_table);
  end loop;
end $$;
notify pgrst,'reload schema';
