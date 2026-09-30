-- Minimal supplier PO and receiving trail. Customer Special Orders get their
-- own PO line so two customers ordering the same SKU remain separately allocated.

create sequence if not exists public.purchase_order_number_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  po_number text not null,
  supplier text not null,
  status text not null default 'draft'
    check (status in ('draft','ordered','partially_received','received')),
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  closed_at timestamptz,
  freight_total numeric(12,2) not null default 0 check (freight_total >= 0),
  notes text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, po_number)
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  part_id uuid references public.parts(id) on delete set null,
  special_order_id uuid references public.special_orders(id) on delete restrict,
  part_number text not null default '',
  description text not null default '',
  quantity_ordered numeric(12,2) not null check (quantity_ordered > 0),
  quantity_received numeric(12,2) not null default 0 check (quantity_received >= 0),
  expected_unit_cost numeric(12,2) not null default 0 check (expected_unit_cost >= 0),
  created_at timestamptz not null default now(),
  check (quantity_received <= quantity_ordered)
);

create unique index if not exists purchase_order_lines_special_order_uidx
  on public.purchase_order_lines(special_order_id) where special_order_id is not null;
create index if not exists purchase_orders_shop_status_idx on public.purchase_orders(user_id,status,created_at desc);
create unique index if not exists purchase_orders_one_draft_per_supplier_uidx
  on public.purchase_orders(user_id,lower(trim(supplier))) where status='draft';
create index if not exists purchase_order_lines_po_idx on public.purchase_order_lines(purchase_order_id);

create table if not exists public.purchase_order_receipts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  received_at timestamptz not null default now(),
  freight_cost numeric(12,2) not null default 0 check (freight_cost >= 0),
  notes text not null default ''
);

create table if not exists public.purchase_order_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null references public.purchase_order_receipts(id) on delete restrict,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  quantity_received numeric(12,2) not null check (quantity_received > 0),
  expected_unit_cost numeric(12,2) not null default 0 check (expected_unit_cost >= 0),
  actual_unit_cost numeric(12,2) not null check (actual_unit_cost >= 0),
  unique (receipt_id,purchase_order_line_id)
);

alter table public.special_orders
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  add column if not exists quantity_received numeric(12,2) not null default 0 check (quantity_received >= 0);

alter table public.special_orders drop constraint if exists special_orders_quantity_received_check;
alter table public.special_orders add constraint special_orders_quantity_received_check
  check (quantity_received <= quantity);

-- Preserve the existing received state for historical Special Orders.
update public.special_orders
set quantity_received = quantity
where status in ('received','notified','fulfilled') and quantity_received = 0;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_receipts enable row level security;
alter table public.purchase_order_receipt_lines enable row level security;

drop policy if exists shop_purchase_orders on public.purchase_orders;
create policy shop_purchase_orders on public.purchase_orders for all to authenticated
  using (private.can_access_shop(user_id))
  with check (private.can_access_shop(user_id));

drop policy if exists shop_purchase_order_lines on public.purchase_order_lines;
drop policy if exists shop_purchase_order_lines_read on public.purchase_order_lines;
drop policy if exists shop_purchase_order_lines_insert on public.purchase_order_lines;
drop policy if exists shop_purchase_order_lines_update on public.purchase_order_lines;
drop policy if exists shop_purchase_order_lines_delete on public.purchase_order_lines;
create policy shop_purchase_order_lines_read on public.purchase_order_lines for select to authenticated
  using (private.can_access_shop(user_id) and exists (
    select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=purchase_order_lines.user_id
  ));
create policy shop_purchase_order_lines_insert on public.purchase_order_lines for insert to authenticated
  with check (private.can_access_shop(user_id) and exists (
    select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=purchase_order_lines.user_id and po.status='draft'
  ) and (part_id is null or exists (
    select 1 from public.parts p where p.id=part_id and p.user_id=purchase_order_lines.user_id
  )) and (special_order_id is null or exists (
    select 1 from public.special_orders so where so.id=special_order_id and so.user_id=purchase_order_lines.user_id
  )));
