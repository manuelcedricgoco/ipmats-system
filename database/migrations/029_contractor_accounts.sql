-- =============================================================================
-- 029 — Contractor accounts: a contractor company's representatives update their own projects
--
-- Apply AFTER 028 (it adds the 'contractor' role value this file uses) and BEFORE deploying the
-- API that reads profiles.contractor_id (the sign-in check selects it for every account).
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
--
-- Access (read only; writes go through the API, as everywhere else):
--   * Extra permissive "…: contractor read" SELECT policies next to the existing "…: staff read"
--     and "…: pacc read" ones: projects (contractor_id = the company), contractors (the company's
--     own row) and, for projects of the company, project_phases, progress_updates,
--     financial_records, site_images, flag_history, flag_reviews, audit_findings and
--     project_documents. Grants: authenticated already has SELECT on these tables (002, 007, 010).
--   * v_project_summary (security_invoker) needs no change: the policies above let a contractor
--     read its own projects' rows (municipalities, barangays and agencies are readable by all).
--     projects.pacc_case_status is a column of those rows; column grants cannot differ between
--     staff and contractors (both are 'authenticated'), so the API strips it from every
--     response to a contractor account.
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
