-- Complete the shop settings fields already used by the app. The initial
-- schema alone lacks these fields, causing signup/settings and code redemption
-- writes to fail at runtime.
alter table public.shop_settings add column if not exists zelle_info text default '';
alter table public.shop_settings add column if not exists venmo_handle text default '';
alter table public.shop_settings add column if not exists cash_app_tag text default '';
alter table public.shop_settings add column if not exists custom_pay_link text default '';
alter table public.shop_settings add column if not exists enable_dealership_mode boolean default false;
alter table public.shop_settings add column if not exists dealership_doc_fee numeric(10,2) default 199;
alter table public.shop_settings add column if not exists dealership_prep_fee numeric(10,2) default 250;
alter table public.shop_settings add column if not exists dealership_freight_fee numeric(10,2) default 350;
alter table public.shop_settings add column if not exists subscription_status text default 'trialing'
  check (subscription_status in ('trialing', 'active', 'lifetime', 'canceled', 'past_due'));
alter table public.shop_settings add column if not exists trial_ends_at timestamptz;

alter table public.activation_codes add column if not exists grant_lifetime boolean not null default false;
alter table public.activation_codes add column if not exists grant_tier text not null default 'solo'
  check (grant_tier in ('solo', 'dealer'));

create or replace function public.redeem_activation_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_user_id uuid := auth.uid();
  v_code_rec public.activation_codes%rowtype;
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Sign in before redeeming a code.');
  end if;

  select * into v_code_rec from public.activation_codes
  where code = v_code for update;
  if not found or not v_code_rec.is_active then
    return jsonb_build_object('success', false, 'error', 'Invalid or inactive activation code.');
  end if;

  if exists (select 1 from public.code_redemptions
             where code = v_code and user_id = v_user_id) then
    return jsonb_build_object('success', true, 'tier', v_code_rec.grant_tier,
      'message', 'Code already redeemed for this account.');
  end if;
  if v_code_rec.used_count >= v_code_rec.max_uses then
    return jsonb_build_object('success', false, 'error', 'This code has already been used.');
  end if;

  insert into public.code_redemptions(code, user_id) values (v_code, v_user_id);
  update public.activation_codes set used_count = used_count + 1 where code = v_code;

  insert into public.shop_settings(id, user_id, subscription_status, enable_dealership_mode)
  values (v_user_id::text, v_user_id,
    case when v_code_rec.grant_lifetime then 'lifetime' else 'active' end,
    v_code_rec.grant_tier = 'dealer')
  on conflict (id) do update
    set subscription_status = excluded.subscription_status,
        enable_dealership_mode = public.shop_settings.enable_dealership_mode
          or excluded.enable_dealership_mode,
        updated_at = now();

  return jsonb_build_object('success', true, 'tier', v_code_rec.grant_tier,
    'message', case when v_code_rec.grant_lifetime
      then 'Lifetime access activated.' else 'Pro access activated.' end);
end;
$$;

revoke all on function public.redeem_activation_code(text) from public, anon;
grant execute on function public.redeem_activation_code(text) to authenticated;
notify pgrst, 'reload schema';
