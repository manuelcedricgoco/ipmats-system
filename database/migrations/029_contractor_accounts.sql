-- =============================================================================
-- 029 — Contractor accounts: a contractor company's representatives update their own projects
--
-- Apply AFTER 028 (it adds the 'contractor' role value this file uses) and BEFORE deploying the
-- API that reads profiles.contractor_id (the sign-in check selects it for every account) and
-- project_pacc_status (deletion requests). The API before this one selects
-- projects.pacc_case_status in the deletion-request pages, which fail between the two steps.
-- Design: docs/superpowers/specs/2026-11-27-contractor-accounts-design.md
--
--   profiles.contractor_id      The contractor company the account represents. Required for the
--                               'contractor' role (CHECK profiles_contractor_has_company); one
--                               company can have several accounts. ON DELETE RESTRICT: a company
--                               with accounts cannot be deleted (suspend the company instead).
--   profiles.requested_contractor_id / requested_contractor_license
--                               What a "Contractor representative" typed at sign-up: the company
--                               (must exist) and its PCAB licence number (at most 50 characters).
--                               The System Administrator sees both, and whether the licence matches
--                               the company's, when approving. ON DELETE SET NULL.
--   profiles_requested_role_check  now also allows 'contractor'.
--   public.handle_new_user()    Replaced, starting from the live definition (017): a request for
--                               'contractor' with an existing requested_contractor_id is saved as a
--                               pending request (role stays NULL until the Admin approves); one with
--                               a missing or unknown company is treated as no valid request
--                               (rejected), like any other invalid role. Everything else unchanged.
--   private.contractor_company()  The company of the signed-in account when it is an active,
--                               approved 'contractor' account and the company is active; else NULL.
--                               An inactive company's accounts therefore read nothing at all.
--   public.project_pacc_status  The status of a project's non-closed PACC case (staff and PACC only),
--                               replacing projects.pacc_case_status (027), which is dropped.
--
-- Access (read only; writes go through the API, as everywhere else):
--   * Extra permissive "…: contractor read" SELECT policies next to the existing "…: staff read"
--     and "…: pacc read" ones: projects (contractor_id = the company), contractors (the company's
--     own row) and, for projects of the company, project_phases, progress_updates,
--     financial_records, site_images, flag_history, flag_reviews, audit_findings and
--     project_documents. Grants: authenticated already has SELECT on these tables (002, 007, 010).
--   * The staff-visible PACC case status moves out of projects (section 5). A contractor reads its
--     own projects' rows, and column grants cannot differ between staff and contractors (both
--     are 'authenticated'), so projects.pacc_case_status (027) would let the investigated
--     contractor see that a case is open. It now lives in public.project_pacc_status, readable
--     only by staff and PACC (RLS), kept by private.sync_pacc_public_status() (replaced), and
--     v_project_summary takes pacc_case_status from it (dropped and created again: a column
--     cannot be removed with CREATE OR REPLACE VIEW). A contractor gets NULL there. The API
--     still strips every pacc_* field from responses to contractors (defence in depth).
--   * Profiles: the existing "profiles: own or staff" policy lets a contractor read only its own
--     profile; staff names on project records are added by the API.
--   * No anon change. 'contractor' is NOT staff: private.is_staff() is unchanged, and the
--     activity-log policy (admin and auditor) does not include it.
--
-- Idempotent: safe to run again (if not exists, create or replace, drop … if exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The account's company, and the company asked for at sign-up
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists contractor_id uuid
    constraint profiles_contractor_id_fkey references public.contractors (id) on delete restrict,
  add column if not exists requested_contractor_id uuid
    constraint profiles_requested_contractor_id_fkey references public.contractors (id) on delete set null,
  add column if not exists requested_contractor_license text;

comment on column public.profiles.contractor_id is
  'Contractor company this account represents. Required for the contractor role; NULL for every other role.';
comment on column public.profiles.requested_contractor_id is
  'Contractor company chosen at sign-up by a "Contractor representative" (the Admin confirms or corrects it on approval).';
comment on column public.profiles.requested_contractor_license is
  'PCAB licence number typed at sign-up (at most 50 characters), compared with the company''s licence by the Admin.';

create index if not exists profiles_contractor_idx on public.profiles (contractor_id);
create index if not exists profiles_requested_contractor_idx on public.profiles (requested_contractor_id);

alter table public.profiles drop constraint if exists profiles_requested_contractor_license_check;
alter table public.profiles
  add constraint profiles_requested_contractor_license_check
  check (requested_contractor_license is null or char_length(requested_contractor_license) <= 50);

-- A contractor account always has a company.
alter table public.profiles drop constraint if exists profiles_contractor_has_company;
alter table public.profiles
  add constraint profiles_contractor_has_company
  check (role is distinct from 'contractor' or contractor_id is not null);

-- Sign-up may now ask for 'contractor' (017 allowed only dpwh_personnel / auditor).
-- profiles_role_requires_approval (017: a role only on an approved account) is unchanged.
alter table public.profiles drop constraint if exists profiles_requested_role_check;
alter table public.profiles
  add constraint profiles_requested_role_check
  check (requested_role is null or requested_role in ('dpwh_personnel', 'auditor', 'contractor'));

-- ---------------------------------------------------------------------------
-- 2. Sign-up: the live definition (017) with the contractor request added
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_req        text := meta ->> 'requested_role';
  v_agency     smallint;
  v_contractor uuid;
  v_license    text;
begin
  if v_req is not null and v_req not in ('dpwh_personnel', 'auditor', 'contractor') then
    v_req := null;
  end if;
  -- A contractor request needs an existing company; without one it is no valid request.
  -- The id is checked as text first, so a malformed value can never make sign-up fail.
  if v_req = 'contractor' then
    if (meta ->> 'requested_contractor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.id into v_contractor from public.contractors c where c.id = (meta ->> 'requested_contractor_id')::uuid;
    end if;
    if v_contractor is null then
      v_req := null;
    else
      v_license := nullif(left(btrim(coalesce(meta ->> 'requested_contractor_license', '')), 50), '');
    end if;
  end if;
  if (meta ->> 'agency_id') ~ '^\d{1,4}$' then
    select a.id into v_agency from public.agencies a where a.id = (meta ->> 'agency_id')::smallint;
  end if;
  -- No valid requested role: nothing to approve (public browsing needs no account).
  -- Accounts created by the System Administrator are approved by the API right after.
  -- The role stays NULL for every request, contractor included, until the Admin approves.
  insert into public.profiles (id, email, full_name, role, agency_id, position, requested_role, approval_status, requested_at, review_note,
                               requested_contractor_id, requested_contractor_license)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(meta ->> 'full_name', ''), 120),
    null,
    v_agency,
    nullif(left(coalesce(meta ->> 'position', ''), 120), ''),
    v_req::public.user_role,
    case when v_req is null then 'rejected' else 'pending' end,
    now(),
    case when v_req is null then 'No staff role was requested. Browsing the public portal needs no account.' end,
    v_contractor,
    v_license
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Role helper (private schema: not callable through the REST API)
-- ---------------------------------------------------------------------------
create or replace function private.contractor_company()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.contractor_id
  from public.profiles p
  join public.contractors c on c.id = p.contractor_id
  where p.id = auth.uid()
    and p.role = 'contractor'
    and p.approval_status = 'approved'
    and p.is_active
    and c.is_active
$$;
revoke all on function private.contractor_company() from public;
grant execute on function private.contractor_company() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Contractors read their own company's projects (read only)
-- ---------------------------------------------------------------------------
-- Extra permissive SELECT policies; the "…: staff read" and "…: pacc read" policies are unchanged.
-- The helper is wrapped in (select …) so it runs once per query; for staff and PACC it returns
-- NULL and the contractor policies match nothing.
drop policy if exists "projects: contractor read" on public.projects;
create policy "projects: contractor read" on public.projects
  for select to authenticated using (contractor_id = (select private.contractor_company()));

drop policy if exists "contractors: contractor read" on public.contractors;
create policy "contractors: contractor read" on public.contractors
  for select to authenticated using (id = (select private.contractor_company()));

drop policy if exists "phases: contractor read" on public.project_phases;
create policy "phases: contractor read" on public.project_phases
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = project_phases.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "progress: contractor read" on public.progress_updates;
create policy "progress: contractor read" on public.progress_updates
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = progress_updates.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "financial: contractor read" on public.financial_records;
create policy "financial: contractor read" on public.financial_records
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = financial_records.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "images: contractor read" on public.site_images;
create policy "images: contractor read" on public.site_images
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = site_images.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "history: contractor read" on public.flag_history;
create policy "history: contractor read" on public.flag_history
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = flag_history.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "reviews: contractor read" on public.flag_reviews;
create policy "reviews: contractor read" on public.flag_reviews
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = flag_reviews.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "findings: contractor read" on public.audit_findings;
create policy "findings: contractor read" on public.audit_findings
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = audit_findings.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "documents: contractor read" on public.project_documents;
create policy "documents: contractor read" on public.project_documents
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = project_documents.project_id and p.contractor_id = (select private.contractor_company()))
  );

