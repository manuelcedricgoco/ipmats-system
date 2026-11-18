-- =============================================================================
-- WEEK 1 — 002_week1_access_control.sql
-- Role-based access with Row Level Security (RLS).
--   * Browsers use only the publishable (anon) key → READ ONLY, filtered by RLS.
--   * All writes go through the Node.js API, which checks the user's role and
--     then writes with the service-role key (kept on the server only).
-- Owner: Manuel Cedric Goco (Back-end)
-- =============================================================================

-- Role helpers live in a private schema so they cannot be called through the REST API.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.app_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.app_role() in ('admin', 'dpwh_personnel', 'auditor'), false)
$$;

revoke execute on all functions in schema private from public;
grant execute on function private.app_role() to anon, authenticated, service_role;
grant execute on function private.is_staff() to anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Table privileges (new Supabase projects grant nothing by default)
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

alter table public.municipalities enable row level security;
alter table public.barangays      enable row level security;
alter table public.agencies       enable row level security;
alter table public.profiles       enable row level security;
alter table public.contractors    enable row level security;
alter table public.projects       enable row level security;

-- Location and office lists are public (needed on the sign-up page)
create policy "reference: read all" on public.municipalities for select to anon, authenticated using (true);
create policy "reference: read all" on public.barangays      for select to anon, authenticated using (true);
create policy "reference: read all" on public.agencies       for select to anon, authenticated using (true);

-- Staff (admin, DPWH personnel, auditor) can read contractors and projects
create policy "contractors: staff read" on public.contractors for select to authenticated using ((select private.is_staff()));
create policy "projects: staff read"    on public.projects    for select to authenticated using ((select private.is_staff()));

-- Each user reads their own profile; staff can read all profiles
create policy "profiles: own or staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

-- Project list with office, contractor and location names (caller's RLS applies)
create or replace view public.v_project_summary with (security_invoker = true) as
select
  p.id, p.project_code, p.name, p.description, p.project_type, p.status,
  p.approved_budget, p.contract_amount, p.notice_to_proceed, p.duration_days,
  p.target_completion_date, p.actual_completion_date, p.fund_source, p.contract_ref_no,
  p.latitude, p.longitude, p.created_at, p.updated_at,
  p.municipality_id, m.name as municipality_name,
  p.barangay_id, b.name as barangay_name,
  p.agency_id, a.name as agency_name, a.code as agency_code,
  p.contractor_id, c.name as contractor_name
from public.projects p
join public.municipalities m on m.id = p.municipality_id
left join public.barangays b on b.id = p.barangay_id
join public.agencies a on a.id = p.agency_id
left join public.contractors c on c.id = p.contractor_id;

grant select on public.v_project_summary to authenticated, service_role;
