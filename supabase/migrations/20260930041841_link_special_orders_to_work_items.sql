-- Give a Special Order a durable link to the exact invoice/WO line that created it.
-- Historical orders remain valid with a null work_item_id and keep work_order_id.
alter table public.special_orders
  add column if not exists work_item_id uuid
  references public.work_items (id) on delete set null;

create unique index if not exists special_orders_work_item_id_uidx
  on public.special_orders (work_item_id)
  where work_item_id is not null;

-- Keep line links inside the same shop and work order under staff access.
drop policy if exists users_own_special_orders on public.special_orders;
drop policy if exists shop_special_orders on public.special_orders;
create policy shop_special_orders on public.special_orders for all to authenticated
  using (private.can_access_shop(user_id))
  with check (
    private.can_access_shop(user_id)
    and (customer_id is null or exists (
      select 1 from public.customers c
      where c.id = special_orders.customer_id and private.can_access_shop(c.user_id)
    ))
    and (part_id is null or exists (
      select 1 from public.parts p
      where p.id = special_orders.part_id and private.can_access_shop(p.user_id)
    ))
    and (work_order_id is null or exists (
      select 1 from public.work_orders w
      where w.id = special_orders.work_order_id and private.can_access_shop(w.user_id)
    ))
    and (work_item_id is null or exists (
      select 1 from public.work_items wi
      where wi.id = special_orders.work_item_id
        and private.can_access_shop(wi.user_id)
        and special_orders.work_order_id is not null
        and wi.work_order_id = special_orders.work_order_id
    ))
  );

notify pgrst, 'reload schema';
