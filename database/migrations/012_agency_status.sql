-- =============================================================================
-- 012 — Office / agency status (Offices & Agencies)
--
-- A System Administrator can suspend an implementing office and reactivate it
-- later (Actions column on the Offices & Agencies page). A suspended office
-- (is_active = false) is no longer offered for new projects; projects and user
-- accounts that already use it keep it. Mirrors contractors.is_active.
--
-- RLS is unchanged: agencies are written only by the API (service role).
-- =============================================================================
alter table public.agencies
  add column if not exists is_active boolean not null default true;

comment on column public.agencies.is_active is 'false = suspended by a System Administrator; not offered for new projects.';
