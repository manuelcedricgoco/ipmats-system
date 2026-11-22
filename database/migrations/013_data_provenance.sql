-- =============================================================================
-- 013 — Data provenance: real vs fabricated values
--
-- The demo data was replaced with real DPWH Occidental Mindoro projects. Real
-- records often lack a published funds breakdown or supporting documents; those
-- gaps may be filled with plausible dummy values for demonstrations, and every
-- such record must say so, so verified and fabricated data are never mixed up.
--
--   has_dummy_details  true = this row contains fabricated values (funds
--                      breakdown, budget figures or documents). Default false:
--                      anything entered through the app is real.
--   data_source        where the real data came from (publication, URL, date),
--                      and which fields are placeholders.
--
-- Added to: projects, financial_records, project_documents (rows that can hold
-- fabricated values) and data_source to contractors and agencies (real entities
-- that need a citation).
--
-- site_images gets licence metadata for panoramas taken from openly licensed
-- sources (Mapillary, Wikimedia Commons, government releases). Google Street
-- View imagery is never allowed (Google's terms of service).
--
-- The two project views list their columns explicitly, so they are re-created
-- with the new columns appended at the end (CREATE OR REPLACE VIEW only allows
-- appending). Grants and security_invoker are kept as in 007 / 010.
-- =============================================================================

alter table public.projects
  add column if not exists has_dummy_details boolean not null default false,
  add column if not exists data_source       text;

alter table public.financial_records
  add column if not exists has_dummy_details boolean not null default false,
  add column if not exists data_source       text;

alter table public.project_documents
  add column if not exists has_dummy_details boolean not null default false,
  add column if not exists data_source       text;

alter table public.contractors add column if not exists data_source text;
alter table public.agencies    add column if not exists data_source text;

alter table public.site_images
  add column if not exists source_url        text,
  add column if not exists source_author     text,
  add column if not exists source_license    text,
  add column if not exists is_representative boolean not null default false;

comment on column public.projects.has_dummy_details is 'true = the record contains fabricated values (budget figures, funds breakdown or documents) for demonstration. See data_source for which fields.';
comment on column public.projects.data_source is 'Citation for the real data (publication, URL, date) and the list of placeholder fields.';
comment on column public.financial_records.has_dummy_details is 'true = fabricated financial record (demo only); not from an official source.';
comment on column public.financial_records.data_source is 'Where the record came from.';
comment on column public.project_documents.has_dummy_details is 'true = fabricated sample document (demo only); not an official document.';
comment on column public.project_documents.data_source is 'Where the document came from.';
comment on column public.contractors.data_source is 'Citation for the contractor record (e.g. CIAP CPES report and PCAB licence number).';
comment on column public.agencies.data_source is 'Citation for the office record.';
comment on column public.site_images.source_url is 'Original URL of a panorama taken from an openly licensed source (never Google Street View).';
comment on column public.site_images.source_author is 'Author / photographer credited by the source.';
comment on column public.site_images.source_license is 'Licence of the image, e.g. CC BY-SA 4.0.';
comment on column public.site_images.is_representative is 'true = a nearby panorama of the same municipality, not the exact project site.';

create index if not exists projects_has_dummy_details_idx on public.projects (has_dummy_details) where has_dummy_details;

-- Staff view (definition as in the live database, + has_dummy_details, data_source)
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
  end as financial_progress,
  p.has_dummy_details,
  p.data_source
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

grant select on public.v_project_summary to authenticated, service_role;

-- Public portal view (definition as in the live database, + has_dummy_details, data_source)
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
  coalesce(ph.phase_count, 0::bigint) as phase_count,
  coalesce(f.variation_orders, 0::numeric) as variation_orders,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) as revised_contract_amount,
  coalesce(f.total_disbursed, 0::numeric) as total_disbursed,
  coalesce(p.contract_amount, 0::numeric) + coalesce(f.variation_orders, 0::numeric) - coalesce(f.total_disbursed, 0::numeric) as remaining_balance,
  case when p.flag_review_status in ('confirmed', 'overridden') then p.current_flag else null::public.flag_color end as public_flag,
  p.flag_review_status,
  coalesce(img.image_count, 0::bigint) as image_count,
  img.latest_inspection_date,
  p.has_dummy_details,
  p.data_source
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

grant select on public.v_public_projects to service_role;
