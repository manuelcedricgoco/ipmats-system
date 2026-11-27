-- =============================================================================
-- 024 — PACC portal and anonymous citizen reports ("Magsumbong")
--
-- Apply AFTER 023 (it adds the 'pacc' role value this file uses).
-- Design: docs/superpowers/specs/2026-11-27-pacc-portal-design.md
--
--   citizen_reports       anonymous problem reports from the public portal
--   citizen_report_files  proof photos (files in the private 'citizen-reports' bucket)
--   pacc_cases            cases PACC records on a project (respondents, charges, status)
--   pacc_case_notes       notes on a case (append-only)
--   pacc_case_documents   case documents (files in the private 'pacc-case-documents' bucket)
--   pacc_activity         PACC's own activity log (append-only). PACC actions never go to
--                         activity_logs, which Admins and Auditors can read.
--
-- PACC records survive a project delete: pacc_cases.project_id and citizen_reports.project_id
-- are set to NULL (not cascaded), and both tables keep a snapshot of the project code and name
-- (project_code, project_name), taken by the API when the case is opened / the report submitted.
--
-- Anonymity: a report stores no account, IP, user agent, session or exact time. It keeps the
-- submission DATE only (submitted_on, Asia/Manila, set by the API) and the HMAC of its tracking
-- code. citizen_reports and citizen_report_files have no timestamptz column on purpose.
--
-- Access:
--   * The new tables are readable ONLY by an active, approved PACC account
--     (private.is_pacc()). Admin, Auditor and DPWH Personnel get no policy on them, and anon
--     gets no grant at all. Writes go through the API (service role), as everywhere else.
--   * PACC gets read-only access to the project records it investigates: an extra permissive
--     "…: pacc read" policy next to each existing "…: staff read" policy, plus activity_logs
--     rows tied to a project. 'pacc' is NOT added to private.is_staff().
--   * The public sees a case's STATUS only, and only when PACC switches it on:
--     projects.pacc_public_status ('under_investigation' | 'case_filed' | NULL), kept by a
--     security-definer trigger on pacc_cases. anon gets a column grant on that one column; it
--     is appended to v_public_projects (CREATE OR REPLACE VIEW only allows appending; the
--     view's other columns, security_invoker and grants are unchanged from 021).
--
-- Storage: two new private buckets. There are no storage policies; only the API (service role)
-- reads or writes files, and it hands out short-lived signed links.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role helpers (private schema: not callable through the REST API)
-- ---------------------------------------------------------------------------
create or replace function private.is_pacc()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.app_role() = 'pacc', false)
$$;

-- Staff or PACC: anyone who may read the project records of an investigation.
create or replace function private.can_investigate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or private.is_pacc()
$$;

revoke all on function private.is_pacc() from public;
revoke all on function private.can_investigate() from public;
grant execute on function private.is_pacc() to authenticated, service_role;
grant execute on function private.can_investigate() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Cases
-- ---------------------------------------------------------------------------
create table if not exists public.pacc_cases (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references public.projects (id) on delete set null,  -- NULL once the project is deleted
  project_code      text not null,                   -- snapshot taken when the case is opened
  project_name      text not null,                   -- snapshot taken when the case is opened
  contractor_id     uuid references public.contractors(id) on delete set null,
  other_respondents text check (char_length(other_respondents) <= 1000),  -- officials named as free text
  charges           text not null check (char_length(charges) between 10 and 4000),
  status            text not null default 'under_investigation'
                      check (status in ('under_investigation', 'case_filed', 'resolved', 'dismissed')),
  show_public       boolean not null default false,  -- show the status (only) on the public portal
  opened_by         uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  closed_at         timestamptz                      -- set when resolved or dismissed
);
comment on table public.pacc_cases is 'Cases PACC records on a project. At most one non-closed case per project. Kept (with the project code and name) when the project is deleted. Readable only by PACC.';
create index if not exists pacc_cases_project_idx on public.pacc_cases (project_id, created_at desc);
create index if not exists pacc_cases_contractor_idx on public.pacc_cases (contractor_id);
create index if not exists pacc_cases_opened_by_idx on public.pacc_cases (opened_by);
-- Only one open case per project, so the public status is never ambiguous
-- (two PACC members opening a case at the same moment: the second insert fails with 23505).
-- Cases whose project was deleted have project_id NULL; NULLs never collide in a unique index.
create unique index if not exists pacc_cases_one_open_per_project
  on public.pacc_cases (project_id)
  where status in ('under_investigation', 'case_filed');

drop trigger if exists pacc_cases_updated_at on public.pacc_cases;
create trigger pacc_cases_updated_at before update on public.pacc_cases
  for each row execute function public.set_updated_at();