create policy shop_purchase_order_lines_update on public.purchase_order_lines for update to authenticated
  using (private.can_access_shop(user_id) and exists (
    select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=purchase_order_lines.user_id and po.status='draft'
  ))
  with check (private.can_access_shop(user_id) and exists (
    select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=purchase_order_lines.user_id and po.status='draft'
  ) and (part_id is null or exists (
    select 1 from public.parts p where p.id=part_id and p.user_id=purchase_order_lines.user_id
  )) and (special_order_id is null or exists (
    select 1 from public.special_orders so where so.id=special_order_id and so.user_id=purchase_order_lines.user_id
  )));
create policy shop_purchase_order_lines_delete on public.purchase_order_lines for delete to authenticated
  using (private.can_access_shop(user_id) and exists (
    select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=purchase_order_lines.user_id and po.status='draft'
  ));

drop policy if exists shop_special_orders on public.special_orders;
create policy shop_special_orders on public.special_orders for all to authenticated
  using (private.can_access_shop(user_id))
  with check (
    private.can_access_shop(user_id)
    and (customer_id is null or exists(select 1 from public.customers c where c.id=customer_id and private.can_access_shop(c.user_id)))
    and (part_id is null or exists(select 1 from public.parts p where p.id=part_id and private.can_access_shop(p.user_id)))
    and (work_order_id is null or exists(select 1 from public.work_orders w where w.id=work_order_id and private.can_access_shop(w.user_id)))
    and (purchase_order_id is null or exists(select 1 from public.purchase_orders po where po.id=purchase_order_id and po.user_id=special_orders.user_id))
  );

drop policy if exists shop_purchase_order_receipts on public.purchase_order_receipts;
create policy shop_purchase_order_receipts on public.purchase_order_receipts for select to authenticated
  using (private.can_access_shop(user_id));

drop policy if exists shop_purchase_order_receipt_lines on public.purchase_order_receipt_lines;
create policy shop_purchase_order_receipt_lines on public.purchase_order_receipt_lines for select to authenticated
  using (private.can_access_shop(user_id));

revoke all on public.purchase_orders, public.purchase_order_lines,
  public.purchase_order_receipts, public.purchase_order_receipt_lines from anon;
grant select, insert, update, delete on public.purchase_orders, public.purchase_order_lines to authenticated;
grant select on public.purchase_order_receipts, public.purchase_order_receipt_lines to authenticated;

-- Add a Special Order to the shop's open PO for its vendor, or create one.
-- Called by a trigger so every creation path (counter, WO, or Parts page) is covered.
create or replace function private.sync_special_order_purchase_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_order_lines%rowtype;
  v_po public.purchase_orders%rowtype;
  v_shop uuid;
  v_number text;
  v_old_po_id uuid;
begin
  v_shop := new.user_id;
  if tg_op = 'UPDATE' then
    select pol.* into v_line
    from public.purchase_order_lines pol
    where pol.special_order_id = new.id;

    if found then
      select po.* into v_po from public.purchase_orders po where po.id=v_line.purchase_order_id for update;
      v_old_po_id := v_po.id;

      if (new.status='canceled' or new.part_id is null or nullif(trim(new.vendor),'') is null)
        and v_po.status='draft' and v_line.quantity_received=0 then
        delete from public.purchase_order_lines where id=v_line.id;
        update public.special_orders set purchase_order_id=null,purchase_order_number='',updated_at=now()
          where id=new.id;
        if not exists(select 1 from public.purchase_order_lines where purchase_order_id=v_po.id) then
          delete from public.purchase_orders where id=v_po.id and status='draft';
        end if;
        return new;
      end if;

      if v_po.status <> 'draft' then
        if new.user_id is distinct from old.user_id
          or new.part_id is distinct from old.part_id
          or new.vendor is distinct from old.vendor
          or new.part_number is distinct from old.part_number
          or new.description is distinct from old.description
          or new.quantity is distinct from old.quantity
          or new.cost_price is distinct from old.cost_price then
          raise exception 'This Special Order is on a supplier PO that has already been ordered. Cancel it and create a new Special Order to change the part or quantity.';
        end if;
        return new;
      end if;

      if new.status in ('received','notified','fulfilled') and new.status is distinct from old.status then
        raise exception 'Receive this Special Order against its Purchase Order so the shipment and inventory stay linked.';
      end if;
    end if;

    if v_line.id is null and new.status not in ('ordered','in_transit') then
      return new;
    end if;
  end if;

  if new.status not in ('ordered','in_transit') or new.part_id is null or nullif(trim(new.vendor),'') is null then
    return new;
  end if;

  if not exists(select 1 from public.parts p where p.id=new.part_id and p.user_id=v_shop) then
    raise exception 'The catalog part must belong to the same shop as the Special Order.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_shop::text),hashtext(lower(trim(new.vendor))));

  select po.* into v_po
  from public.purchase_orders po
  where po.user_id=v_shop and po.status='draft'
    and lower(trim(po.supplier))=lower(trim(new.vendor))
  order by po.created_at desc
  limit 1 for update;

  if not found then
    v_number := 'PO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text,5,'0');
    insert into public.purchase_orders(user_id,po_number,supplier,status)
      values(v_shop,v_number,trim(new.vendor),'draft') returning * into v_po;
  end if;

  if tg_op='UPDATE' and v_line.id is not null then
    update public.purchase_order_lines set
      user_id=v_shop,purchase_order_id=v_po.id,part_id=new.part_id,
      part_number=new.part_number,description=new.description,
      quantity_ordered=new.quantity,expected_unit_cost=new.cost_price
    where id=v_line.id;
    if v_old_po_id is distinct from v_po.id and not exists(select 1 from public.purchase_order_lines where purchase_order_id=v_old_po_id) then
      delete from public.purchase_orders where id=v_old_po_id and status='draft';
    end if;
  else
    insert into public.purchase_order_lines(
      user_id,purchase_order_id,part_id,special_order_id,part_number,description,quantity_ordered,expected_unit_cost
    ) values (
      v_shop,v_po.id,new.part_id,new.id,new.part_number,new.description,new.quantity,new.cost_price
    ) on conflict (special_order_id) where special_order_id is not null do nothing;
  end if;

  update public.special_orders set purchase_order_id=v_po.id,purchase_order_number=v_po.po_number,updated_at=now()
    where id=new.id;
  return new;
