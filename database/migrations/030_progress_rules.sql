-- =============================================================================
-- 030 — Progress rules: sub-activities, reference photos, verified 100%
--
-- Apply BEFORE deploying the API of the progress-rules PR (it reads every new column and table
-- below). Additive only: the API before it keeps working with 030 applied.
-- Design: docs/superpowers/specs/2026-11-28-progress-rules-design.md
--
--   phase_activities          Sub-activities of a construction phase (name, weight, accomplishment).
--                             The weights of a phase total 100 (checked by the API); the phase's
--                             accomplishment is then Σ(weight × accomplishment) ÷ 100, kept by the
--                             API. A phase without sub-activities keeps its own %. Defined by DPWH
--                             Personnel in the phase plan.
--   progress_updates.description      What was done (the API requires 10–2000 characters on new
--                             reports; reports from before 030 have NULL).
--   progress_updates.activity_snapshot  The sub-activity values at the report ([] when none).
--   progress_photos           1–5 reference photos of each new progress report (files in the
--                             private 'progress-photos' bucket, stored as uploaded).
--   projects.completed_at     When the project last became Completed (set and cleared by the API's
--                             automatic evaluation with the status).
--   projects.completion_verified_at  When both the Auditor and PACC had verified the completion
--                             (after completed_at). Until then the stored overall progress of a
--                             Completed project is at most 99% ("Completed – awaiting
--                             verification"); after it, 100% ("Completed – verified") and the
--                             project's progress, phase plan and 360° photos are locked (API).
--   completion_verifications  Every Auditor / PACC decision on a completion ('verified', or
--                             'not_yet' with a reason). Append-only. A PACC row names no member
--                             (verified_by NULL, verifier_name 'PACC'): the contractor reads it.
--
-- Access (read only; writes go through the API, as everywhere else):
--   * phase_activities, progress_photos and completion_verifications: staff
--     (private.is_staff()), PACC (private.is_pacc()) and the project's contractor
--     (private.contractor_company(), 029) read them through RLS, like project_phases and
--     progress_updates (004, 024, 029). anon gets no grant at all.
--   * The public sees only the label: projects.completion_verified_at gets an anon column grant
--     and is appended to v_public_projects (CREATE OR REPLACE VIEW only allows appending; the
--     other columns, security_invoker and grants are unchanged from 024). completed_at and
--     completion_verified_at are appended to the staff view v_project_summary (029's definition;
--     grants unchanged).
--   * Storage: one new private bucket, no storage policies; only the API reads or writes files
--     and hands out short-lived signed links.
--
-- Data: projects already Completed get completed_at = now() (no verification exists yet), and
-- every stored overall progress above 99% (projects and report history) becomes 99%: nothing is
-- verified yet, so nothing may show 100%.
--
-- Idempotent: safe to run again (if not exists, create or replace, drop … if exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Sub-activities of a phase
-- ---------------------------------------------------------------------------
create table if not exists public.phase_activities (
  id             uuid primary key default gen_random_uuid(),
  phase_id       uuid not null references public.project_phases (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  sequence_no    smallint not null check (sequence_no between 1 and 1100),
  name           text not null check (char_length(name) between 2 and 120),
  weight         numeric(5, 2) not null check (weight > 0 and weight <= 100),
  accomplishment numeric(5, 2) not null default 0 check (accomplishment between 0 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint phase_activities_sequence_unique unique (phase_id, sequence_no)
);
comment on table public.phase_activities is
  'Sub-activities of a construction phase. Weights of a phase total 100 (API); the phase''s accomplishment is the weighted sub-activity accomplishment (API). Readable by staff, PACC and the project''s contractor; written only by the API.';
create index if not exists phase_activities_project_idx on public.phase_activities (project_id);

drop trigger if exists phase_activities_updated_at on public.phase_activities;
create trigger phase_activities_updated_at before update on public.phase_activities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Progress reports: description and sub-activity snapshot
-- ---------------------------------------------------------------------------
alter table public.progress_updates
  add column if not exists description text,
  add column if not exists activity_snapshot jsonb not null default '[]'::jsonb;

alter table public.progress_updates drop constraint if exists progress_updates_description_check;
alter table public.progress_updates
  add constraint progress_updates_description_check
  check (description is null or char_length(description) <= 2000);

comment on column public.progress_updates.description is
  'What was done (required by the API on new reports, 10–2000 characters; NULL on reports from before 030).';
comment on column public.progress_updates.activity_snapshot is
  'Sub-activity values at the report: [{ activity_id, phase_id, sequence_no, name, weight, accomplishment }].';

-- ---------------------------------------------------------------------------
-- 3. Reference photos of a progress report
-- ---------------------------------------------------------------------------
create table if not exists public.progress_photos (
  id                 uuid primary key default gen_random_uuid(),
  progress_update_id uuid not null references public.progress_updates (id) on delete cascade,
  project_id         uuid not null references public.projects (id) on delete cascade,
  storage_path       text not null unique,       -- '<project_id>/<progress_update_id>/<uuid>.<ext>' in 'progress-photos'
  size_bytes         integer not null check (size_bytes > 0),
  uploaded_by        uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
comment on table public.progress_photos is
  'Reference photos of a progress report (files in the private progress-photos bucket). Readable by staff, PACC and the project''s contractor; written only by the API.';
create index if not exists progress_photos_update_idx on public.progress_photos (progress_update_id);
create index if not exists progress_photos_project_idx on public.progress_photos (project_id);
create index if not exists progress_photos_uploaded_by_idx on public.progress_photos (uploaded_by);

-- ---------------------------------------------------------------------------
-- 4. Completion and its verification
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists completed_at timestamptz,
  add column if not exists completion_verified_at timestamptz;

comment on column public.projects.completed_at is
  'When the project last became Completed (set by the API when the status becomes completed, cleared when it leaves). Verifications count only when made after it.';
comment on column public.projects.completion_verified_at is
  'When both the Auditor and PACC had verified the completion. Until set, the overall progress of a Completed project is at most 99%; once set, 100% and its progress and photos are locked.';

create table if not exists public.completion_verifications (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  verifier_role text not null check (verifier_role in ('auditor', 'pacc')),
  decision      text not null check (decision in ('verified', 'not_yet')),
  note          text check (char_length(note) <= 500),
  verified_by   uuid references public.profiles (id) on delete set null,  -- the auditor; NULL for PACC
  verifier_name text,                                -- the auditor's name, copied; 'PACC' for PACC
  created_at    timestamptz not null default now(),
  constraint completion_verifications_not_yet_note check (decision <> 'not_yet' or coalesce(char_length(note), 0) >= 5),
  -- A PACC decision names no PACC member: the project's contractor (possibly the investigated
  -- party) reads this history. The member is recorded in pacc_activity only.
  constraint completion_verifications_pacc_anonymous check (verifier_role <> 'pacc' or (verified_by is null and verifier_name = 'PACC'))
);
comment on table public.completion_verifications is
  'Auditor and PACC decisions on a project''s completion (verified, or not yet with a reason). Append-only. Readable by staff, PACC and the project''s contractor; never by anon.';
create index if not exists completion_verifications_project_idx on public.completion_verifications (project_id, created_at desc);
create index if not exists completion_verifications_verified_by_idx on public.completion_verifications (verified_by);

drop trigger if exists completion_verifications_append_only on public.completion_verifications;
create trigger completion_verifications_append_only before update or delete on public.completion_verifications
  for each row execute function public.prevent_modification();

-- ---------------------------------------------------------------------------
-- 5. Access to the new tables: staff, PACC and the project's contractor read (RLS)
-- ---------------------------------------------------------------------------
-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.phase_activities, public.progress_photos, public.completion_verifications from anon, authenticated;
grant select on public.phase_activities, public.progress_photos, public.completion_verifications to authenticated;
grant all on public.phase_activities, public.progress_photos, public.completion_verifications to service_role;

alter table public.phase_activities         enable row level security;
alter table public.progress_photos          enable row level security;
alter table public.completion_verifications enable row level security;

drop policy if exists "activities: staff read" on public.phase_activities;
create policy "activities: staff read" on public.phase_activities
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "activities: pacc read" on public.phase_activities;
create policy "activities: pacc read" on public.phase_activities
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "activities: contractor read" on public.phase_activities;
create policy "activities: contractor read" on public.phase_activities
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = phase_activities.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "progress photos: staff read" on public.progress_photos;
create policy "progress photos: staff read" on public.progress_photos
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "progress photos: pacc read" on public.progress_photos;
create policy "progress photos: pacc read" on public.progress_photos
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "progress photos: contractor read" on public.progress_photos;
create policy "progress photos: contractor read" on public.progress_photos
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = progress_photos.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "verifications: staff read" on public.completion_verifications;
create policy "verifications: staff read" on public.completion_verifications
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "verifications: pacc read" on public.completion_verifications;
create policy "verifications: pacc read" on public.completion_verifications
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "verifications: contractor read" on public.completion_verifications;
create policy "verifications: contractor read" on public.completion_verifications
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = completion_verifications.project_id and p.contractor_id = (select private.contractor_company()))
  );

-- ---------------------------------------------------------------------------
-- 6. Existing data: nothing is verified yet, so nothing shows 100%
-- ---------------------------------------------------------------------------
update public.projects
set completed_at = now()
where status = 'completed' and completed_at is null;

update public.projects
set overall_progress = 99
where completion_verified_at is null and overall_progress > 99;

update public.progress_updates u
set overall_progress = 99
where u.overall_progress > 99
  and not exists (select 1 from public.projects p where p.id = u.project_id and p.completion_verified_at is not null);

-- ---------------------------------------------------------------------------
-- 7. The public sees whether a Completed project is verified (label only)
-- ---------------------------------------------------------------------------
grant select (completion_verified_at) on public.projects to anon;

-- Public view: 024's definition with completion_verified_at appended at the end.
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
  p.pacc_public_status,
  p.completion_verified_at
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;

-- Staff view: 029's definition with completed_at and completion_verified_at appended at the end.
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
  ps.case_status as pacc_case_status,
  p.completed_at,
  p.completion_verified_at
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

-- ---------------------------------------------------------------------------
-- 8. Storage bucket (private; only the API reads or writes it)
-- ---------------------------------------------------------------------------
-- Reference photos are stored as uploaded (JPEG, PNG or WebP, at most 10 MB each).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
