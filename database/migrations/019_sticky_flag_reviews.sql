-- =============================================================================
-- 019 — Sticky auditor flag decisions (security fix M-1)
--
-- Until now, when the automatic flag changed, projects.current_flag simply
-- followed it, so DPWH personnel could erase an auditor's RED override with two
-- edits. reviewed_flag stores the auditor's last decision; the server never lets
-- current_flag drop below it when the automatic flag changes.
--
-- Existing confirmed / overridden projects are backfilled from current_flag.
-- No grants: reviewed_flag is not exposed to the anon role.
-- =============================================================================
alter table public.projects add column if not exists reviewed_flag public.flag_color;

comment on column public.projects.reviewed_flag is
  'The auditor''s latest flag decision (confirm or override). current_flag never drops below it when the automatic flag changes. Null = never reviewed.';

update public.projects
set reviewed_flag = current_flag
where flag_review_status in ('confirmed', 'overridden');
