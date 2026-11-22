-- =============================================================================
-- WEEK 3 — 007_week3_images_flags_audit.sql
-- Objective 2: 360° panoramic imaging of actual site conditions.
-- Objective 5: automated flagging of delays and potential discrepancies.
--
--   site_images      360° photos (files in the private 'panoramas' bucket)
--   system_settings  flag thresholds (fixed defaults this week)
--   flag_history     every automatic evaluation / auditor decision (append-only)
--   flag_reviews     auditor confirms or overrides the automatic flag (append-only)
--   audit_findings   findings and corrective actions (evidence in 'audit-evidence')
--
-- The automatic detection runs in the API (server/src/services/flagDetection.js)
-- and stores its result on the project (status, auto_flag, current_flag ...).
-- =============================================================================

create type public.completion_status  as enum ('completed', 'not_completed');
create type public.flag_color         as enum ('green', 'yellow', 'red');
create type public.flag_review_status as enum ('pending', 'confirmed', 'overridden');
create type public.audit_status       as enum ('not_audited', 'under_review', 'verified', 'for_investigation', 'closed');

-- ---------------------------------------------------------------------------
-- Values kept up to date by the automatic detection
-- ---------------------------------------------------------------------------
alter table public.projects
  add column completion_status      public.completion_status  not null default 'not_completed',
  add column planned_progress       numeric(5, 2) not null default 0 check (planned_progress between 0 and 100),
  add column auto_flag              public.flag_color,
  add column auto_flag_reasons      jsonb not null default '[]'::jsonb,
  add column auto_flag_evaluated_at timestamptz,
  -- What users see: the automatic flag, or the auditor's override
  add column current_flag           public.flag_color,
  add column flag_review_status     public.flag_review_status not null default 'pending',
  add column audit_status           public.audit_status not null default 'not_audited';

-- ---------------------------------------------------------------------------
-- Flag thresholds (fixed defaults; an admin settings page can come later)
-- ---------------------------------------------------------------------------
create table public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
create trigger system_settings_updated_at before update on public.system_settings
  for each row execute function public.set_updated_at();

