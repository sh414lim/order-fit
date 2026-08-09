-- OrderFit initial Supabase schema
-- Apply with: supabase db push

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.member_role as enum ('admin', 'manager', 'kitchen', 'hall', 'staff');
create type public.operation_zone as enum ('kitchen', 'hall', 'shared');
create type public.receipt_status as enum ('uploaded', 'processing', 'review_required', 'confirmed', 'rejected');
create type public.inventory_transaction_type as enum ('receipt', 'usage', 'waste', 'adjustment', 'return');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  timezone text not null default 'Asia/Seoul',
  currency_code text not null default 'KRW' check (currency_code = 'KRW'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name citext not null,
  business_number text,
  contact_name text,
  phone text,
  payment_terms text,
  default_zone public.operation_zone not null default 'shared',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name citext not null,
  category text,
  zone public.operation_zone not null,
  base_unit text not null,
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.item_vendor_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  raw_name text not null,
  package_size numeric(14,3),
  package_unit text,
  conversion_to_base numeric(14,6) not null default 1 check (conversion_to_base > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, vendor_id, raw_name)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name_raw text,
  receipt_date date not null,
  image_path text,
  image_sha256 text,
  ocr_payload jsonb not null default '{}'::jsonb,
  ocr_confidence numeric(5,4) check (ocr_confidence between 0 and 1),
  status public.receipt_status not null default 'uploaded',
  subtotal_amount numeric(14,0) not null default 0 check (subtotal_amount >= 0),
  tax_amount numeric(14,0) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,0) not null default 0 check (total_amount >= 0),
  notes text,
  uploaded_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'confirmed') or (confirmed_by is not null and confirmed_at is not null))
);

create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  raw_name text not null,
  normalized_name text,
  zone public.operation_zone not null default 'shared',
  quantity numeric(14,3) not null default 1 check (quantity >= 0),
  unit text,
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  amount numeric(14,0) not null default 0 check (amount >= 0),
  ocr_confidence numeric(5,4) check (ocr_confidence between 0 and 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  receipt_line_id uuid references public.receipt_lines(id) on delete set null,
  transaction_type public.inventory_transaction_type not null,
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create index vendors_organization_idx on public.vendors(organization_id, is_active);
create index items_organization_zone_idx on public.items(organization_id, zone, is_active);
create index aliases_item_idx on public.item_vendor_aliases(item_id);
create index receipts_organization_date_idx on public.receipts(organization_id, receipt_date desc);
create index receipts_organization_status_idx on public.receipts(organization_id, status, receipt_date desc);
create index receipt_lines_receipt_idx on public.receipt_lines(receipt_id, sort_order);
create index receipt_lines_item_idx on public.receipt_lines(item_id, organization_id);
create index inventory_item_occurred_idx on public.inventory_transactions(item_id, occurred_at desc);
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger items_set_updated_at before update on public.items for each row execute function public.set_updated_at();
create trigger receipts_set_updated_at before update on public.receipts for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(target_organization_id uuid, allowed_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_organization_id
      and user_id = (select auth.uid())
      and role = any(allowed_roles)
  );
$$;

create or replace function public.bootstrap_organization(organization_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.organizations(name) values (organization_name) returning id into new_organization_id;
  insert into public.organization_members(organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'admin');
  return new_organization_id;
end;
$$;

create or replace function public.recalculate_receipt_total()
returns trigger language plpgsql set search_path = public as $$
declare target_receipt_id uuid;
begin
  target_receipt_id := coalesce(new.receipt_id, old.receipt_id);
  update public.receipts
  set subtotal_amount = coalesce((select sum(amount) from public.receipt_lines where receipt_id = target_receipt_id), 0),
      total_amount = coalesce((select sum(amount) from public.receipt_lines where receipt_id = target_receipt_id), 0)
  where id = target_receipt_id and status <> 'confirmed';
  return coalesce(new, old);
end;
$$;

create trigger receipt_lines_recalculate_after_change
after insert or update or delete on public.receipt_lines
for each row execute function public.recalculate_receipt_total();

create or replace function public.confirm_receipt(target_receipt_id uuid)
returns public.receipts language plpgsql security definer set search_path = public as $$
declare result public.receipts;
begin
  select * into result from public.receipts where id = target_receipt_id for update;
  if result.id is null then raise exception 'Receipt not found'; end if;
  if not public.has_org_role(result.organization_id, array['admin','manager']::public.member_role[]) then
    raise exception 'Only an admin or manager can confirm a receipt';
  end if;
  if result.status = 'confirmed' then return result; end if;
  if not exists (select 1 from public.receipt_lines where receipt_id = result.id) then raise exception 'A receipt needs at least one line'; end if;
  update public.receipts set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = result.id returning * into result;
  insert into public.inventory_transactions (organization_id, item_id, receipt_line_id, transaction_type, quantity_delta, created_by, notes)
  select result.organization_id, line.item_id, line.id, 'receipt', line.quantity, auth.uid(), 'Confirmed receipt ' || result.id
  from public.receipt_lines line where line.receipt_id = result.id and line.item_id is not null and line.quantity > 0;
  insert into public.audit_logs(organization_id, actor_id, entity_type, entity_id, action, after_data)
  values (result.organization_id, auth.uid(), 'receipt', result.id, 'confirmed', jsonb_build_object('total_amount', result.total_amount));
  return result;
end;
$$;

-- RLS: direct browser access is limited to the authenticated member's organization.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.vendors enable row level security;
alter table public.items enable row level security;
alter table public.item_vendor_aliases enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can view organizations" on public.organizations for select to authenticated using ((select public.is_org_member(id)));
create policy "admins can update organizations" on public.organizations for update to authenticated using ((select public.has_org_role(id, array['admin']::public.member_role[]))) with check ((select public.has_org_role(id, array['admin']::public.member_role[])));
create policy "users can view own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "users can update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "members can view organization members" on public.organization_members for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "admins manage organization members" on public.organization_members for all to authenticated using ((select public.has_org_role(organization_id, array['admin']::public.member_role[]))) with check ((select public.has_org_role(organization_id, array['admin']::public.member_role[])));

create policy "members read vendors" on public.vendors for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "managers manage vendors" on public.vendors for all to authenticated using ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[]))) with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "members read items" on public.items for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "managers manage items" on public.items for all to authenticated using ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[]))) with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "members read aliases" on public.item_vendor_aliases for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "managers manage aliases" on public.item_vendor_aliases for all to authenticated using ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[]))) with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "members read receipts" on public.receipts for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "members upload receipts" on public.receipts for insert to authenticated with check ((select public.is_org_member(organization_id)) and uploaded_by = (select auth.uid()));
create policy "managers update draft receipts" on public.receipts for update to authenticated using ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])) and status <> 'confirmed') with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "members read receipt lines" on public.receipt_lines for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "managers manage receipt lines" on public.receipt_lines for all to authenticated using ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[]))) with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "members read inventory" on public.inventory_transactions for select to authenticated using ((select public.is_org_member(organization_id)));
create policy "managers manage inventory" on public.inventory_transactions for insert to authenticated with check ((select public.has_org_role(organization_id, array['admin','manager']::public.member_role[])));
create policy "admins read audit logs" on public.audit_logs for select to authenticated using ((select public.has_org_role(organization_id, array['admin']::public.member_role[])));