create table if not exists public.pacc_case_notes (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.pacc_cases(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  author_id  uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
comment on table public.pacc_case_notes is 'Notes on a PACC case. Append-only. Readable only by PACC.';
create index if not exists pacc_case_notes_case_idx on public.pacc_case_notes (case_id, created_at);
create index if not exists pacc_case_notes_author_idx on public.pacc_case_notes (author_id);

drop trigger if exists pacc_case_notes_append_only on public.pacc_case_notes;
create trigger pacc_case_notes_append_only before update or delete on public.pacc_case_notes
  for each row execute function public.prevent_modification();

create table if not exists public.pacc_case_documents (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.pacc_cases(id) on delete cascade,
  title        text not null check (char_length(title) between 3 and 200),
  storage_path text not null unique,                 -- path in the 'pacc-case-documents' bucket
  file_name    text not null,
  mime_type    text not null,
  size_bytes   integer not null check (size_bytes > 0),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
comment on table public.pacc_case_documents is 'Documents of a PACC case (files in the private pacc-case-documents bucket). Readable only by PACC.';
create index if not exists pacc_case_documents_case_idx on public.pacc_case_documents (case_id, created_at desc);
create index if not exists pacc_case_documents_uploaded_by_idx on public.pacc_case_documents (uploaded_by);

-- ---------------------------------------------------------------------------
-- 3. Anonymous citizen reports (no timestamptz columns: date only)
-- ---------------------------------------------------------------------------
create table if not exists public.citizen_reports (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects (id) on delete set null,  -- NULL once the project is deleted
  project_code  text not null,                       -- snapshot taken when the report is submitted
  project_name  text not null,                       -- snapshot taken when the report is submitted
  category      text not null
                  check (category in ('photo_mismatch', 'substandard_materials', 'overpricing_or_ghost', 'work_not_done', 'other')),
  description   text not null check (char_length(description) between 20 and 2000),
  status        text not null default 'received' check (status in ('received', 'under_review', 'closed')),
  outcome       text check (outcome in ('valid', 'invalid', 'duplicate')),  -- set when PACC closes it
  case_id       uuid references public.pacc_cases(id) on delete set null,
  tracking_hash text not null unique check (tracking_hash ~ '^[0-9a-f]{64}$'),  -- HMAC-SHA256 of the tracking code
  submitted_on  date not null,                       -- Asia/Manila date only, never the time
  constraint citizen_reports_outcome_when_closed check (outcome is null or status = 'closed')
);
comment on table public.citizen_reports is 'Anonymous problem reports from the public portal. Stores no reporter identity and no exact time. Kept (with the project code and name) when the project is deleted. Readable only by PACC.';
create index if not exists citizen_reports_project_idx on public.citizen_reports (project_id, status);
create index if not exists citizen_reports_case_idx on public.citizen_reports (case_id);

create table if not exists public.citizen_report_files (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.citizen_reports(id) on delete cascade,
  storage_path text not null unique,                 -- '<report_id>/<uuid>.jpg' in the 'citizen-reports' bucket
  size_bytes   integer not null check (size_bytes > 0)
);
comment on table public.citizen_report_files is 'Proof photos of a citizen report, re-encoded without metadata. Readable only by PACC.';
create index if not exists citizen_report_files_report_idx on public.citizen_report_files (report_id);

-- ---------------------------------------------------------------------------
-- 4. PACC activity log (separate from activity_logs; append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.pacc_activity (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id   text,
  project_id  uuid references public.projects(id) on delete set null,
  summary     text not null check (char_length(summary) between 3 and 500),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.pacc_activity is 'Who in PACC did what and when (cases, reports, members). Append-only. Readable only by PACC.';
create index if not exists pacc_activity_created_idx on public.pacc_activity (created_at desc);
create index if not exists pacc_activity_actor_idx on public.pacc_activity (actor_id, created_at desc);
create index if not exists pacc_activity_project_idx on public.pacc_activity (project_id);

drop trigger if exists pacc_activity_append_only on public.pacc_activity;
create trigger pacc_activity_append_only before update or delete on public.pacc_activity
  for each row execute function public.prevent_modification();

-- ---------------------------------------------------------------------------
-- 5. Access to the new tables: PACC read only (RLS); writes only through the API
-- ---------------------------------------------------------------------------
-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.pacc_cases, public.pacc_case_notes, public.pacc_case_documents,
              public.citizen_reports, public.citizen_report_files, public.pacc_activity
  from anon, authenticated;
grant select on public.pacc_cases, public.pacc_case_notes, public.pacc_case_documents,
                public.citizen_reports, public.citizen_report_files, public.pacc_activity
  to authenticated;
grant select, insert, update, delete on public.pacc_cases, public.pacc_case_notes, public.pacc_case_documents,
                                        public.citizen_reports, public.citizen_report_files, public.pacc_activity
  to service_role;

alter table public.pacc_cases           enable row level security;
alter table public.pacc_case_notes      enable row level security;
alter table public.pacc_case_documents  enable row level security;
alter table public.citizen_reports      enable row level security;
alter table public.citizen_report_files enable row level security;
alter table public.pacc_activity        enable row level security;

drop policy if exists "cases: pacc read" on public.pacc_cases;
create policy "cases: pacc read" on public.pacc_cases
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "case notes: pacc read" on public.pacc_case_notes;
create policy "case notes: pacc read" on public.pacc_case_notes
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "case documents: pacc read" on public.pacc_case_documents;
create policy "case documents: pacc read" on public.pacc_case_documents
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "reports: pacc read" on public.citizen_reports;
create policy "reports: pacc read" on public.citizen_reports
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "report files: pacc read" on public.citizen_report_files;
create policy "report files: pacc read" on public.citizen_report_files
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "pacc activity: pacc read" on public.pacc_activity;
create policy "pacc activity: pacc read" on public.pacc_activity
  for select to authenticated using ((select private.is_pacc()));

-- ---------------------------------------------------------------------------
-- 6. PACC reads the project records it investigates (read only)
-- ---------------------------------------------------------------------------
-- Extra permissive SELECT policies; the existing "…: staff read" policies are unchanged.
-- Grants: authenticated already has SELECT on these tables (002, 007, 010).
drop policy if exists "projects: pacc read" on public.projects;
create policy "projects: pacc read" on public.projects
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "contractors: pacc read" on public.contractors;
create policy "contractors: pacc read" on public.contractors
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "phases: pacc read" on public.project_phases;
create policy "phases: pacc read" on public.project_phases
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "progress: pacc read" on public.progress_updates;
create policy "progress: pacc read" on public.progress_updates
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "financial: pacc read" on public.financial_records;
create policy "financial: pacc read" on public.financial_records
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "images: pacc read" on public.site_images;
create policy "images: pacc read" on public.site_images
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "history: pacc read" on public.flag_history;
create policy "history: pacc read" on public.flag_history
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "reviews: pacc read" on public.flag_reviews;
create policy "reviews: pacc read" on public.flag_reviews
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "findings: pacc read" on public.audit_findings;
create policy "findings: pacc read" on public.audit_findings
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "documents: pacc read" on public.project_documents;
create policy "documents: pacc read" on public.project_documents
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "settings: pacc read" on public.system_settings;
create policy "settings: pacc read" on public.system_settings
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "profiles: pacc read" on public.profiles;
create policy "profiles: pacc read" on public.profiles
  for select to authenticated using ((select private.is_pacc()));
-- Investigation history: only log entries tied to a project (not user or settings changes).
drop policy if exists "activity: pacc read" on public.activity_logs;
create policy "activity: pacc read" on public.activity_logs
  for select to authenticated using ((select private.is_pacc()) and project_id is not null);

-- v_project_summary (security_invoker, granted to authenticated in 002/007) needs no change:
-- the policies above let PACC read it.

-- ---------------------------------------------------------------------------
-- 7. Public case status on the project (the only PACC data the public sees)
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists pacc_public_status text
  check (pacc_public_status in ('under_investigation', 'case_filed'));

comment on column public.projects.pacc_public_status is
  'Case status shown on the public portal: the status of the project''s non-closed PACC case when PACC switched "show to public" on, otherwise NULL. Kept by the trigger on pacc_cases; never written directly.';

grant select (pacc_public_status) on public.projects to anon;

-- Security definer: the trigger must update projects whoever writes the case (the API writes
-- with the service role, but this keeps it working for any writer).
create or replace function private.sync_pacc_public_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projects uuid[];
  v_project  uuid;
  v_status   text;
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
    -- No row found sets v_status to NULL.
    select c.status into v_status
    from public.pacc_cases c
    where c.project_id = v_project
      and c.show_public
      and c.status in ('under_investigation', 'case_filed')
    limit 1;

    update public.projects p
    set pacc_public_status = v_status
    where p.id = v_project
      and p.pacc_public_status is distinct from v_status;
  end loop;

  return null;
end;
$$;
revoke all on function private.sync_pacc_public_status() from public;

drop trigger if exists pacc_cases_sync_public_status on public.pacc_cases;
create trigger pacc_cases_sync_public_status
  after insert or delete or update of project_id, status, show_public on public.pacc_cases
  for each row execute function private.sync_pacc_public_status();

-- Public view: 021 definition with pacc_public_status appended at the end.
create or replace view public.v_public_projects with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status, p.contract_amount,
  p.notice_to_proceed, p.duration_days, p.target_completion_date, p.actual_completion_date,
  p.latitude, p.longitude, p.overall_progress, p.updated_at,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name,
  p.contractor_id, c.name as contractor_name,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date,
  p.public_flag,
  p.pacc_public_status
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;

-- ---------------------------------------------------------------------------
-- 8. Storage buckets (private; only the API reads or writes them)
-- ---------------------------------------------------------------------------
-- citizen-reports holds JPEG only: the API re-encodes every proof photo as a JPEG without metadata.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('citizen-reports', 'citizen-reports', false, 10485760, array['image/jpeg']),
  ('pacc-case-documents', 'pacc-case-documents', false, 26214400,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
