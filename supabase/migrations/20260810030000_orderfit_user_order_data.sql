create table public.orderfit_user_vendors (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  name citext not null, default_zone public.timefit_operation_zone not null default 'shared', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, name)
);
create table public.orderfit_user_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  name citext not null, category text, zone public.timefit_operation_zone not null default 'shared', base_unit text not null default '개', minimum_stock numeric(14,3) not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, name)
);
create table public.orderfit_user_receipts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  vendor_id uuid references public.orderfit_user_vendors(id) on delete set null, vendor_name text not null, receipt_date date not null,
  image_data text, status public.timefit_receipt_status not null default 'review_required', total_amount numeric(14,0) not null default 0,
  uploaded_by uuid not null references public.orderfit_user_accounts(id), confirmed_by uuid references public.orderfit_user_accounts(id), confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.orderfit_user_receipt_lines (
  id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.orderfit_user_receipts(id) on delete cascade,
  organization_id uuid not null references public.timefit_organizations(id) on delete cascade, item_id uuid references public.orderfit_user_items(id) on delete set null,
  name text not null, zone public.timefit_operation_zone not null default 'shared', quantity numeric(14,3) not null default 1, unit text not null default '개', unit_price numeric(14,0) not null default 0, amount numeric(14,0) not null default 0, sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table public.orderfit_user_inventory_transactions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.timefit_organizations(id) on delete cascade,
  item_id uuid not null references public.orderfit_user_items(id) on delete restrict, receipt_line_id uuid references public.orderfit_user_receipt_lines(id) on delete set null,
  quantity_delta numeric(14,3) not null, created_by uuid not null references public.orderfit_user_accounts(id), occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index orderfit_user_receipts_org_date_idx on public.orderfit_user_receipts(organization_id, receipt_date desc);
create index orderfit_user_lines_receipt_idx on public.orderfit_user_receipt_lines(receipt_id, sort_order);
create trigger orderfit_user_vendors_updated before update on public.orderfit_user_vendors for each row execute function public.timefit_set_updated_at();
create trigger orderfit_user_items_updated before update on public.orderfit_user_items for each row execute function public.timefit_set_updated_at();
create trigger orderfit_user_receipts_updated before update on public.orderfit_user_receipts for each row execute function public.timefit_set_updated_at();
alter table public.orderfit_user_vendors enable row level security;
alter table public.orderfit_user_items enable row level security;
alter table public.orderfit_user_receipts enable row level security;
alter table public.orderfit_user_receipt_lines enable row level security;
alter table public.orderfit_user_inventory_transactions enable row level security;
