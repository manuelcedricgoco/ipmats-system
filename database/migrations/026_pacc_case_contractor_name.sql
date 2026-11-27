-- =============================================================================
-- 026 — Keep the contractor's name on a PACC case
--
-- Apply AFTER 025 and BEFORE deploying the API that writes pacc_cases.contractor_name.
-- Design: docs/superpowers/specs/2026-11-27-pacc-portal-design.md
--
-- pacc_cases.contractor_id is ON DELETE SET NULL (024), so an Admin deleting a contractor used to
-- erase the case's respondent silently. The case now keeps a snapshot of the contractor's name,
-- like it keeps the project code and name: the API sets contractor_name when the case is opened
-- and whenever the contractor on the case is changed (cleared when the contractor is removed from
-- the case). Deleting the contractor later still sets contractor_id to NULL, but the name stays.
--
-- Backfill: open and closed cases that still point to a contractor get its current name.
--
-- Access: no change. pacc_cases stays readable only by PACC (RLS of 024) and written only by the
-- API with the service role.
--
-- Idempotent: safe to run again (add column if not exists; the backfill only fills NULL names).
-- =============================================================================

alter table public.pacc_cases
  add column if not exists contractor_name text check (char_length(contractor_name) <= 300);

update public.pacc_cases c
   set contractor_name = k.name
  from public.contractors k
 where k.id = c.contractor_id
   and c.contractor_name is null;

comment on column public.pacc_cases.contractor_name is
  'Snapshot of the contractor''s name, set by the API when the case is opened or its contractor is changed. Kept when the contractor is deleted (contractor_id becomes NULL).';
