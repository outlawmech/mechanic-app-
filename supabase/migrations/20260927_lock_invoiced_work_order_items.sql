-- Prevent a repair order's financial line items from changing after an invoice exists.
-- This does not modify existing work items or invoices; it only blocks future INSERT/UPDATE/DELETE operations.

create or replace function public.reject_work_item_changes_after_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    if exists (
      select 1
        from public.invoices
       where work_order_id = old.work_order_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'INVOICED_WORK_ORDER_ITEMS_LOCKED: this repair order already has an issued invoice; create a separate repair order for additional work';
    end if;
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if exists (
      select 1
        from public.invoices
       where work_order_id = new.work_order_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'INVOICED_WORK_ORDER_ITEMS_LOCKED: this repair order already has an issued invoice; create a separate repair order for additional work';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_work_item_changes_after_invoice() from public;
grant execute on function public.reject_work_item_changes_after_invoice() to authenticated;

drop trigger if exists lock_work_items_after_invoice on public.work_items;
create trigger lock_work_items_after_invoice
before insert or update or delete on public.work_items
for each row execute function public.reject_work_item_changes_after_invoice();
