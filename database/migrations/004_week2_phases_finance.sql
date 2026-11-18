-- =============================================================================
-- WEEK 2 — 004_week2_phases_finance.sql
-- Objective 3: phase-by-phase tracking of project progress and accomplishments.
-- Objective 4: financial monitoring of budgets, expenses and fund utilization.
--
-- Overall project completion = sum(weight × accomplishment) / sum(weight),
-- computed by the API (services/completion.js) and stored in
-- projects.overall_progress whenever phases or progress change.
-- Financial totals are computed live in v_project_summary from financial_records.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Construction phases (weights of a project's phases total 100)
-- ---------------------------------------------------------------------------
create table public.project_phases (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  sequence_no     smallint not null check (sequence_no > 0),
  name            text not null check (length(trim(name)) >= 2),
  weight          numeric(5, 2) not null check (weight > 0 and weight <= 100),
  planned_start   date,
  planned_end     date,
  actual_start    date,
  actual_end      date,
  accomplishment  numeric(5, 2) not null default 0 check (accomplishment between 0 and 100),
  remarks         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, sequence_no),
  constraint phases_planned_order check (planned_end is null or planned_start is null or planned_end >= planned_start),
  constraint phases_actual_order  check (actual_end is null or actual_start is null or actual_end >= actual_start),
  constraint phases_end_needs_100 check (actual_end is null or accomplishment = 100)
);
create index project_phases_project_idx on public.project_phases (project_id, sequence_no);
create trigger project_phases_updated_at before update on public.project_phases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Progress update history (one row per report submitted by DPWH personnel)
-- phase_snapshot = [{ sequence_no, name, weight, accomplishment }] at that date
-- ---------------------------------------------------------------------------
create table public.progress_updates (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  report_date       date not null,
  overall_progress  numeric(5, 2) not null check (overall_progress between 0 and 100),
  phase_snapshot    jsonb not null default '[]'::jsonb,
  remarks           text,
  submitted_by      uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index progress_updates_project_idx on public.progress_updates (project_id, report_date desc);
create index progress_updates_submitted_by_idx on public.progress_updates (submitted_by);

-- ---------------------------------------------------------------------------
-- Financial records
--   variation_order : approved change to the contract amount (+ or −)
--   obligation      : funds obligated (committed) for the project
--   disbursement    : payment actually released to the contractor
--   expense         : other reported project expense
-- ---------------------------------------------------------------------------
create table public.financial_records (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  record_type   text not null check (record_type in ('variation_order', 'obligation', 'disbursement', 'expense')),
  amount        numeric(15, 2) not null check (amount <> 0),
  reference_no  text,
  record_date   date not null,
  description   text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint financial_amount_sign check (record_type = 'variation_order' or amount > 0)
);
create index financial_records_project_idx on public.financial_records (project_id, record_date);
create index financial_records_created_by_idx on public.financial_records (created_by);

-- Overall completion stored on the project (kept up to date by the API)
alter table public.projects
  add column overall_progress numeric(5, 2) not null default 0 check (overall_progress between 0 and 100);

-- ---------------------------------------------------------------------------
-- Access: staff read (RLS); writes only through the API (service role)
-- ---------------------------------------------------------------------------
grant select on public.project_phases, public.progress_updates, public.financial_records to authenticated;
grant select, insert, update, delete on public.project_phases, public.progress_updates, public.financial_records to service_role;
revoke select on public.project_phases, public.progress_updates, public.financial_records from anon;

alter table public.project_phases    enable row level security;
alter table public.progress_updates  enable row level security;
alter table public.financial_records enable row level security;

create policy "phases: staff read"    on public.project_phases    for select to authenticated using ((select private.is_staff()));
create policy "progress: staff read"  on public.progress_updates  for select to authenticated using ((select private.is_staff()));
create policy "financial: staff read" on public.financial_records for select to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- Project summary view: Week 1 columns + progress and financial totals
-- (new columns are appended so the Week 1 columns keep their order)
-- ---------------------------------------------------------------------------
create or replace view public.v_project_summary with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status,
  p.approved_budget, p.contract_amount, p.notice_to_proceed, p.duration_days,
  p.target_completion_date, p.actual_completion_date, p.fund_source, p.contract_ref_no,
  p.latitude, p.longitude, p.created_at, p.updated_at,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name, a.code as agency_code,
  p.contractor_id, c.name as contractor_name,
  -- Week 2
  p.overall_progress,
  coalesce(ph.phase_count, 0)                                   as phase_count,
  coalesce(f.variation_orders, 0)                               as variation_orders,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) as revised_contract_amount,
  coalesce(f.total_obligated, 0)                                as total_obligated,
  coalesce(f.total_disbursed, 0)                                as total_disbursed,
  coalesce(f.total_expenses, 0)                                 as total_expenses,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) - coalesce(f.total_disbursed, 0) as remaining_balance
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (
  select count(*) as phase_count from public.project_phases x where x.project_id = p.id
) ph on true
left join lateral (
  select
    sum(r.amount) filter (where r.record_type = 'variation_order') as variation_orders,
    sum(r.amount) filter (where r.record_type = 'obligation')      as total_obligated,
    sum(r.amount) filter (where r.record_type = 'disbursement')    as total_disbursed,
    sum(r.amount) filter (where r.record_type = 'expense')         as total_expenses
  from public.financial_records r where r.project_id = p.id
) f on true;

grant select on public.v_project_summary to authenticated, service_role;
