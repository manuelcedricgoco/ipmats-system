-- =============================================================================
-- 027 — Project data authority: approved deletion requests and the staff-visible PACC case status
--
-- Apply AFTER 026 and BEFORE deploying the API that reads project_deletion_requests and
-- projects.pacc_case_status (the project list selects pacc_case_status from v_project_summary).
-- Design: docs/superpowers/specs/2026-11-27-project-authority-design.md
--
--   project_deletion_requests  DPWH Personnel ask to delete a project; the System Administrator
--                              approves or declines. An approval is valid for 7 days, can be used
--                              once, and only by the Personnel account that asked (all checked by
--                              the API). Status: pending -> approved | declined | cancelled;
--                              approved -> used | expired. At most one open request (pending, or
--                              approved and not yet used or expired) per project: a partial unique
--                              index, so two requests at the same moment fail with 23505.
--                              The request keeps a snapshot of the project code and name, and
--                              project_id is set to NULL (not cascaded) when the project is deleted.
--
--   projects.pacc_case_status  The status of the project's non-closed PACC case
--                              ('under_investigation' | 'case_filed' | NULL), WHETHER OR NOT PACC
--                              switched "show to public" on. Staff (Admin, DPWH Personnel,
--                              Auditor) always see it, for transparency; only the status, never the
--                              case. The public portal still reads pacc_public_status (024), which
--                              follows the switch and is unchanged. pacc_case_status is kept by the
--                              same trigger on pacc_cases: private.sync_pacc_public_status() is
--                              replaced to set both columns. Backfilled from the current cases.
--                              It is appended to v_project_summary (CREATE OR REPLACE VIEW only
--                              allows appending; security_invoker and grants are unchanged).
--
--   projects.updated_at        No longer moves when only a PACC status column changes (new
--                              projects trigger function private.projects_set_updated_at()), so a
--                              hidden case does not show in the public last-update time.
--
-- Access:
--   * project_deletion_requests is readable by staff (private.is_staff()) through RLS. anon gets
--     no grant at all. Writes go through the API (service role), as everywhere else.
--   * pacc_case_status gets NO anon grant: anon only has the column grants of 016/021/024 on
--     projects, so the public cannot read it. Staff read it through the existing
--     "projects: staff read" policy (authenticated has SELECT on projects since 002).
--
-- Idempotent: safe to run again (if not exists, create or replace, drop … if exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Deletion requests
-- ---------------------------------------------------------------------------
create table if not exists public.project_deletion_requests (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references public.projects (id) on delete set null,  -- NULL once the project is deleted
  project_code        text not null,                   -- snapshot taken when the request is made
  project_name        text not null,                   -- snapshot taken when the request is made
  requested_by        uuid references public.profiles (id) on delete set null,
  reason              text not null check (char_length(reason) between 10 and 500),
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'declined', 'cancelled', 'used', 'expired')),
  decided_by          uuid references public.profiles (id) on delete set null,
  decided_at          timestamptz,
  decision_note       text check (char_length(decision_note) <= 500),
  approval_expires_at timestamptz,                     -- set on approval: 7 days later
  used_at             timestamptz,                     -- set when the approval is used to delete
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.project_deletion_requests is 'DPWH Personnel requests to delete a project, approved or declined by the System Administrator. An approval is valid 7 days, single use, requester only. At most one open (pending or approved) request per project. Readable by staff; written only by the API.';

-- One open request per project. Requests whose project was deleted have project_id NULL;
-- NULLs never collide in a unique index.
create unique index if not exists project_deletion_requests_one_open_per_project
  on public.project_deletion_requests (project_id)
  where status in ('pending', 'approved');
create index if not exists project_deletion_requests_project_idx on public.project_deletion_requests (project_id, created_at desc);
create index if not exists project_deletion_requests_requested_by_idx on public.project_deletion_requests (requested_by);
create index if not exists project_deletion_requests_decided_by_idx on public.project_deletion_requests (decided_by);
create index if not exists project_deletion_requests_status_idx on public.project_deletion_requests (status, created_at desc);

drop trigger if exists project_deletion_requests_updated_at on public.project_deletion_requests;
create trigger project_deletion_requests_updated_at before update on public.project_deletion_requests
  for each row execute function public.set_updated_at();

-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.project_deletion_requests from anon, authenticated;
grant select on public.project_deletion_requests to authenticated;
grant select, insert, update, delete on public.project_deletion_requests to service_role;

alter table public.project_deletion_requests enable row level security;

drop policy if exists "deletion requests: staff read" on public.project_deletion_requests;
create policy "deletion requests: staff read" on public.project_deletion_requests
  for select to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------
-- 2. Staff-visible PACC case status on the project
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists pacc_case_status text
  check (pacc_case_status in ('under_investigation', 'case_filed'));

comment on column public.projects.pacc_case_status is
  'Status of the project''s non-closed PACC case, whether or not it is shown to the public, otherwise NULL. Shown to staff only (no anon grant); the public portal uses pacc_public_status. Kept by the trigger on pacc_cases; never written directly.';

