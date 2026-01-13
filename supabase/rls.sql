-- RLS policies for role-based access

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_role() = 'admin';
$$;

-- PROFILES
alter table public.profiles enable row level security;

create policy "profiles_self_read"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_admin_read"
on public.profiles for select
using (public.is_admin());

create policy "profiles_ops_read_staff"
on public.profiles for select
using (
  public.current_role() in ('gerencia', 'logistica', 'operativo', 'encargado barra')
  and role like 'staff%'
);

create policy "profiles_self_update"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_admin_update"
on public.profiles for update
using (public.is_admin())
with check (public.is_admin());

-- AREAS
alter table public.areas enable row level security;

create policy "areas_read"
on public.areas for select
using (auth.uid() is not null);

create policy "areas_admin_write"
on public.areas for all
using (public.is_admin())
with check (public.is_admin());

-- EVENTS
alter table public.events enable row level security;

create policy "events_read_ops"
on public.events for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo', 'encargado barra'));

create policy "events_read_staff_convocations"
on public.events for select
using (
  public.current_role() like 'staff%'
  and exists (
    select 1 from public.staff_convocations sc
    where sc.event_id = events.id
      and sc.user_id = auth.uid()
  )
);

create policy "events_admin_write"
on public.events for all
using (public.current_role() in ('admin', 'gerencia'))
with check (public.current_role() in ('admin', 'gerencia'));

-- JOB POSITIONS
alter table public.job_positions enable row level security;

create policy "job_positions_read"
on public.job_positions for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo', 'encargado barra'));

create policy "job_positions_admin_write"
on public.job_positions for all
using (public.is_admin())
with check (public.is_admin());

-- STAFF ALLOCATIONS
alter table public.staff_allocations enable row level security;

create policy "staff_allocations_read"
on public.staff_allocations for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo', 'encargado barra'));

create policy "staff_allocations_admin_write"
on public.staff_allocations for all
using (public.is_admin())
with check (public.is_admin());

-- STAFF CONVOCATIONS
alter table public.staff_convocations enable row level security;

create policy "staff_convocations_select_own"
on public.staff_convocations for select
using (user_id = auth.uid());

create policy "staff_convocations_select_ops"
on public.staff_convocations for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo', 'encargado barra'));

create policy "staff_convocations_insert_ops"
on public.staff_convocations for insert
with check (public.current_role() in ('admin', 'operativo', 'encargado barra'));

create policy "staff_convocations_update_self"
on public.staff_convocations for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "staff_convocations_update_admin"
on public.staff_convocations for update
using (public.is_admin())
with check (public.is_admin());

-- REPLENISHMENT REQUESTS
alter table public.replenishment_requests enable row level security;

create policy "replenishment_requests_read"
on public.replenishment_requests for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "replenishment_requests_insert_operativo"
on public.replenishment_requests for insert
with check (public.current_role() = 'operativo' and requested_by = auth.uid());

create policy "replenishment_requests_update_ops"
on public.replenishment_requests for update
using (public.current_role() in ('admin', 'logistica', 'operativo'))
with check (public.current_role() in ('admin', 'logistica', 'operativo'));

-- REPLENISHMENT ITEMS
alter table public.replenishment_items enable row level security;

create policy "replenishment_items_read"
on public.replenishment_items for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "replenishment_items_insert_operativo"
on public.replenishment_items for insert
with check (
  public.current_role() = 'operativo' and
  exists (
    select 1 from public.replenishment_requests r
    where r.id = replenishment_items.request_id
      and r.requested_by = auth.uid()
  )
);

create policy "replenishment_items_update_ops"
on public.replenishment_items for update
using (public.current_role() in ('admin', 'logistica', 'operativo'))
with check (public.current_role() in ('admin', 'logistica', 'operativo'));

-- INVENTORY SKUS
alter table public.inventory_skus enable row level security;

create policy "inventory_skus_read"
on public.inventory_skus for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "inventory_skus_admin_write"
on public.inventory_skus for all
using (public.is_admin())
with check (public.is_admin());

-- INVENTORY STOCK
alter table public.inventory_stock enable row level security;

create policy "inventory_stock_read"
on public.inventory_stock for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "inventory_stock_write_ops"
on public.inventory_stock for all
using (public.current_role() in ('admin', 'logistica', 'operativo'))
with check (public.current_role() in ('admin', 'logistica', 'operativo'));

-- CATEGORIES
alter table public.categories enable row level security;

create policy "categories_read"
on public.categories for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "categories_admin_write"
on public.categories for all
using (public.is_admin())
with check (public.is_admin());

-- SUPPLIERS
alter table public.suppliers enable row level security;

create policy "suppliers_read_ops"
on public.suppliers for select
using (public.current_role() in ('admin', 'gerencia', 'logistica'));

create policy "suppliers_admin_write"
on public.suppliers for all
using (public.is_admin())
with check (public.is_admin());

-- PAYMENT CATEGORIES
alter table public.payment_categories enable row level security;

create policy "payment_categories_read"
on public.payment_categories for select
using (public.current_role() in ('admin', 'gerencia', 'logistica'));

create policy "payment_categories_admin_write"
on public.payment_categories for all
using (public.is_admin())
with check (public.is_admin());

-- OPENING COSTS
alter table public.opening_costs enable row level security;

create policy "opening_costs_read"
on public.opening_costs for select
using (public.current_role() in ('admin', 'gerencia'));

create policy "opening_costs_admin_write"
on public.opening_costs for all
using (public.is_admin())
with check (public.is_admin());

-- FIXED COSTS
alter table public.fixed_costs enable row level security;

create policy "fixed_costs_read"
on public.fixed_costs for select
using (public.current_role() in ('admin', 'gerencia'));

create policy "fixed_costs_admin_write"
on public.fixed_costs for all
using (public.is_admin())
with check (public.is_admin());

-- ACCOUNTS PAYABLE
alter table public.accounts_payable enable row level security;

create policy "accounts_payable_read"
on public.accounts_payable for select
using (public.current_role() in ('admin', 'gerencia', 'logistica'));

create policy "accounts_payable_insert_admin"
on public.accounts_payable for insert
with check (public.current_role() in ('admin', 'gerencia'));

create policy "accounts_payable_insert_staff"
on public.accounts_payable for insert
with check (public.current_role() like 'staff%' and category = 'personal');

create policy "accounts_payable_update_admin"
on public.accounts_payable for update
using (public.current_role() in ('admin', 'gerencia'))
with check (public.current_role() in ('admin', 'gerencia'));

-- CONSUMPTION REPORTS
alter table public.consumption_reports enable row level security;
alter table public.consumption_details enable row level security;

create policy "consumption_reports_read"
on public.consumption_reports for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "consumption_reports_admin"
on public.consumption_reports for all
using (public.is_admin())
with check (public.is_admin());

create policy "consumption_details_read"
on public.consumption_details for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "consumption_details_admin"
on public.consumption_details for all
using (public.is_admin())
with check (public.is_admin());

-- OPERATIONAL DAYS
alter table public.operational_days enable row level security;

create policy "operational_days_read"
on public.operational_days for select
using (public.current_role() in ('admin', 'gerencia', 'logistica', 'operativo'));

create policy "operational_days_admin_write"
on public.operational_days for all
using (public.is_admin())
with check (public.is_admin());

-- QR BATCHES / CODES
alter table public.qr_batches enable row level security;
alter table public.qr_codes enable row level security;

create policy "qr_batches_admin"
on public.qr_batches for all
using (public.is_admin())
with check (public.is_admin());

create policy "qr_codes_admin"
on public.qr_codes for all
using (public.is_admin())
with check (public.is_admin());
