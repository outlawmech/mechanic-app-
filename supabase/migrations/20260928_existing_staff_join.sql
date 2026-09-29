-- An invited login may join from an unused personal shop without deleting its settings.
-- Shops with any operational records or other members remain separate.
create or replace function public.redeem_shop_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.shop_invites%rowtype;
  v_user uuid := auth.uid();
  v_email text;
  v_member public.shop_members%rowtype;
  v_table text;
  v_has_records boolean;
begin
  if v_user is null then raise exception 'Sign in first.'; end if;
  select lower(email) into v_email from auth.users where id=v_user;
  select * into v_invite from public.shop_invites where token=p_token for update;
  if not found or v_invite.expires_at < now() or v_invite.redeemed_by is not null
     or v_invite.email <> v_email then
    raise exception 'Invite is invalid, expired, or addressed to a different email.';
  end if;
  if not exists (select 1 from public.shop_settings where user_id=v_invite.shop_id
      and enable_dealership_mode=true and subscription_status in ('active','lifetime')) then
    raise exception 'The inviting shop needs an active dealership plan.';
  end if;

  select * into v_member from public.shop_members where member_id=v_user for update;
  if found then
    if v_member.role <> 'owner' or v_member.shop_id <> v_user then
      raise exception 'This login already belongs to another shop.';
    end if;
    if exists (select 1 from public.shop_members where shop_id=v_user and member_id<>v_user) then
      raise exception 'This login owns a shop with staff. Use another login.';
    end if;
    foreach v_table in array array['buyers_orders','customers','dealership_units',
      'internal_ro_costs','invoices','jobs','parts','special_orders','time_entries',
      'vehicles','work_items','work_order_photos','work_orders'] loop
      execute format('select exists(select 1 from public.%I where user_id=$1)', v_table)
        into v_has_records using v_user;
      if v_has_records then
        raise exception 'This login owns a shop with records. Use another login or contact support before joining.';
      end if;
    end loop;
    update public.shop_members set shop_id=v_invite.shop_id, role='staff',
      display_name=v_invite.display_name where member_id=v_user;
  else
    insert into public.shop_members(member_id,shop_id,display_name,role)
    values(v_user,v_invite.shop_id,v_invite.display_name,'staff');
  end if;
  update public.shop_invites set redeemed_by=v_user,redeemed_at=now() where token=p_token;
  return v_invite.shop_id;
end $$;

-- Once a login joins another shop, its dormant personal settings are not a second
-- route into old shop data. The settings remain available if staff access is removed.
create or replace function private.can_access_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_shop is not null and (
    (p_shop = auth.uid() and not exists(select 1 from public.shop_members m
      where m.member_id=auth.uid() and m.shop_id<>auth.uid()))
    or exists(select 1 from public.shop_members m
      where m.member_id=auth.uid() and m.shop_id=p_shop));
$$;

notify pgrst,'reload schema';
