-- Keep custom Parts Counter unit cost for internal reporting without exposing it
-- on customer invoices. Existing rows default to zero.
alter table public.work_items
  add column if not exists cost_price numeric(12,2) not null default 0 check (cost_price >= 0);

-- A stock PO line must reference a catalog part supplied by that PO's vendor.
-- Special Order lines keep their existing explicit allocation relationship.
drop policy if exists po_stock_supplier_insert_guard on public.purchase_order_lines;
create policy po_stock_supplier_insert_guard on public.purchase_order_lines
  as restrictive for insert to authenticated
  with check (
    special_order_id is not null or exists (
      select 1
      from public.parts p
      join public.purchase_orders po on po.id=purchase_order_lines.purchase_order_id
      where p.id=purchase_order_lines.part_id
        and p.user_id=purchase_order_lines.user_id
        and po.user_id=purchase_order_lines.user_id
        and lower(trim(p.supplier))=lower(trim(po.supplier))
    )
  );

drop policy if exists po_stock_supplier_update_guard on public.purchase_order_lines;
create policy po_stock_supplier_update_guard on public.purchase_order_lines
  as restrictive for update to authenticated
  with check (
    special_order_id is not null or exists (
      select 1
      from public.parts p
      join public.purchase_orders po on po.id=purchase_order_lines.purchase_order_id
      where p.id=purchase_order_lines.part_id
        and p.user_id=purchase_order_lines.user_id
        and po.user_id=purchase_order_lines.user_id
        and lower(trim(p.supplier))=lower(trim(po.supplier))
    )
  );

-- Create (or reuse) the shop's supplier Draft PO. Shop scope and PO numbering
-- stay server-side, and callers can only choose an existing catalog supplier.
create or replace function public.create_draft_purchase_order(p_supplier text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shop uuid;
  v_order_id uuid;
  v_po_number text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a Purchase Order.';
  end if;

  select sm.shop_id into v_shop
  from public.shop_members sm
  where sm.member_id=auth.uid()
  limit 1;
  v_shop := coalesce(v_shop, auth.uid());

  if not private.can_access_shop(v_shop) then
    raise exception 'You cannot access this shop.';
  end if;
  if nullif(trim(p_supplier),'') is null then
    raise exception 'Choose a supplier.';
  end if;
  if not exists (
    select 1 from public.parts p
    where p.user_id=v_shop and lower(trim(p.supplier))=lower(trim(p_supplier))
  ) then
    raise exception 'Choose a supplier used by a catalog part in this shop.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_shop::text),hashtext(lower(trim(p_supplier))));

  select po.id,po.po_number into v_order_id,v_po_number
  from public.purchase_orders po
  where po.user_id=v_shop and po.status='draft'
    and lower(trim(po.supplier))=lower(trim(p_supplier))
  order by po.created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object('id',v_order_id,'po_number',v_po_number,'reused',true);
  end if;

  v_po_number := 'PO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq'::regclass)::text,5,'0');
  insert into public.purchase_orders(user_id,po_number,supplier,status)
  values(v_shop,v_po_number,trim(p_supplier),'draft')
  returning id,po_number into v_order_id,v_po_number;

  return jsonb_build_object('id',v_order_id,'po_number',v_po_number,'reused',false);
end;
$$;

revoke all on function public.create_draft_purchase_order(text) from public,anon;
grant execute on function public.create_draft_purchase_order(text) to authenticated;
grant usage,select on sequence public.purchase_order_number_seq to authenticated;

notify pgrst,'reload schema';