-- ---------------------------------------------------------------------------
-- 5. The staff-visible PACC case status, out of projects (contractors are the investigated party)
-- ---------------------------------------------------------------------------
create table if not exists public.project_pacc_status (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  case_status text not null check (case_status in ('under_investigation', 'case_filed'))
);
comment on table public.project_pacc_status is
  'Status of a project''s non-closed PACC case, whether or not it is shown to the public (one row per project with such a case). Readable by staff and PACC only; never by contractors or anon. Kept by private.sync_pacc_public_status(); never written directly. Replaces projects.pacc_case_status (027).';

-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.project_pacc_status from anon, authenticated;
grant select on public.project_pacc_status to authenticated;
grant all on public.project_pacc_status to service_role;

alter table public.project_pacc_status enable row level security;

drop policy if exists "pacc status: staff and pacc read" on public.project_pacc_status;
create policy "pacc status: staff and pacc read" on public.project_pacc_status
  for select to authenticated using ((select private.is_staff()) or (select private.is_pacc()));

-- 027's function, now writing project_pacc_status instead of projects.pacc_case_status.
-- projects.pacc_public_status (024, the public portal) is kept exactly as before. Security
-- definer: the trigger must write whoever writes the case. The trigger itself (024: after insert
-- or delete or update of project_id, status, show_public on pacc_cases) is unchanged.
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
    -- v_case: its status, public or not (staff and PACC). v_public: its status only when shown
    -- to the public (unchanged from 024). No row found sets both to NULL.
    select c.status, case when c.show_public then c.status end
      into v_case, v_public
    from public.pacc_cases c
    where c.project_id = v_project
      and c.status in ('under_investigation', 'case_filed')
    limit 1;

    update public.projects p
    set pacc_public_status = v_public
    where p.id = v_project
      and p.pacc_public_status is distinct from v_public;

    if v_case is null then
      delete from public.project_pacc_status s where s.project_id = v_project;
    else
      -- Only while the project exists (not during its own delete); written only when it changes.
      insert into public.project_pacc_status (project_id, case_status)
      select v_project, v_case
      where exists (select 1 from public.projects p where p.id = v_project)
      on conflict (project_id) do update
        set case_status = excluded.case_status
        where public.project_pacc_status.case_status is distinct from excluded.case_status;
    end if;
  end loop;

  return null;
