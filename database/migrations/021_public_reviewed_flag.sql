-- =============================================================================
-- 021 — The public portal shows a project's flag once an auditor has reviewed it
--
-- Until now the portal showed no flag at all (016). Decision (25–27 Nov 2026): the public sees
-- Green / Yellow / Red only after an Auditor or Admin has confirmed or overridden the automatic
-- flag; before that the portal says "Under review". Unreviewed automatic flags stay staff-only.
--
-- projects.public_flag is a GENERATED column, so the database itself guarantees it:
--   current_flag  when flag_review_status is 'confirmed' or 'overridden'
--   NULL          otherwise ('pending': never reviewed, or the automatic flag changed since)
-- anon gets a column grant on public_flag ONLY. current_flag, auto_flag, the reasons and the
-- review status stay unreadable for anon, also when Supabase is queried directly with the
-- publishable key.
--
-- v_public_projects gets public_flag appended at the end (CREATE OR REPLACE VIEW only allows
-- appending); its columns, security_invoker and grants are otherwise unchanged from 016.
-- =============================================================================

alter table public.projects
  add column if not exists public_flag public.flag_color
  generated always as (
    case when flag_review_status in ('confirmed', 'overridden') then current_flag end
  ) stored;

comment on column public.projects.public_flag is
  'Flag shown on the public portal: current_flag once an auditor has confirmed or overridden it, otherwise NULL ("Under review"). Generated; never written directly.';

grant select (public_flag) on public.projects to anon;

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
  p.public_flag
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;