-- Private receipt originals, stored as: <organization-id>/<receipt-id>/original.<extension>
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do update set public = false;
create policy "members read organization receipt files" on storage.objects for select to authenticated using (bucket_id = 'receipts' and (select public.is_org_member((storage.foldername(name))[1]::uuid)));
create policy "members upload organization receipt files" on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and (select public.is_org_member((storage.foldername(name))[1]::uuid)));
create policy "managers update organization receipt files" on storage.objects for update to authenticated using (bucket_id = 'receipts' and (select public.has_org_role((storage.foldername(name))[1]::uuid, array['admin','manager']::public.member_role[]))) with check (bucket_id = 'receipts' and (select public.has_org_role((storage.foldername(name))[1]::uuid, array['admin','manager']::public.member_role[])));
create policy "managers delete organization receipt files" on storage.objects for delete to authenticated using (bucket_id = 'receipts' and (select public.has_org_role((storage.foldername(name))[1]::uuid, array['admin','manager']::public.member_role[])));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.bootstrap_organization(text) to authenticated;
grant execute on function public.confirm_receipt(uuid) to authenticated;

-- dashboard query: use security_invoker so the view respects RLS.
create view public.vendor_monthly_summary with (security_invoker = true) as
select r.organization_id, r.vendor_id, date_trunc('month', r.receipt_date)::date as month,
       count(*) filter (where r.status = 'confirmed') as confirmed_receipt_count,
       coalesce(sum(r.total_amount) filter (where r.status = 'confirmed'), 0) as confirmed_total_amount
from public.receipts r
group by r.organization_id, r.vendor_id, date_trunc('month', r.receipt_date)::date;

create view public.item_stock_summary with (security_invoker = true) as
select i.organization_id, i.id as item_id, i.name, i.zone, i.base_unit, i.minimum_stock,
       coalesce(sum(t.quantity_delta), 0) as current_stock
from public.items i
left join public.inventory_transactions t on t.item_id = i.id
group by i.organization_id, i.id;
