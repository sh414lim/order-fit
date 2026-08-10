-- Standalone OrderFit accounts. These do not depend on Supabase Auth or email
-- confirmation; passwords and sessions are handled only by server endpoints.
create table public.orderfit_user_accounts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orderfit_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.orderfit_user_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.orderfit_user_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  user_id uuid not null references public.orderfit_user_accounts(id) on delete cascade,
  role public.orderfit_user_role not null default 'staff',
  assigned_by uuid references public.orderfit_user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index orderfit_user_sessions_user_expires_idx on public.orderfit_user_sessions(user_id, expires_at);
create index orderfit_user_memberships_user_org_idx on public.orderfit_user_memberships(user_id, organization_id);
create trigger orderfit_user_accounts_set_updated_at before update on public.orderfit_user_accounts for each row execute function public.timefit_set_updated_at();
create trigger orderfit_user_memberships_set_updated_at before update on public.orderfit_user_memberships for each row execute function public.timefit_set_updated_at();

alter table public.orderfit_user_accounts enable row level security;
alter table public.orderfit_user_sessions enable row level security;
alter table public.orderfit_user_memberships enable row level security;
