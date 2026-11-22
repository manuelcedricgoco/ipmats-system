-- =============================================================================
-- 014 — Reverse 013_data_provenance
--
-- 013 was applied, so it is reversed here instead of deleting the file.
-- Removes everything 013 added:
--   * projects / financial_records / project_documents: has_dummy_details, data_source
--   * contractors / agencies: data_source
--   * site_images: source_url, source_author, source_license, is_representative
--   * index projects_has_dummy_details_idx
-- The two project views appended has_dummy_details and data_source; CREATE OR
-- REPLACE VIEW cannot remove columns, so they are dropped and re-created exactly
-- as they were before 013 (definitions from 007 / 010), with the same grants.
-- (No other object depends on these views.)
-- =============================================================================

drop view if exists public.v_project_summary;
drop view if exists public.v_public_projects;

drop index if exists public.projects_has_dummy_details_idx;

alter table public.projects
  drop column if exists has_dummy_details,
  drop column if exists data_source;

alter table public.financial_records
  drop column if exists has_dummy_details,
  drop column if exists data_source;

alter table public.project_documents
  drop column if exists has_dummy_details,
  drop column if exists data_source;

alter table public.contractors drop column if exists data_source;
alter table public.agencies    drop column if exists data_source;

alter table public.site_images
  drop column if exists source_url,
  drop column if exists source_author,
  drop column if exists source_license,
  drop column if exists is_representative;

-- Staff view, as before 013
create view public.v_project_summary with (security_invoker = true) as
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
  coalesce(ph.phase_count, 0::bigint) as phase_count,
  coalesce(f.variation_orders, 0::numeric) as variation_orders,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) as revised_contract_amount,
  coalesce(f.total_obligated, 0::numeric) as total_obligated,
  coalesce(f.total_disbursed, 0::numeric) as total_disbursed,
  coalesce(f.total_expenses, 0::numeric) as total_expenses,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) - coalesce(f.total_disbursed, 0::numeric) as remaining_balance,
  p.completion_status, p.planned_progress,
  p.auto_flag, p.auto_flag_reasons, p.auto_flag_evaluated_at,
  p.current_flag, p.flag_review_status, p.audit_status,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date,
  case
    when (coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric)) > 0::numeric
      then round(coalesce(f.total_disbursed, 0::numeric) * 100::numeric / (coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric)), 2)
    else 0::numeric
  end as financial_progress
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (select count(*) as phase_count from public.project_phases x where x.project_id = p.id) ph on true
left join lateral (
  select sum(r.amount) filter (where r.record_type = 'variation_order') as variation_orders,
         sum(r.amount) filter (where r.record_type = 'obligation')      as total_obligated,
         sum(r.amount) filter (where r.record_type = 'disbursement')    as total_disbursed,
         sum(r.amount) filter (where r.record_type = 'expense')         as total_expenses
  from public.financial_records r where r.project_id = p.id
) f on true
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id
) img on true;

-- Same privileges as before the drop (Supabase default privileges would otherwise add more)
revoke all on public.v_project_summary from public, anon, authenticated, service_role;
grant select on public.v_project_summary to anon, authenticated;
grant all on public.v_project_summary to service_role;

-- Public portal view, as before 013
create view public.v_public_projects with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status,
  p.approved_budget, p.contract_amount, p.notice_to_proceed, p.duration_days,
  p.target_completion_date, p.actual_completion_date, p.fund_source,
  p.latitude, p.longitude, p.updated_at, p.overall_progress,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name,
  p.contractor_id, c.name as contractor_name,
  coalesce(ph.phase_count, 0::bigint) as phase_count,
  coalesce(f.variation_orders, 0::numeric) as variation_orders,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) as revised_contract_amount,
  coalesce(f.total_disbursed, 0::numeric) as total_disbursed,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) - coalesce(f.total_disbursed, 0::numeric) as remaining_balance,
  case when p.flag_review_status in ('confirmed', 'overridden') then p.current_flag else null::public.flag_color end as public_flag,
  p.flag_review_status,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id
left join lateral (select count(*) as phase_count from public.project_phases x where x.project_id = p.id) ph on true
left join lateral (
  select sum(r.amount) filter (where r.record_type = 'variation_order') as variation_orders,
         sum(r.amount) filter (where r.record_type = 'disbursement')    as total_disbursed
  from public.financial_records r where r.project_id = p.id
) f on true
left join lateral (
  select count(*) as image_count, max(i.inspection_date) as latest_inspection_date
  from public.site_images i where i.project_id = p.id and i.is_public
) img on true;

-- Same privileges as before the drop: service role only (the public portal reads it through the API)
revoke all on public.v_public_projects from public, anon, authenticated, service_role;
grant all on public.v_public_projects to service_role;