insert into public.system_settings (key, value, description) values
('flag_rules', jsonb_build_object(
   'slippage_green_max',             5,    -- up to 5 points behind schedule = Green
   'slippage_yellow_max',            15,   -- up to 15 points behind = Yellow; more = Red
   'image_max_age_days',             30,   -- latest 360° image older than this = Yellow
   'gps_tolerance_m',                500,  -- photo taken farther than this from the site = Yellow
   'gps_red_m',                      2000, -- farther than this = Red
   'financial_variance_yellow',      10,   -- paid % ahead of work % by more than this = Yellow
   'financial_variance_red',         25,   -- ... by more than this = Red
   'late_completion_tolerance_days', 0,    -- completed after the target date by more than this = Yellow
   'image_date_tolerance_days',      7     -- photo taken more than this many days from its inspection date = Yellow
 ),
 'Thresholds for automatic flag detection (illustrative; align with approved DPWH guidelines).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 360° site images
-- ---------------------------------------------------------------------------
create table public.site_images (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  phase_id         uuid references public.project_phases (id) on delete set null,
  storage_path     text not null unique,            -- path in the 'panoramas' bucket
  file_hash        text not null,                   -- SHA-256, used to detect a photo reused in another project
  mime_type        text not null default 'image/jpeg',
  size_bytes       bigint,
  width            integer,
  height           integer,
  caption          text,
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),
  gps_source       text not null default 'none' check (gps_source in ('exif', 'manual', 'none')),
  captured_at      timestamptz,                     -- from the photo's EXIF (or entered by the uploader)
  inspection_date  date not null,
  is_final         boolean not null default false,  -- final as-built image (needed for "Completed")
  validation       jsonb not null default '{}'::jsonb, -- GPS distance, timestamp and reuse checks
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index site_images_project_idx on public.site_images (project_id, inspection_date desc);
create index site_images_hash_idx on public.site_images (file_hash);
create index site_images_phase_idx on public.site_images (phase_id);
create index site_images_uploaded_by_idx on public.site_images (uploaded_by);

-- ---------------------------------------------------------------------------
-- Flag history, auditor reviews, audit findings
-- ---------------------------------------------------------------------------
create table public.flag_history (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  source             text not null check (source in ('auto', 'auditor')),
  trigger_event      text not null,
  flag               public.flag_color not null,
  completion_status  public.completion_status not null,
  project_status     public.project_status not null,
  reasons            jsonb not null default '[]'::jsonb,
  metrics            jsonb not null default '{}'::jsonb,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index flag_history_project_idx on public.flag_history (project_id, created_at desc);
create index flag_history_created_by_idx on public.flag_history (created_by);

create table public.flag_reviews (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  decision       text not null check (decision in ('confirm', 'override')),
  auto_flag      public.flag_color not null,
  final_flag     public.flag_color not null,
  reason         text not null check (length(trim(reason)) >= 10),
  evidence_path  text,
  auditor_id     uuid not null references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  constraint flag_reviews_override_differs check (decision = 'confirm' or final_flag <> auto_flag),
  constraint flag_reviews_confirm_same     check (decision = 'override' or final_flag = auto_flag)
);
create index flag_reviews_project_idx on public.flag_reviews (project_id, created_at desc);
create index flag_reviews_auditor_idx on public.flag_reviews (auditor_id);

create table public.audit_findings (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  phase_id           uuid references public.project_phases (id) on delete set null,
  title              text not null check (length(trim(title)) >= 5),
  description        text not null check (length(trim(description)) >= 10),
  severity           text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  recommendation     text,
  corrective_action  text,
  action_status      text not null default 'open' check (action_status in ('open', 'in_progress', 'resolved', 'closed')),
  due_date           date,
  evidence_path      text,
  auditor_id         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index audit_findings_project_idx on public.audit_findings (project_id, created_at desc);
create index audit_findings_phase_idx on public.audit_findings (phase_id);
create index audit_findings_auditor_idx on public.audit_findings (auditor_id);
create trigger audit_findings_updated_at before update on public.audit_findings
  for each row execute function public.set_updated_at();

-- History and reviews can never be edited or deleted (only removed with their project)
create or replace function public.prevent_modification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_modification() from public, anon, authenticated;

create trigger flag_history_append_only before update or delete on public.flag_history
  for each row execute function public.prevent_modification();
create trigger flag_reviews_append_only before update or delete on public.flag_reviews
  for each row execute function public.prevent_modification();

-- ---------------------------------------------------------------------------
-- Access: staff read (RLS); writes only through the API (service role)
-- ---------------------------------------------------------------------------
revoke all on public.system_settings, public.site_images, public.flag_history, public.flag_reviews, public.audit_findings from anon;
grant select on public.system_settings, public.site_images, public.flag_history, public.flag_reviews, public.audit_findings to authenticated;
grant select, insert, update, delete on public.system_settings, public.site_images, public.flag_history, public.flag_reviews, public.audit_findings to service_role;

alter table public.system_settings enable row level security;
alter table public.site_images     enable row level security;
alter table public.flag_history    enable row level security;
alter table public.flag_reviews    enable row level security;
alter table public.audit_findings  enable row level security;

create policy "settings: staff read"  on public.system_settings for select to authenticated using ((select private.is_staff()));
create policy "images: staff read"    on public.site_images     for select to authenticated using ((select private.is_staff()));
create policy "history: staff read"   on public.flag_history    for select to authenticated using ((select private.is_staff()));
create policy "reviews: staff read"   on public.flag_reviews    for select to authenticated using ((select private.is_staff()));
create policy "findings: staff read"  on public.audit_findings  for select to authenticated using ((select private.is_staff()));

-- Storage buckets (already created, private): set the accepted file types
update storage.buckets set file_size_limit = 31457280, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'panoramas';
update storage.buckets set file_size_limit = 20971520, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'audit-evidence';

-- ---------------------------------------------------------------------------
-- Views: Week 1–2 columns unchanged; Week 3 columns appended
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
  p.overall_progress,
  coalesce(ph.phase_count, 0)                                   as phase_count,
  coalesce(f.variation_orders, 0)                               as variation_orders,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) as revised_contract_amount,
  coalesce(f.total_obligated, 0)                                as total_obligated,
  coalesce(f.total_disbursed, 0)                                as total_disbursed,
  coalesce(f.total_expenses, 0)                                 as total_expenses,
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) - coalesce(f.total_disbursed, 0) as remaining_balance,
  -- Week 3
  p.completion_status, p.planned_progress, p.auto_flag, p.auto_flag_reasons, p.auto_flag_evaluated_at,
  p.current_flag, p.flag_review_status, p.audit_status,
  coalesce(img.image_count, 0)                                  as image_count,
  img.latest_inspection_date,
  case when coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) > 0
       then round(coalesce(f.total_disbursed, 0) * 100 / (coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0)), 2)
       else 0 end                                               as financial_progress
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (select count(*) as phase_count from public.project_phases x where x.project_id = p.id) ph on true
left join lateral (
  select
    sum(r.amount) filter (where r.record_type = 'variation_order') as variation_orders,
    sum(r.amount) filter (where r.record_type = 'obligation')      as total_obligated,
    sum(r.amount) filter (where r.record_type = 'disbursement')    as total_disbursed,
    sum(r.amount) filter (where r.record_type = 'expense')         as total_expenses
  from public.financial_records r where r.project_id = p.id
) f on true
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id
) img on true;

grant select on public.v_project_summary to authenticated, service_role;

-- Public portal view (read by the API with the service role after sign-in).
-- The flag is shown to the public only after an auditor has reviewed it.
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
  -- Week 3
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
  from public.site_images i where i.project_id = p.id
) img on true;

revoke all on public.v_public_projects from anon, authenticated;
grant select on public.v_public_projects to service_role;
