-- Classify service work without changing customer-pay financial calculations.
-- PDI and rigging are the existing explicit internal-work identifiers, so only
-- those legacy orders are backfilled as Internal. Other legacy WOs remain Customer.
alter table public.work_orders
  add column if not exists work_order_type text not null default 'customer';

update public.work_orders
set work_order_type = 'internal'
where internal_type is not null
  and work_order_type is distinct from 'internal';

alter table public.work_orders
  drop constraint if exists work_orders_work_order_type_check;
alter table public.work_orders
  add constraint work_orders_work_order_type_check
  check (work_order_type in ('customer', 'warranty', 'internal'));

create or replace function public.enforce_work_order_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.work_order_type is null then
    new.work_order_type := 'customer';
  end if;

  -- Preserve all existing PDI and rigging dispatch functions without changing
  -- their signatures or letting those unit-cost orders become customer-pay.
  if new.internal_type is not null then
    new.work_order_type := 'internal';
  end if;

  if tg_op = 'UPDATE'
    and new.work_order_type is distinct from old.work_order_type
    and exists (
      select 1 from public.invoices i where i.work_order_id = old.id
    ) then
    raise exception 'A work order type cannot change after an invoice has been issued';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_work_order_type on public.work_orders;
create trigger enforce_work_order_type
before insert or update of work_order_type, internal_type on public.work_orders
for each row execute function public.enforce_work_order_type();

-- Warranty and generic Internal WOs retain their line-item values and totals,
-- but cannot enter the customer-pay invoice flow. PDI and rigging remain covered.
create or replace function public.guard_internal_invoice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.work_order_id is not null and exists (
    select 1
    from public.work_orders w
    where w.id = new.work_order_id
      and coalesce(w.work_order_type, 'customer') <> 'customer'
  ) then
    raise exception 'Only Customer work orders can be customer invoiced';
  end if;
  return new;
end;
$$;

-- work_items.quantity is already numeric(10,2), so the database preserves
-- hundredth-hour inputs such as 0.82 without a type conversion or backfill.
