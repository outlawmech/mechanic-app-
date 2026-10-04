-- Organization plans are separate from subscription/activation state.
alter table public.shop_settings
  add column if not exists plan_tier text,
  add column if not exists trial_started_at timestamptz;

-- Preserve current DMS organizations at Dealer. Existing showroom/sales data
-- and staff membership also count as evidence of a DMS organization even if
-- its legacy display flag was later cleared. Other existing accounts remain
-- Solo until their owners deliberately choose a plan in a future flow.
update public.shop_settings s
set plan_tier = case
  when coalesce(s.enable_dealership_mode, false)
    or exists (select 1 from public.dealership_units d where d.user_id = s.user_id)
    or exists (select 1 from public.buyers_orders b where b.user_id = s.user_id)
    or exists (select 1 from public.shop_members m where m.shop_id = s.user_id and m.role = 'staff')
    then 'dealer'
  else 'solo'
end
where s.plan_tier is null;

update public.shop_settings s
set trial_started_at = coalesce(s.trial_ends_at - interval '14 days', u.created_at)
from auth.users u
where s.user_id = u.id
  and s.subscription_status = 'trialing'
  and s.trial_started_at is null;

alter table public.shop_settings alter column plan_tier set default 'solo';
alter table public.shop_settings alter column plan_tier set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shop_settings'::regclass
      and conname = 'shop_settings_plan_tier_check'
  ) then
    alter table public.shop_settings
      add constraint shop_settings_plan_tier_check check (plan_tier in ('solo', 'shop', 'dealer'));
  end if;
end $$;

-- A new account's selected plan, organization, owner membership, and trial are
-- created together, including signups that must confirm email before login.
create or replace function public.provision_oss_shop_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text := coalesce(new.raw_user_meta_data ->> 'plan_tier', 'solo');
  v_shop_name text := nullif(trim(new.raw_user_meta_data ->> 'shop_name'), '');
  v_display_name text;
begin
  if v_tier not in ('solo', 'shop', 'dealer') then
    v_tier := case when new.raw_user_meta_data ->> 'enable_dealership_mode' = 'true'
      then 'dealer' else 'solo' end;
  end if;
  if v_shop_name is null then v_shop_name := 'Outlaw Shop Systems'; end if;
  v_display_name := coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Shop owner');

  perform set_config('oss.allow_entitlement_write', 'true', true);
  insert into public.shop_settings (
    id, user_id, shop_name, tagline, email, plan_tier, enable_dealership_mode,
    subscription_status, trial_started_at, trial_ends_at
  ) values (
    new.id::text, new.id, v_shop_name,
    case when v_tier = 'dealer' then 'Sales, Service & Parts DMS' else 'Mobile & Shop Management' end,
    coalesce(new.email, ''), v_tier, v_tier <> 'solo',
    'trialing', now(), now() + interval '14 days'
  ) on conflict (id) do nothing;

  insert into public.shop_members (member_id, shop_id, display_name, role)
  values (new.id, new.id, v_display_name, 'owner')
  on conflict (member_id) do nothing;

  return new;
end;
$$;

drop trigger if exists provision_oss_shop_after_auth_signup on auth.users;
create trigger provision_oss_shop_after_auth_signup
  after insert on auth.users
  for each row execute function public.provision_oss_shop_signup();

-- Plan and entitlement columns are server-managed. Keep normal profile saves
-- and DMS display flags separate from any paid/lifetime plan grant.
create or replace function private.guard_shop_entitlement_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_at timestamptz;
begin
  if coalesce(current_setting('oss.allow_entitlement_write', true), '') <> 'true'
    and coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'INSERT' then
      if new.user_id is distinct from auth.uid()
        or new.subscription_status is distinct from 'trialing'
        or new.trial_started_at is null
        or new.trial_ends_at is null then
        raise exception 'New organizations may only start with a server-managed trial.';
      end if;
      select u.created_at into v_created_at from auth.users u where u.id = new.user_id;
      if v_created_at is null
        or abs(extract(epoch from (new.trial_started_at - v_created_at))) > 1
        or new.trial_ends_at > v_created_at + interval '14 days' + interval '1 second' then
        raise exception 'Trial dates must match the account’s original signup window.';
      end if;
    elsif tg_op = 'UPDATE' then
    if new.plan_tier is distinct from old.plan_tier
      or new.subscription_status is distinct from old.subscription_status
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_ends_at is distinct from old.trial_ends_at then
      raise exception 'Plan and subscription entitlement fields can only be changed by OSS activation services.';
    end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_shop_entitlement_columns on public.shop_settings;
