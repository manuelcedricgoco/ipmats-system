-- =============================================================================
-- 006_public_requires_login.sql — the Public portal needs a signed-in account.
--
-- Migration 005 let the anonymous role read safe columns with the publishable
-- key. That key is in the browser bundle, so anyone could read the data without
-- an account. This migration removes anonymous access to project data entirely.
-- The API reads it with the service role after it has checked the sign-in
-- (server/src/controllers/publicController.js).
--
-- Still open to anonymous visitors: reference lists (municipalities, barangays,
-- offices) for the sign-up form. Nothing else.
-- =============================================================================

drop policy if exists "projects: public read"    on public.projects;
drop policy if exists "contractors: public read" on public.contractors;
drop policy if exists "phases: public read"      on public.project_phases;
drop policy if exists "progress: public read"    on public.progress_updates;
drop policy if exists "financial: public read"   on public.financial_records;

-- Column grants from migration 005 (revoking the table does not remove column grants)
revoke select (id, project_code, name, description, project_type, status,
               approved_budget, contract_amount, notice_to_proceed, duration_days,
               target_completion_date, actual_completion_date, fund_source,
               latitude, longitude, municipality_id, barangay_id, agency_id,
               contractor_id, overall_progress, updated_at)
  on public.projects from anon;
revoke select (id, name, is_active) on public.contractors from anon;
revoke select (id, project_id, sequence_no, name, weight, planned_start, planned_end,
               actual_start, actual_end, accomplishment)
  on public.project_phases from anon;
revoke select (id, project_id, report_date, overall_progress, phase_snapshot, remarks)
  on public.progress_updates from anon;
revoke select (id, project_id, record_type, amount, record_date, description)
  on public.financial_records from anon;

revoke select on public.v_public_projects from anon;
