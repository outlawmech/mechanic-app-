-- Private Stripe identifiers and synchronization state. Customer clients have
-- no direct access; only trusted server functions use the service role.
create table if not exists public.organization_billing (
  shop_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_subscription_status text,
  stripe_checkout_session_id text unique,
  stripe_checkout_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.organization_billing enable row level security;
revoke all on public.organization_billing from public, anon, authenticated;
grant all on public.organization_billing to service_role;
