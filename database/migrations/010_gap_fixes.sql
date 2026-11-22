-- =============================================================================
-- 010 — Gaps between the concept document and the system
--
--  1. activity_logs           Activity and Audit Logs panel (who did what, when) — append-only
--  2. system_settings         who last changed the flag rules (Admin settings page)
--  3. flag_reviews            an override must have supporting evidence
--  4. project_documents       supporting project documents uploaded by DPWH personnel
--  5. site_images / audit_findings.is_public
--                             the public sees only photos and findings approved for disclosure
--  6. financial_records.phase_id   financial allocation per construction phase
--  7. audit_findings.assigned_to   findings / corrective actions assigned to DPWH personnel
--
-- Existing data is kept: existing photos stay visible to the public (is_public = true),
-- new photos and all findings start hidden until an Auditor or Admin approves them.
-- =============================================================================

-- 1. Activity log --------------------------------------------------------------
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  actor_role  text,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id   text,
  project_id  uuid references public.projects(id) on delete set null,
  summary     text not null check (char_length(summary) between 3 and 500),
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.activity_logs is 'Who did what and when (projects, phases, finance, photos, documents, flags, findings, users, settings). Append-only.';
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_id, created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);
create index if not exists activity_logs_project_idx on public.activity_logs (project_id);

drop trigger if exists activity_logs_append_only on public.activity_logs;
create trigger activity_logs_append_only before update or delete on public.activity_logs
  for each row execute function public.prevent_modification();

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;
grant select, insert on public.activity_logs to service_role;
drop policy if exists "activity: admin and auditor read" on public.activity_logs;
create policy "activity: admin and auditor read" on public.activity_logs for select to authenticated
  using ((select private.app_role()) in ('admin', 'auditor'));

-- 2. Flag rules: who changed them --------------------------------------------
alter table public.system_settings add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- 3. An override needs supporting evidence -----------------------------------
alter table public.flag_reviews drop constraint if exists flag_reviews_override_needs_evidence;
alter table public.flag_reviews add constraint flag_reviews_override_needs_evidence
  check (decision <> 'override' or evidence_path is not null);

-- 4. Supporting project documents --------------------------------------------
create table if not exists public.project_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  phase_id      uuid references public.project_phases(id) on delete set null,
  title         text not null check (char_length(title) between 3 and 200),
  doc_type      text not null check (doc_type in ('contract', 'program_of_work', 'progress_report', 'inspection_report', 'variation_order', 'payment_document', 'as_built_plan', 'other')),
  description   text check (char_length(description) <= 2000),
  document_date date,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer not null check (size_bytes > 0),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists project_documents_project_idx on public.project_documents (project_id, created_at desc);

alter table public.project_documents enable row level security;
revoke all on public.project_documents from anon, authenticated;
grant select on public.project_documents to authenticated;
grant select, insert, update, delete on public.project_documents to service_role;
drop policy if exists "documents: staff read" on public.project_documents;
create policy "documents: staff read" on public.project_documents for select to authenticated using ((select private.is_staff()));

update storage.buckets
  set file_size_limit = 26214400,
      allowed_mime_types = array[
        'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
  where id = 'project-documents';

-- 5. Public disclosure of photos and findings --------------------------------
alter table public.site_images
  add column if not exists is_public boolean not null default false,
  add column if not exists public_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists public_reviewed_at timestamptz;
-- photos uploaded before this change stay visible, so the portal is not suddenly empty
update public.site_images set is_public = true where public_reviewed_at is null and created_at < now();

alter table public.audit_findings
  add column if not exists is_public boolean not null default false,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists published_at timestamptz;

-- 6. Financial allocation per construction phase ------------------------------
alter table public.financial_records add column if not exists phase_id uuid references public.project_phases(id) on delete set null;
create index if not exists financial_records_phase_idx on public.financial_records (phase_id);

-- 7. Findings assigned to DPWH personnel --------------------------------------
alter table public.audit_findings
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists action_updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists action_updated_at timestamptz;
create index if not exists audit_findings_assigned_idx on public.audit_findings (assigned_to);

-- Public view: photo count and latest inspection come from photos approved for the public
create or replace view public.v_public_projects with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status,
  p.approved_budget, p.contract_amount, p.notice_to_proceed, p.duration_days,
  p.target_completion_date, p.actual_completion_date, p.fund_source,
  p.latitude, p.longitude, p.updated_at, p.overall_progress,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name,
  p.contractor_id, c.name as contractor_name,
  coalesce(ph.phase_count, 0)                                        as phase_count,
  coalesce(f.variation_orders, 0)                                    as variation_orders,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0)   as revised_contract_amount,
  coalesce(f.total_disbursed, 0)                                     as total_disbursed,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) - coalesce(f.total_disbursed, 0) as remaining_balance,
  case when p.flag_review_status in ('confirmed', 'overridden') then p.current_flag end as public_flag,
  p.flag_review_status,
  coalesce(img.image_count, 0)                                       as image_count,
  img.latest_inspection_date
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (select count(*) as phase_count from public.project_phases x where x.project_id = p.id) ph on true
left join lateral (
  select
    sum(r.amount) filter (where r.record_type = 'variation_order') as variation_orders,
    sum(r.amount) filter (where r.record_type = 'disbursement')    as total_disbursed
  from public.financial_records r where r.project_id = p.id
) f on true
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;

revoke all on public.v_public_projects from anon, authenticated;
grant select on public.v_public_projects to service_role;