end $$;

drop trigger if exists special_orders_sync_purchase_order on public.special_orders;
create trigger special_orders_sync_purchase_order
after insert or update of user_id,part_id,vendor,part_number,description,quantity,cost_price,status
on public.special_orders for each row execute function private.sync_special_order_purchase_order();

-- Idempotent receipt API: each receipt has a caller-created UUID; retrying the
-- same request returns the existing receipt without changing stock twice.
create or replace function public.receive_purchase_order(
  p_receipt_id uuid,
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_freight_cost numeric default 0,
  p_holding_bin text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_shop uuid;
  v_po public.purchase_orders%rowtype;
  v_line public.purchase_order_lines%rowtype;
  v_so public.special_orders%rowtype;
  v_receipt public.purchase_order_receipts%rowtype;
  v_item jsonb;
  v_qty numeric;
  v_cost numeric;
  v_total_lines integer;
  v_receipt_lines integer := 0;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in before receiving a PO.'; end if;
  select sm.shop_id into v_shop from public.shop_members sm where sm.member_id=auth.uid();
  v_shop := coalesce(v_shop,auth.uid());
  if not private.can_access_shop(v_shop) then raise exception 'You cannot access this shop.'; end if;

  select * into v_receipt from public.purchase_order_receipts where id=p_receipt_id;
  if found then
    if v_receipt.user_id<>v_shop or v_receipt.purchase_order_id<>p_purchase_order_id then
      raise exception 'Receipt ID is already in use by another shop or PO.';
    end if;
    return jsonb_build_object('duplicate',true,'receipt_id',p_receipt_id);
  end if;

  select * into v_po from public.purchase_orders where id=p_purchase_order_id and user_id=v_shop for update;
  if not found then raise exception 'Purchase Order not found in this shop.'; end if;
  if v_po.status not in ('ordered','partially_received') then
    raise exception 'Mark this PO Ordered before receiving it.';
  end if;
  if coalesce(p_freight_cost,0)<0 then raise exception 'Freight cannot be negative.'; end if;
  if jsonb_typeof(p_lines)<>'array' then raise exception 'Receipt lines are required.'; end if;
  if (select count(*) from jsonb_array_elements(p_lines)) <>
     (select count(distinct value->>'line_id') from jsonb_array_elements(p_lines)) then
    raise exception 'A PO line can only appear once on a receipt.';
  end if;

  insert into public.purchase_order_receipts(id,user_id,purchase_order_id,freight_cost)
    values(p_receipt_id,v_shop,p_purchase_order_id,coalesce(p_freight_cost,0))
    on conflict (id) do nothing returning * into v_receipt;
  if not found then
    select * into v_receipt from public.purchase_order_receipts where id=p_receipt_id;
    if v_receipt.user_id<>v_shop or v_receipt.purchase_order_id<>p_purchase_order_id then
      raise exception 'Receipt ID is already in use by another shop or PO.';
    end if;
    return jsonb_build_object('duplicate',true,'receipt_id',p_receipt_id);
  end if;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    if v_qty=0 then continue; end if;
    if v_qty<0 then raise exception 'Received quantities cannot be negative.'; end if;
    v_cost := coalesce((v_item->>'actual_unit_cost')::numeric,0);
    if v_cost<0 then raise exception 'Actual unit cost cannot be negative.'; end if;

    select pol.* into v_line from public.purchase_order_lines pol
      where pol.id=(v_item->>'line_id')::uuid and pol.purchase_order_id=v_po.id and pol.user_id=v_shop for update;
    if not found then raise exception 'A receipt line does not belong to this PO.'; end if;
    if v_qty > v_line.quantity_ordered-v_line.quantity_received then
      raise exception 'Received quantity exceeds the outstanding quantity for %.',v_line.part_number;
    end if;
    if v_line.part_id is null then raise exception 'Link % to a catalog part before receiving it.',v_line.part_number; end if;

    insert into public.purchase_order_receipt_lines(
      user_id,receipt_id,purchase_order_line_id,quantity_received,expected_unit_cost,actual_unit_cost
    ) values(v_shop,p_receipt_id,v_line.id,v_qty,v_line.expected_unit_cost,v_cost);
    v_receipt_lines := v_receipt_lines+1;

    update public.purchase_order_lines set quantity_received=quantity_received+v_qty where id=v_line.id;

    update public.parts set cost_price=v_cost,updated_at=now()
      where id=v_line.part_id and user_id=v_shop;
    if not found then raise exception 'Catalog part is no longer available in this shop.'; end if;

    if v_line.special_order_id is not null then
      select * into v_so from public.special_orders where id=v_line.special_order_id and user_id=v_shop for update;
      if not found then raise exception 'Customer Special Order link is missing.'; end if;
      if v_so.status='canceled' then
        -- An already placed order still arrives; after cancellation it becomes free stock.
        update public.parts set qty_on_hand=qty_on_hand+v_qty,updated_at=now() where id=v_line.part_id and user_id=v_shop;
      else
        update public.special_orders set
          quantity_received=quantity_received+v_qty,
          status=case
            when quantity_received+v_qty>=quantity then 'received'
            else 'in_transit'
          end,
          received_at=case when quantity_received+v_qty>=quantity then coalesce(received_at,now()) else received_at end,
          holding_bin=coalesce(nullif(trim(p_holding_bin),''),nullif(holding_bin,''),'Parts Counter Holding Rack'),
          updated_at=now()
        where id=v_so.id;
      end if;
    else
      update public.parts set qty_on_hand=qty_on_hand+v_qty,updated_at=now() where id=v_line.part_id and user_id=v_shop;
    end if;
  end loop;

  if v_receipt_lines=0 and coalesce(p_freight_cost,0)=0 then
    raise exception 'Enter a received quantity or freight amount.';
  end if;

  update public.purchase_orders set freight_total=freight_total+coalesce(p_freight_cost,0),updated_at=now()
    where id=v_po.id;
  select count(*) into v_total_lines from public.purchase_order_lines where purchase_order_id=v_po.id;
  if v_total_lines=0 then raise exception 'This PO has no lines.'; end if;
  if exists(select 1 from public.purchase_order_lines where purchase_order_id=v_po.id and quantity_received<quantity_ordered) then
    v_status := 'partially_received';
  else
    v_status := 'received';
  end if;
  update public.purchase_orders set status=v_status,closed_at=case when v_status='received' then now() else null end,updated_at=now()
    where id=v_po.id;

  return jsonb_build_object('duplicate',false,'receipt_id',p_receipt_id,'status',v_status,'receipt_lines',v_receipt_lines);
end $$;

revoke all on function public.receive_purchase_order(uuid,uuid,jsonb,numeric,text) from public,anon;
grant execute on function public.receive_purchase_order(uuid,uuid,jsonb,numeric,text) to authenticated;

notify pgrst,'reload schema';