-- projects.updated_at is readable by anon (016 column grant, v_public_projects). Setting a PACC
-- status column must not move it, or the public could tell that a hidden case was opened, changed
-- or closed (and the backfill below would overwrite real last-edit times). The projects trigger
-- (001: projects_updated_at, before update, public.set_updated_at()) is replaced by one that keeps
-- updated_at when nothing but the PACC status columns changed. public_flag (021) is a stored
-- generated column: it is not computed yet in a BEFORE trigger, and it only follows other columns,
-- so it is left out of the comparison too. Other tables keep public.set_updated_at().
create or replace function private.projects_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'public_flag', 'pacc_case_status', 'pacc_public_status'])
     = (to_jsonb(old) - array['updated_at', 'public_flag', 'pacc_case_status', 'pacc_public_status'])
  then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.projects_set_updated_at() from public;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function private.projects_set_updated_at();

-- 024's function, now setting both columns. Security definer: the trigger must update projects
-- whoever writes the case. The trigger itself (024: after insert or delete or update of
-- project_id, status, show_public) is unchanged and already fires on every change that matters.
create or replace function private.sync_pacc_public_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projects uuid[];
  v_project  uuid;
  v_case     text;
  v_public   text;
begin
  if tg_op = 'INSERT' then
    v_projects := array[new.project_id];
  elsif tg_op = 'DELETE' then
    v_projects := array[old.project_id];
  elsif old.project_id is distinct from new.project_id then
    v_projects := array[old.project_id, new.project_id];
  else
    v_projects := array[new.project_id];
  end if;

  foreach v_project in array v_projects loop
    -- A case whose project was deleted (project_id NULL): nothing to update.
    continue when v_project is null;

    -- At most one non-closed case per project (pacc_cases_one_open_per_project).
    -- v_case: its status, public or not (staff). v_public: its status only when shown to the
    -- public (unchanged from 024). No row found sets both to NULL.
    select c.status, case when c.show_public then c.status end
      into v_case, v_public
    from public.pacc_cases c
    where c.project_id = v_project
      and c.status in ('under_investigation', 'case_filed')
    limit 1;

    update public.projects p
    set pacc_public_status = v_public,
        pacc_case_status   = v_case
    where p.id = v_project
      and (p.pacc_public_status is distinct from v_public
           or p.pacc_case_status is distinct from v_case);
  end loop;

  return null;
end;
$$;
revoke all on function private.sync_pacc_public_status() from public;

-- Backfill from the current non-closed cases (and clear any stale value).
update public.projects p
set pacc_case_status = c.status
from public.pacc_cases c
where c.project_id = p.id
  and c.status in ('under_investigation', 'case_filed')
  and p.pacc_case_status is distinct from c.status;

update public.projects p
set pacc_case_status = null
where p.pacc_case_status is not null
  and not exists (
    select 1 from public.pacc_cases c
    where c.project_id = p.id
      and c.status in ('under_investigation', 'case_filed')
  );

-- ---------------------------------------------------------------------------
-- 3. Staff view: the live definition with pacc_case_status appended at the end
-- ---------------------------------------------------------------------------
-- Grants on the view survive CREATE OR REPLACE (014/016: authenticated and service_role, no anon).
create or replace view public.v_project_summary with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status, p.approved_budget, p.contract_amount,
  p.notice_to_proceed, p.duration_days, p.target_completion_date, p.actual_completion_date, p.fund_source, p.contract_ref_no,
  p.latitude, p.longitude, p.created_at, p.updated_at, p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name, p.agency_id, a.name as agency_name, a.code as agency_code,
  p.contractor_id, c.name as contractor_name, p.overall_progress,
  coalesce(ph.phase_count, 0::bigint) as phase_count,
  coalesce(f.variation_orders, 0::numeric) as variation_orders,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) as revised_contract_amount,
  coalesce(f.total_obligated, 0::numeric) as total_obligated,
  coalesce(f.total_disbursed, 0::numeric) as total_disbursed,
  coalesce(f.total_expenses, 0::numeric) as total_expenses,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) - coalesce(f.total_disbursed, 0::numeric) as remaining_balance,
  p.completion_status, p.planned_progress, p.auto_flag, p.auto_flag_reasons, p.auto_flag_evaluated_at, p.current_flag,
  p.flag_review_status, p.audit_status,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date,
  case
    when (coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric)) > 0::numeric
      then round(coalesce(f.total_disbursed, 0::numeric) * 100::numeric / (coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric)), 2)
    else 0::numeric
  end as financial_progress,
  p.pacc_case_status
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (select count(*) as phase_count from public.project_phases x where x.project_id = p.id) ph on true
left join lateral (
  select sum(r.amount) filter (where r.record_type = 'variation_order'::text) as variation_orders,
         sum(r.amount) filter (where r.record_type = 'obligation'::text) as total_obligated,
         sum(r.amount) filter (where r.record_type = 'disbursement'::text) as total_disbursed,
         sum(r.amount) filter (where r.record_type = 'expense'::text) as total_expenses
  from public.financial_records r where r.project_id = p.id
) f on true
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id
) img on true;