end;
$$;
revoke all on function private.sync_pacc_public_status() from public;

-- Backfill from the current non-closed cases (the same rule as the trigger), and drop stale rows.
insert into public.project_pacc_status (project_id, case_status)
select c.project_id, c.status
from public.pacc_cases c
join public.projects p on p.id = c.project_id
where c.status in ('under_investigation', 'case_filed')
on conflict (project_id) do update
  set case_status = excluded.case_status
  where public.project_pacc_status.case_status is distinct from excluded.case_status;

delete from public.project_pacc_status s
where not exists (
  select 1 from public.pacc_cases c
  where c.project_id = s.project_id
    and c.status in ('under_investigation', 'case_filed')
);

-- The staff view: 027's definition, with pacc_case_status (still the last column) now taken
-- from project_pacc_status. The view is dropped first, because it depends on
-- projects.pacc_case_status, which is then dropped. No other view depends on it. Its grants are
-- set again below, as they are live (authenticated SELECT, service_role ALL, nothing for anon;
-- 002's default privileges would otherwise give anon SELECT on the new view).
drop view if exists public.v_project_summary;
alter table public.projects drop column if exists pacc_case_status;

create view public.v_project_summary with (security_invoker = true) as
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
  ps.case_status as pacc_case_status
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
) img on true
left join public.project_pacc_status ps on ps.project_id = p.id;

revoke all on public.v_project_summary from public, anon;
grant select on public.v_project_summary to authenticated;
grant all on public.v_project_summary to service_role;

-- private.projects_set_updated_at() (027) still lists 'pacc_case_status' among the columns it
-- ignores; with the column gone that entry has no effect, so the function is left unchanged.