create trigger guard_shop_entitlement_columns
  before insert or update on public.shop_settings
  for each row execute function private.guard_shop_entitlement_columns();

-- Return the organization's plan and trial start with the shared entitlement.
drop function if exists public.get_shop_entitlement();
create function public.get_shop_entitlement()
returns table (
  shop_id uuid,
  member_role text,
  member_name text,
  subscription_status text,
  plan_tier text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  enable_dealership_mode boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(m.shop_id, actor.member_id),
    coalesce(m.role, 'owner'),
    m.display_name,
    s.subscription_status,
    coalesce(s.plan_tier, case when coalesce(s.enable_dealership_mode, false) then 'dealer' else 'solo' end),
    s.trial_started_at,
    s.trial_ends_at,
    coalesce(s.enable_dealership_mode, false)
  from (select auth.uid() as member_id) actor
  left join public.shop_members m on m.member_id = actor.member_id
  left join public.shop_settings s on s.user_id = coalesce(m.shop_id, actor.member_id)
  where actor.member_id is not null;
$$;
revoke all on function public.get_shop_entitlement() from public, anon;
grant execute on function public.get_shop_entitlement() to authenticated;

-- Existing activation codes keep their current behavior. A Dealer grant can
-- promote a Solo/Shop organization; a Solo grant never downgrades a higher plan.
create or replace function public.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_role text;
  v_code_rec public.activation_codes%rowtype;
  v_tier text;
  v_status text;
  v_message text;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Sign in before redeeming a code.');
  end if;

  select m.shop_id, m.role into v_shop_id, v_role
  from public.shop_members m where m.member_id = v_user_id;
  if not found then v_shop_id := v_user_id; v_role := 'owner'; end if;
  if v_role <> 'owner' or v_shop_id <> v_user_id then
    return jsonb_build_object('success', false, 'error', 'Ask the shop owner to activate this shop’s plan.');
  end if;
  if v_code = '' then
    return jsonb_build_object('success', false, 'error', 'Please enter an activation code.');
  end if;

  if v_code = any(array['OUTLAW-OWNER-KEY','OUTLAW-BOSS-77','OUTLAW-ADMIN-99']) then
    v_tier := 'dealer'; v_status := 'active';
    v_message := 'Master Owner License verified! Full Dealership DMS Suite permanently unlocked.';
  elsif v_code = any(array['VIP-DMS','DEALER-VIP','OUTLAW-DMS-77','DMS-PRO','VIP-DEALER']) then
    v_tier := 'dealer'; v_status := 'active';
    v_message := 'Dealership DMS VIP Code activated! All 6 departments & floorplan tracking unlocked.';
  elsif v_code = any(array['VIP-RIG','SOLO-VIP','OUTLAW-SOLO-77','SOLO-PRO','VIP-SOLO']) then
    v_tier := 'solo'; v_status := 'active';
    v_message := 'Solo Rig VIP Code activated! Mobile mechanic suite unlocked.';
  else
    select * into v_code_rec from public.activation_codes where code = v_code for update;
    if not found or not v_code_rec.is_active then
      return jsonb_build_object('success', false, 'error', 'Invalid or inactive activation code.');
    end if;
    v_tier := v_code_rec.grant_tier;
    v_status := case when v_code_rec.grant_lifetime then 'lifetime' else 'active' end;
    v_message := case when v_code_rec.grant_lifetime then 'Lifetime access activated.' else 'Pro access activated.' end;

    if not exists (select 1 from public.code_redemptions where code = v_code and shop_id = v_shop_id) then
      if v_code_rec.used_count >= v_code_rec.max_uses then
        return jsonb_build_object('success', false, 'error', 'This code has already been used.');
      end if;
      insert into public.code_redemptions(code, user_id, shop_id) values (v_code, v_user_id, v_shop_id);
      update public.activation_codes set used_count = used_count + 1 where code = v_code;
    end if;
  end if;

  perform set_config('oss.allow_entitlement_write', 'true', true);
  update public.shop_settings
  set subscription_status = case
        when subscription_status = 'lifetime' or v_status = 'lifetime' then 'lifetime'
        else v_status
      end,
      plan_tier = case when v_tier = 'dealer' then 'dealer' else plan_tier end,
      enable_dealership_mode = enable_dealership_mode or v_tier = 'dealer',
      updated_at = now()
  where user_id = v_shop_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Could not save the activation to this shop. Reload settings and try again.');
  end if;
  return jsonb_build_object('success', true, 'tier', v_tier, 'message', v_message);
end;
$$;
revoke all on function public.redeem_activation_code(text) from public, anon;
grant execute on function public.redeem_activation_code(text) to authenticated;

-- Shop and Dealer organizations may invite staff while their organization trial
-- is live, or while their paid/lifetime entitlement is active.
create or replace function public.create_shop_invite(p_email text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
  v_owner uuid := auth.uid();
begin
  if v_owner is not null then
    insert into public.shop_members(member_id, shop_id, display_name, role)
    select v_owner, v_owner, coalesce(nullif(trim(shop_name), ''), 'Shop owner'), 'owner'
    from public.shop_settings where user_id = v_owner
    on conflict (member_id) do nothing;
  end if;
  if v_owner is null or not exists (
    select 1 from public.shop_members where member_id = v_owner and shop_id = v_owner and role = 'owner'
  ) then raise exception 'Only a shop owner can invite staff.'; end if;

  if not exists (
    select 1 from public.shop_settings s
    where s.user_id = v_owner
      and s.plan_tier in ('shop', 'dealer')
      and ((s.subscription_status in ('active', 'lifetime'))
        or (s.subscription_status = 'trialing' and s.trial_ends_at > now()))
  ) then raise exception 'An active Shop or Dealer plan is required for staff accounts.'; end if;

  if p_email is null or position('@' in p_email) = 0 or length(trim(p_name)) not between 1 and 100 then
    raise exception 'Enter a valid email and staff name.';
  end if;
  insert into public.shop_invites(shop_id, email, display_name)
  values (v_owner, lower(trim(p_email)), trim(p_name)) returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.redeem_shop_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.shop_invites%rowtype;
  v_user uuid := auth.uid();
  v_email text;
  v_member public.shop_members%rowtype;
  v_table text;
  v_has_records boolean;
begin
  if v_user is null then raise exception 'Sign in first.'; end if;
  select lower(email) into v_email from auth.users where id = v_user;
  select * into v_invite from public.shop_invites where token = p_token for update;
  if not found or v_invite.expires_at < now() or v_invite.redeemed_by is not null or v_invite.email <> v_email then
    raise exception 'Invite is invalid, expired, or addressed to a different email.';
  end if;
  if not exists (
    select 1 from public.shop_settings s
    where s.user_id = v_invite.shop_id
      and s.plan_tier in ('shop', 'dealer')
      and ((s.subscription_status in ('active', 'lifetime'))
        or (s.subscription_status = 'trialing' and s.trial_ends_at > now()))
  ) then raise exception 'The inviting shop needs an entitled Shop or Dealer plan.'; end if;

  select * into v_member from public.shop_members where member_id = v_user for update;
  if found then
    if v_member.role <> 'owner' or v_member.shop_id <> v_user then
      raise exception 'This login already belongs to another shop.';
    end if;
    if exists (select 1 from public.shop_members where shop_id = v_user and member_id <> v_user) then
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
    update public.shop_members set shop_id = v_invite.shop_id, role = 'staff',
      display_name = v_invite.display_name where member_id = v_user;
  else
    insert into public.shop_members(member_id, shop_id, display_name, role)
    values (v_user, v_invite.shop_id, v_invite.display_name, 'staff');
  end if;
  update public.shop_invites set redeemed_by = v_user, redeemed_at = now() where token = p_token;
  return v_invite.shop_id;
end;
$$;

notify pgrst, 'reload schema';
