-- Activation belongs to the shop (shop_settings.user_id), not to whichever
-- person happened to enter the code. Keep user_id as the audit actor.
alter table public.code_redemptions
  add column if not exists shop_id uuid references auth.users(id) on delete cascade;

update public.code_redemptions r
set shop_id = coalesce(m.shop_id, r.user_id)
from (select r0.id, sm.shop_id from public.code_redemptions r0
      left join public.shop_members sm on sm.member_id = r0.user_id
        and sm.created_at <= r0.redeemed_at) m
where r.id = m.id and r.shop_id is null;

alter table public.code_redemptions alter column shop_id set not null;
create index if not exists code_redemptions_code_shop_idx
  on public.code_redemptions(code, shop_id);

-- A shop's trial clock is also organization-scoped. Backfill once from the
-- shop owner's account creation time, then default future shops to 14 days.
update public.shop_settings s
set trial_ends_at = coalesce(u.created_at, s.updated_at, now()) + interval '14 days'
from auth.users u
where s.user_id = u.id and s.trial_ends_at is null;

update public.shop_settings s
set trial_ends_at = coalesce(s.updated_at, now()) + interval '14 days'
where s.user_id is null and s.trial_ends_at is null;

alter table public.shop_settings alter column trial_ends_at
  set default (now() + interval '14 days');

-- The signed-in owner may activate the shop. Invited staff inherit the shop's
-- plan through get_shop_entitlement and cannot redeem a second staff license.
create or replace function public.get_shop_entitlement()
returns table (
  shop_id uuid,
  member_role text,
  member_name text,
  subscription_status text,
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
    s.trial_ends_at,
    coalesce(s.enable_dealership_mode, false)
  from (select auth.uid() as member_id) actor
  left join public.shop_members m on m.member_id = actor.member_id
  left join public.shop_settings s on s.user_id = coalesce(m.shop_id, actor.member_id)
  where actor.member_id is not null;
$$;

revoke all on function public.get_shop_entitlement() from public, anon;
grant execute on function public.get_shop_entitlement() to authenticated;

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
  if not found then
    v_shop_id := v_user_id;
    v_role := 'owner';
  end if;
  if v_role <> 'owner' or v_shop_id <> v_user_id then
    return jsonb_build_object('success', false,
      'error', 'Ask the shop owner to activate this shop’s plan.');
  end if;
  if v_code = '' then
    return jsonb_build_object('success', false, 'error', 'Please enter an activation code.');
  end if;

  -- Preserve the existing permanent beta keys, now persisted to the shop row.
  if v_code = any(array['OUTLAW-OWNER-KEY','OUTLAW-BOSS-77','OUTLAW-ADMIN-99']) then
    v_tier := 'dealer';
    v_status := 'active';
    v_message := 'Master Owner License verified! Full Dealership DMS Suite permanently unlocked.';
  elsif v_code = any(array['VIP-DMS','DEALER-VIP','OUTLAW-DMS-77','DMS-PRO','VIP-DEALER']) then
    v_tier := 'dealer';
    v_status := 'active';
    v_message := 'Dealership DMS VIP Code activated! All 6 departments & floorplan tracking unlocked.';
  elsif v_code = any(array['VIP-RIG','SOLO-VIP','OUTLAW-SOLO-77','SOLO-PRO','VIP-SOLO']) then
    v_tier := 'solo';
    v_status := 'active';
    v_message := 'Solo Rig VIP Code activated! Mobile mechanic suite unlocked.';
  else
    select * into v_code_rec from public.activation_codes
    where code = v_code for update;
    if not found or not v_code_rec.is_active then
      return jsonb_build_object('success', false, 'error', 'Invalid or inactive activation code.');
    end if;

    v_tier := v_code_rec.grant_tier;
    v_status := case when v_code_rec.grant_lifetime then 'lifetime' else 'active' end;
    v_message := case when v_code_rec.grant_lifetime
      then 'Lifetime access activated.' else 'Pro access activated.' end;

    if exists (select 1 from public.code_redemptions
               where code = v_code and shop_id = v_shop_id) then
      -- Reapply the persisted grant if an earlier client stopped after redeeming.
      null;
    elsif v_code_rec.used_count >= v_code_rec.max_uses then
      return jsonb_build_object('success', false, 'error', 'This code has already been used.');
    else
      insert into public.code_redemptions(code, user_id, shop_id)
      values (v_code, v_user_id, v_shop_id);
      update public.activation_codes set used_count = used_count + 1 where code = v_code;
    end if;
  end if;

  update public.shop_settings
  set subscription_status = case
        when subscription_status = 'lifetime' or v_status = 'lifetime' then 'lifetime'
        else v_status
      end,
      enable_dealership_mode = enable_dealership_mode or v_tier = 'dealer',
      updated_at = now()
  where user_id = v_shop_id;

  if not found then
    return jsonb_build_object('success', false,
      'error', 'Could not save the activation to this shop. Reload settings and try again.');
  end if;

  return jsonb_build_object('success', true, 'tier', v_tier, 'message', v_message);
end;
$$;

revoke all on function public.redeem_activation_code(text) from public, anon;
grant execute on function public.redeem_activation_code(text) to authenticated;

notify pgrst, 'reload schema';
