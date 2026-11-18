-- =============================================================================
-- 005_public_portal.sql — Public portal (read-only transparency)
--
-- The public reads ONLY through the `anon` role (the API's public endpoints
-- always query as anon, signed in or not). Row Level Security allows the rows;
-- COLUMN-LEVEL grants decide which columns anon can see, so internal fields stay
-- hidden even if someone calls the database directly with the publishable key:
--   hidden: contract reference no., created_by / updated_by, who submitted a
--           progress report, financial reference numbers and record creators,
--           contractor contact details, every profile.
-- Staff access (authenticated) is unchanged.
-- =============================================================================

-- Start from nothing for anon on these tables, then grant only safe columns.
revoke select on public.projects, public.contractors, public.project_phases,
                 public.progress_updates, public.financial_records from anon;

grant select (id, project_code, name, description, project_type, status,
              approved_budget, contract_amount, notice_to_proceed, duration_days,
              target_completion_date, actual_completion_date, fund_source,
              latitude, longitude, municipality_id, barangay_id, agency_id,
              contractor_id, overall_progress, updated_at)
  on public.projects to anon;
grant select (id, name, is_active) on public.contractors to anon;
grant select (id, project_id, sequence_no, name, weight, planned_start, planned_end,
              actual_start, actual_end, accomplishment)
  on public.project_phases to anon;
grant select (id, project_id, report_date, overall_progress, phase_snapshot, remarks)
  on public.progress_updates to anon;
grant select (id, project_id, record_type, amount, record_date, description)
  on public.financial_records to anon;

create policy "projects: public read"  on public.projects          for select to anon using (true);
create policy "contractors: public read" on public.contractors     for select to anon using (true);
create policy "phases: public read"    on public.project_phases    for select to anon using (true);
create policy "progress: public read"  on public.progress_updates  for select to anon using (true);
create policy "financial: public read" on public.financial_records for select to anon using (true);

-- Public project list: only public columns + progress and financial totals.
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
  coalesce(p.contract_amount, 0) + coalesce(f.variation_orders, 0) - coalesce(f.total_disbursed, 0) as remaining_balance
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
) f on true;

revoke all on public.v_public_projects from anon, authenticated;
grant select on public.v_public_projects to anon, service_role;
