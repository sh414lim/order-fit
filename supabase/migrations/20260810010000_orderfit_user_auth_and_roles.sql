-- OrderFit user and role namespace.
-- Authentication identities remain in auth.users; application profile and
-- organization roles are isolated under orderfit_user_* tables.

create type public.orderfit_user_role as enum ('admin', 'manager', 'kitchen', 'hall', 'staff');

create table public.orderfit_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- auth.users can contain OAuth or anonymous identities without an email.
  -- OrderFit's email/password signup always creates an email address.
  email citext,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orderfit_user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  user_id uuid not null references public.orderfit_user_profiles(id) on delete cascade,
  role public.orderfit_user_role not null default 'staff',
  assigned_by uuid references public.orderfit_user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index orderfit_user_roles_user_organization_idx on public.orderfit_user_roles(user_id, organization_id);
create index orderfit_user_roles_organization_role_idx on public.orderfit_user_roles(organization_id, role);

create trigger orderfit_user_profiles_set_updated_at before update on public.orderfit_user_profiles for each row execute function public.timefit_set_updated_at();
create trigger orderfit_user_roles_set_updated_at before update on public.orderfit_user_roles for each row execute function public.timefit_set_updated_at();

-- Backfill the new tables for any existing authenticated user and legacy membership.
insert into public.orderfit_user_profiles (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'display_name', u.email)
from auth.users u
on conflict (id) do nothing;

insert into public.orderfit_user_roles (organization_id, user_id, role)
select m.organization_id, m.user_id, m.role::text::public.orderfit_user_role
from public.timefit_organization_members m
on conflict (organization_id, user_id) do nothing;

create or replace function public.orderfit_user_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.orderfit_user_profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger orderfit_user_on_auth_user_created
after insert on auth.users for each row execute procedure public.orderfit_user_handle_new_auth_user();

-- Replace the existing authorization helpers. All timefit_* table policies
-- immediately use the new orderfit_user_roles source of truth.
create or replace function public.timefit_is_org_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orderfit_user_roles
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and exists (select 1 from public.orderfit_user_profiles p where p.id = user_id and p.is_active)
  );
$$;

create or replace function public.timefit_has_org_role(target_organization_id uuid, allowed_roles public.timefit_member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orderfit_user_roles
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role::text = any(allowed_roles::text[])
      and exists (select 1 from public.orderfit_user_profiles p where p.id = user_id and p.is_active)
  );
$$;

create or replace function public.timefit_bootstrap_organization(organization_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.timefit_organizations(name) values (organization_name) returning id into new_organization_id;
  insert into public.orderfit_user_roles(organization_id, user_id, role, assigned_by)
  values (new_organization_id, auth.uid(), 'admin', auth.uid());
  return new_organization_id;
end;
$$;

create or replace function public.orderfit_user_assign_role(target_organization_id uuid, target_user_id uuid, target_role public.orderfit_user_role)
returns public.orderfit_user_roles language plpgsql security definer set search_path = public as $$
declare result public.orderfit_user_roles;
begin
  if not public.timefit_has_org_role(target_organization_id, array['admin']::public.timefit_member_role[]) then
    raise exception 'Only administrators can assign roles';
  end if;
  insert into public.orderfit_user_roles(organization_id, user_id, role, assigned_by)
  values (target_organization_id, target_user_id, target_role, auth.uid())
  on conflict (organization_id, user_id)
  do update set role = excluded.role, assigned_by = auth.uid(), updated_at = now()
  returning * into result;
  return result;
end;
$$;

alter table public.orderfit_user_profiles enable row level security;
alter table public.orderfit_user_roles enable row level security;

create policy "orderfit users read own profile" on public.orderfit_user_profiles for select to authenticated using (id = (select auth.uid()));
create policy "orderfit users update own profile" on public.orderfit_user_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "orderfit admins read organization users" on public.orderfit_user_profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.orderfit_user_roles role
    where role.user_id = orderfit_user_profiles.id
      and public.timefit_has_org_role(role.organization_id, array['admin','manager']::public.timefit_member_role[])
  )
);
create policy "orderfit users read own roles" on public.orderfit_user_roles for select to authenticated using (
  user_id = (select auth.uid()) or public.timefit_has_org_role(organization_id, array['admin','manager']::public.timefit_member_role[])
);
create policy "orderfit admins manage roles" on public.orderfit_user_roles for all to authenticated using (
  public.timefit_has_org_role(organization_id, array['admin']::public.timefit_member_role[])
) with check (
  public.timefit_has_org_role(organization_id, array['admin']::public.timefit_member_role[])
);

-- Hall, kitchen, and staff users may upload a receipt and its initial OCR
-- placeholder. Editing, deleting, and confirming lines remains manager-only.
create policy "members add initial receipt lines" on public.timefit_receipt_lines for insert to authenticated with check (
  public.timefit_is_org_member(organization_id)
);

grant select, update on public.orderfit_user_profiles to authenticated;
grant select, insert, update, delete on public.orderfit_user_roles to authenticated;
grant execute on function public.orderfit_user_assign_role(uuid, uuid, public.orderfit_user_role) to authenticated;
