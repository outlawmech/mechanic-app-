begin;

-- Change the fallback for future rows only; never rewrite dealership/user email data.
alter table public.shop_settings alter column email set default 'outlawshopsystems@gmail.com';
alter table public.shop_settings add column if not exists sales_disclaimer text not null default '';
alter table public.buyers_orders
  add column if not exists sales_disclaimer text not null default '',
  add column if not exists rigging_instructions text not null default '',
  add column if not exists document_identity jsonb;

-- Existing conflicts must be reviewed, never silently canceled/reclassified.
create unique index buyers_orders_one_open_unit
  on public.buyers_orders(unit_id) where unit_id is not null and status in ('quote', 'pending');

create or replace function private.guard_buyers_order_document()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_settings public.shop_settings%rowtype; v_customer public.customers%rowtype;
  v_unit public.dealership_units%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (old.status = 'completed' or coalesce(old.signature_url,'')<>'')
      and (to_jsonb(new) - 'updated_at' - 'status') is distinct from (to_jsonb(old) - 'updated_at' - 'status') then
      raise exception 'Completed or signed Buyer’s Orders retain their saved transaction data';
    end if;
    if old.status='completed' and new.status is distinct from old.status then
      raise exception 'Completed Buyer’s Orders retain their completed status';
    end if;
    -- Settings changes never rewrite an existing order's terms.
    new.sales_disclaimer := old.sales_disclaimer;
    new.document_identity := old.document_identity;
  end if;
  if new.unit_id is not null then
    select * into v_unit from public.dealership_units where id=new.unit_id and user_id=new.user_id for update;
    if not found then raise exception 'Showroom unit not found'; end if;
    if (tg_op = 'INSERT' or new.unit_id is distinct from old.unit_id)
      and (v_unit.status='sold' or exists (
        select 1 from public.buyers_orders b where b.unit_id=new.unit_id and b.id<>new.id and b.status='completed'
      )) then
      raise exception 'This showroom unit is already sold';
    end if;
    if new.status in ('quote','pending','completed') and exists (
      select 1 from public.buyers_orders b where b.unit_id=new.unit_id and b.id<>new.id and b.status in ('quote','pending')
    ) then raise exception 'This unit already has an open Buyer’s Order.' using errcode='23505'; end if;
  end if;
  if tg_op='INSERT' then
    select * into v_settings from public.shop_settings where user_id=new.user_id limit 1;
    new.sales_disclaimer := coalesce(v_settings.sales_disclaimer,'');
  end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and old.status<>'completed' and coalesce(old.signature_url,'')=''
    and (new.customer_id is distinct from old.customer_id or new.unit_id is distinct from old.unit_id
      or old.document_identity is null)) then
    select * into v_customer from public.customers where id=new.customer_id and user_id=new.user_id;
    if not found then raise exception 'Buyer not found'; end if;
    select * into v_settings from public.shop_settings where user_id=new.user_id limit 1;
    new.document_identity := jsonb_build_object('shop_name',coalesce(v_settings.shop_name,''),
      'buyer_name',trim(coalesce(v_customer.first_name,'') || ' ' || coalesce(v_customer.last_name,'')),
      'buyer_address',coalesce(v_customer.address,''),'buyer_phone',coalesce(v_customer.phone,''),
      'stock_number',coalesce(v_unit.stock_number,''));
  end if;
  return new;
end $$;
create trigger guard_buyers_order_document before insert or update on public.buyers_orders
for each row execute function private.guard_buyers_order_document();

-- Lock the deal before looking for its existing WO: concurrent dispatch is idempotent.
create or replace function public.dispatch_unit_rigging(p_buyer_order_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid := coalesce((select shop_id from public.shop_members where member_id=auth.uid()),auth.uid());
  v_deal public.buyers_orders%rowtype; v_unit public.dealership_units%rowtype;
  v_customer uuid; v_ro uuid;
begin
  if v_owner is null then raise exception 'Sign in required'; end if;
  select * into v_deal from public.buyers_orders where id=p_buyer_order_id and user_id=v_owner for update;
  if not found or v_deal.unit_id is null then raise exception 'Save a deal linked to a showroom unit first'; end if;
  select id into v_ro from public.work_orders where buyer_order_id=v_deal.id and internal_type='rigging' order by created_at limit 1;
  if v_ro is not null then return v_ro; end if;
  select * into v_unit from public.dealership_units where id=v_deal.unit_id and user_id=v_owner;
  if not found then raise exception 'Unit not found'; end if;
  select id into v_customer from public.customers where user_id=v_owner
    and first_name='Showroom / Dealership' and last_name='Internal Unit' limit 1;
  if v_customer is null then
    insert into public.customers(user_id,first_name,last_name,phone,email,notes)
    values(v_owner,'Showroom / Dealership','Internal Unit','','','Internal dealership inventory unit') returning id into v_customer;
  end if;
  insert into public.work_orders(user_id,number,customer_id,unit_id,buyer_order_id,internal_type,status,notes)
  values(v_owner,'RO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),v_customer,v_unit.id,v_deal.id,'rigging','open',
    'BUYER RIGGING / SOLD UNIT PREP' || chr(10) || 'Stock #: ' || v_unit.stock_number || chr(10) ||
    'Buyer''s Order #: ' || v_deal.order_number || chr(10) || 'Add requested parts and labor below.' ||
    case when trim(v_deal.rigging_instructions)<>'' then chr(10) || chr(10) || v_deal.rigging_instructions else '' end)
  returning id into v_ro;
  return v_ro;
end $$;
revoke all on function public.dispatch_unit_rigging(uuid) from public, anon;
grant execute on function public.dispatch_unit_rigging(uuid) to authenticated;

commit;
