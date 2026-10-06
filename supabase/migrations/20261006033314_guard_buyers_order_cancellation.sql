begin;

-- UPDATE locks the deal row; dispatch_unit_rigging already takes the same lock.
create function private.guard_buyers_order_cancellation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled'
    and exists (select 1 from public.work_orders w where w.buyer_order_id=old.id
      and w.internal_type is not null and w.status in ('open','in_progress')) then
    raise exception 'This deal has an open rigging Work Order. Complete or otherwise resolve the Work Order before canceling the Buyer’s Order.';
  end if;
  -- Completed work still needs its original relationship for validation/history.
  -- A repair restoring the exact unit retained by every linked WO is permitted.
  if (new.unit_id,new.user_id) is distinct from (old.unit_id,old.user_id)
    and exists (select 1 from public.work_orders w where w.buyer_order_id=old.id
      and w.internal_type is not null
      and (w.unit_id,w.user_id) is distinct from (new.unit_id,new.user_id)) then
    raise exception 'This deal has a linked internal Work Order. Keep its existing unit relationship.';
  end if;
  return new;
end $$;
create trigger a_guard_buyers_order_cancellation before update on public.buyers_orders
for each row execute function private.guard_buyers_order_cancellation();

-- Also serialize direct WO inserts/relinks/reopening against cancellation.
-- Existing canceled legacy relationships may finish their already-open work.
create function private.guard_rigging_deal_state()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_status text; v_new_open boolean;
begin
  if new.buyer_order_id is null or new.internal_type is null then return new; end if;
  select status into v_status from public.buyers_orders where id=new.buyer_order_id for update;
  v_new_open := tg_op='INSERT';
  if tg_op='UPDATE' then
    v_new_open := new.buyer_order_id is distinct from old.buyer_order_id
      or old.internal_type is null or old.status not in ('open','in_progress');
  end if;
  if v_status='canceled' and new.status in ('open','in_progress') and v_new_open then
    raise exception 'A canceled Buyer’s Order cannot start or reopen an internal Work Order.';
  end if;
  return new;
end $$;
create trigger guard_rigging_deal_state before insert or update of buyer_order_id,internal_type,status,unit_id
on public.work_orders for each row execute function private.guard_rigging_deal_state();
revoke all on function private.guard_buyers_order_cancellation() from public,anon;
revoke all on function private.guard_rigging_deal_state() from public,anon;
commit;
