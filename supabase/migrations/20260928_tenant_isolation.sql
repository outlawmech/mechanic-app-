-- Attribute legacy null-owner rows only when their related records identify
-- exactly one account. Unattributed rows remain in the database but become
-- invisible to app accounts; do not guess an owner for orphan seed rows.
with candidates as (
  select customer_id, user_id from public.work_orders where user_id is not null
  union all
  select customer_id, user_id from public.invoices where user_id is not null
), unique_owner as (
  select customer_id, min(user_id::text)::uuid as owner_id
  from candidates group by customer_id having count(distinct user_id) = 1
)
update public.customers c set user_id = o.owner_id
from unique_owner o where c.id = o.customer_id and c.user_id is null;

update public.vehicles v set user_id = c.user_id
from public.customers c
where v.customer_id = c.id and v.user_id is null and c.user_id is not null;

with candidates as (
  select w.id as work_order_id, w.user_id as owner_id
  from public.work_orders w where w.user_id is not null
  union all
  select work_order_id, user_id from public.invoices
  where work_order_id is not null and user_id is not null
), unique_owner as (
  select work_order_id, min(owner_id::text)::uuid as owner_id
  from candidates group by work_order_id having count(distinct owner_id) = 1
)
update public.work_orders w set user_id = o.owner_id
from unique_owner o where w.id = o.work_order_id and w.user_id is null;

update public.work_orders w set user_id = c.user_id
from public.customers c
where w.customer_id = c.id and w.user_id is null and c.user_id is not null
  and not exists (
    select 1 from public.invoices i
    where i.work_order_id = w.id and i.user_id is not null
      and i.user_id <> c.user_id
  );

-- The invoice lock intentionally blocks ordinary edits. Temporarily suspend
-- only that trigger while attributing old rows; no prices or quantities change.
alter table public.work_items disable trigger lock_work_items_after_invoice;
update public.work_items wi set user_id = w.user_id
from public.work_orders w
where wi.work_order_id = w.id and wi.user_id is null and w.user_id is not null;
alter table public.work_items enable trigger lock_work_items_after_invoice;

update public.invoices i set user_id = c.user_id
from public.customers c
where i.customer_id = c.id and i.user_id is null and c.user_id is not null;

with unique_owner as (
  select part_id, min(user_id::text)::uuid as owner_id
  from public.work_items
  where part_id is not null and user_id is not null
  group by part_id having count(distinct user_id) = 1
)
update public.parts p set user_id = o.owner_id
from unique_owner o where p.id = o.part_id and p.user_id is null;

-- Remove permissive legacy policies.

drop policy if exists anon_all_customers on public.customers;
drop policy if exists anon_all_vehicles on public.vehicles;
drop policy if exists anon_all_work_orders on public.work_orders;
drop policy if exists anon_all_work_items on public.work_items;
drop policy if exists anon_all_invoices on public.invoices;
drop policy if exists anon_all_shop_settings on public.shop_settings;

drop policy if exists users_own_customers on public.customers;
create policy users_own_customers on public.customers for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists users_own_vehicles on public.vehicles;
create policy users_own_vehicles on public.vehicles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.user_id = (select auth.uid())
  ));

drop policy if exists users_own_parts on public.parts;
create policy users_own_parts on public.parts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists users_own_work_orders on public.work_orders;
create policy users_own_work_orders on public.work_orders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.user_id = (select auth.uid())
  ) and (vehicle_id is null or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_id and v.customer_id = customer_id
      and v.user_id = (select auth.uid())
  )));

drop policy if exists users_own_work_items on public.work_items;
create policy users_own_work_items on public.work_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and wo.user_id = (select auth.uid())
  ));

drop policy if exists users_own_invoices on public.invoices;
create policy users_own_invoices on public.invoices for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.user_id = (select auth.uid())
  ) and (work_order_id is null or exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and wo.user_id = (select auth.uid())
  )));

drop policy if exists users_own_shop_settings on public.shop_settings;
create policy users_own_shop_settings on public.shop_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists users_own_dealership_units on public.dealership_units;
create policy users_own_dealership_units on public.dealership_units for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (sold_to_customer_id is null or exists (
    select 1 from public.customers c
    where c.id = sold_to_customer_id and c.user_id = (select auth.uid())
  )));

drop policy if exists users_own_buyers_orders on public.buyers_orders;
create policy users_own_buyers_orders on public.buyers_orders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.user_id = (select auth.uid())
  ) and (unit_id is null or exists (
    select 1 from public.dealership_units u
    where u.id = unit_id and u.user_id = (select auth.uid())
  )));

drop policy if exists "Users can delete own photos" on public.work_order_photos;
drop policy if exists "Users can insert own photos" on public.work_order_photos;
drop policy if exists "Users can update own photos" on public.work_order_photos;
drop policy if exists "Users can view own photos" on public.work_order_photos;
create policy users_own_work_order_photos on public.work_order_photos for all to authenticated
  using ((select auth.uid()) = user_id and exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and wo.user_id = (select auth.uid())
  ))
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.work_orders wo
    where wo.id = work_order_id and wo.user_id = (select auth.uid())
  ));

drop policy if exists anyone_can_read_activation_codes on public.activation_codes;

revoke all on public.customers, public.vehicles, public.parts,
  public.work_orders, public.work_items, public.invoices,
  public.shop_settings, public.dealership_units, public.buyers_orders,
  public.work_order_photos, public.activation_codes from anon;
revoke all on public.activation_codes from authenticated;
revoke all on public.code_redemptions from anon;
revoke truncate, trigger, references, update, delete on public.code_redemptions from authenticated;
revoke truncate, trigger, references on public.customers, public.vehicles,
  public.parts, public.work_orders, public.work_items, public.invoices,
  public.shop_settings, public.dealership_units, public.buyers_orders,
  public.work_order_photos from authenticated;
grant select, insert, update, delete on public.customers, public.vehicles,
  public.parts, public.work_orders, public.work_items, public.invoices,
  public.shop_settings, public.dealership_units, public.buyers_orders,
  public.work_order_photos to authenticated;

-- This is a trigger, not a client RPC. Trigger execution does not need a
-- direct API EXECUTE grant.
revoke all on function public.reject_work_item_changes_after_invoice() from anon, authenticated;
notify pgrst, 'reload schema';
