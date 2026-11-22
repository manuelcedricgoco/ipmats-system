-- =============================================================================
-- 016 — Open the public portal again (reverses 006_public_requires_login)
--
-- Public visitors need no account: the portal is read by the anonymous role
-- (`anon`, the publishable key) and Row Level Security decides what it sees.
--
-- What 006 did (applied 2026-11-18) and how it is reversed here:
--   * dropped the anon read policies of 005 on projects, contractors,
--     project_phases, progress_updates and financial_records
--       -> re-created ONLY for the tables the public portal reads now
--          (projects, contractors) plus a new one for public 360° images.
--          Phases, progress reports and finances are no longer shown publicly,
--          so they stay staff-only.
--   * revoked the anon column grants of 005 on those five tables and the anon
--     grant on v_public_projects
--       -> anon gets column-level SELECT again on projects and contractors
--          (internal columns stay hidden) and SELECT on the rebuilt public view.
--   * 006 created no policies of its own, so there is nothing of 006 to drop.
--
-- RLS stays ENABLED on every table. Every policy below is SELECT-only.
--
-- Public-facing (what the portal API reads as anon):
--   projects (safe columns), contractors (id, name), site_images (only rows
--   approved for the public), agencies, municipalities, barangays (reference
--   lists, already readable since 002), and the view v_public_projects.
-- Staff-only (anon has NO grant and NO policy): profiles, activity_logs,
--   audit_findings, flag_history, flag_reviews, project_documents,
--   project_phases, progress_updates, financial_records, system_settings and
--   the staff view v_project_summary. Grants that existed on profiles and
--   v_project_summary are revoked (no anon policy let rows through, but the
--   grants should not exist).
-- =============================================================================

grant usage on schema public to anon;

-- ---------------------------------------------------------------- staff-only
revoke all on public.profiles, public.activity_logs, public.audit_findings,
              public.flag_history, public.flag_reviews, public.project_documents,
              public.project_phases, public.progress_updates, public.financial_records,
              public.system_settings, public.v_project_summary
  from anon;

-- ---------------------------------------------------------------- public-facing
-- Start from nothing on these three, then grant only the columns the portal shows.
revoke all on public.projects, public.contractors, public.site_images from anon;

grant select (id, project_code, name, description, project_type, status, contract_amount,
              notice_to_proceed, duration_days, target_completion_date, actual_completion_date,
              latitude, longitude, municipality_id, barangay_id, agency_id, contractor_id,
              overall_progress, updated_at)
  on public.projects to anon;
grant select (id, name) on public.contractors to anon;
grant select (id, project_id, storage_path, caption, inspection_date, is_final, is_public)
  on public.site_images to anon;
grant select on public.agencies, public.municipalities, public.barangays to anon;

drop policy if exists "projects: public read" on public.projects;
create policy "projects: public read" on public.projects
  for select to anon using (true);

drop policy if exists "contractors: public read" on public.contractors;
create policy "contractors: public read" on public.contractors
  for select to anon using (true);

drop policy if exists "images: public read" on public.site_images;
create policy "images: public read" on public.site_images
  for select to anon using (is_public);

-- agencies, municipalities, barangays: policy "reference: read all" (anon, authenticated) from 002.

-- ---------------------------------------------------------------- public view
-- Rebuilt for the new portal: no flags, no finances, no phases (staff-only data).
drop view if exists public.v_public_projects;
create view public.v_public_projects with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status, p.contract_amount,
  p.notice_to_proceed, p.duration_days, p.target_completion_date, p.actual_completion_date,
  p.latitude, p.longitude, p.overall_progress, p.updated_at,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name,
  p.contractor_id, c.name as contractor_name,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;

revoke all on public.v_public_projects from public, anon, authenticated, service_role;
grant select on public.v_public_projects to anon, service_role;
