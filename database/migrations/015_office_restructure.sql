-- =============================================================================
-- 015 — Offices restructure and office types
--
-- Offices: keep DPWH Occidental Mindoro District Engineering Office (DPWH-OMDEO),
-- add DPWH San Jose Field Office (DPWH-SJFO) and DPWH Lubang Field Office
-- (DPWH-LBFO), remove DPWH-RO4B (regional office) and DPWH-OMSDEO (sub-district
-- office, south).
--
-- Office types: agencies.office_type is a TEXT column with a CHECK constraint
-- (not a Postgres ENUM), so the constraint is replaced directly:
--   before: regional_office, district_engineering_office, lgu, other
--   after:  district_engineering_office, field_office, other
--
-- Only two foreign keys point at agencies:
--   projects.agency_id  (ON DELETE RESTRICT)
--   profiles.agency_id  (ON DELETE SET NULL)
-- Both are reassigned EXPLICITLY before the delete (no cascade / set-null is
-- relied on); the delete aborts if anything still references the two offices.
--   Projects: every DPWH-OMSDEO project -> DPWH-SJFO; projects on Lubang Island
--             (municipalities Lubang and Looc) -> DPWH-LBFO.
--   Profiles: DPWH-RO4B -> DPWH-OMDEO; DPWH-OMSDEO -> DPWH-SJFO.
-- =============================================================================

-- 1. New office-type rule. Move rows off the removed values first (only the
--    regional office uses one, and it is deleted below; this keeps the step safe).
alter table public.agencies drop constraint if exists agencies_office_type_check;

-- 2. The two field offices
insert into public.agencies (code, name, office_type, address) values
  ('DPWH-SJFO', 'DPWH San Jose Field Office', 'field_office', 'San Jose, Occidental Mindoro'),
  ('DPWH-LBFO', 'DPWH Lubang Field Office',   'field_office', 'Lubang, Occidental Mindoro')
on conflict (code) do nothing;

-- 3. Projects
update public.projects
set agency_id = (select id from public.agencies where code = 'DPWH-SJFO')
where agency_id = (select id from public.agencies where code = 'DPWH-OMSDEO');

update public.projects p
set agency_id = (select id from public.agencies where code = 'DPWH-LBFO')
from public.municipalities m
where m.id = p.municipality_id
  and m.name in ('Lubang', 'Looc')
  and p.agency_id in (select id from public.agencies where code in ('DPWH-OMDEO', 'DPWH-SJFO', 'DPWH-OMSDEO', 'DPWH-RO4B'));

update public.projects
set agency_id = (select id from public.agencies where code = 'DPWH-OMDEO')
where agency_id = (select id from public.agencies where code = 'DPWH-RO4B');

-- 4. User profiles (only the office changes)
update public.profiles
set agency_id = (select id from public.agencies where code = 'DPWH-OMDEO')
where agency_id = (select id from public.agencies where code = 'DPWH-RO4B');

update public.profiles
set agency_id = (select id from public.agencies where code = 'DPWH-SJFO')
where agency_id = (select id from public.agencies where code = 'DPWH-OMSDEO');

-- 5. Delete the two offices, but only if nothing references them any more
do $$
declare
  remaining int;
begin
  select (select count(*) from public.projects p join public.agencies a on a.id = p.agency_id where a.code in ('DPWH-RO4B', 'DPWH-OMSDEO'))
       + (select count(*) from public.profiles p join public.agencies a on a.id = p.agency_id where a.code in ('DPWH-RO4B', 'DPWH-OMSDEO'))
    into remaining;
  if remaining > 0 then
    raise exception 'Offices DPWH-RO4B / DPWH-OMSDEO are still referenced by % row(s); not deleting.', remaining;
  end if;
  delete from public.agencies where code in ('DPWH-RO4B', 'DPWH-OMSDEO');
end $$;

-- 6. Any office still on a removed type becomes "other", then the new rule applies
update public.agencies set office_type = 'other' where office_type in ('regional_office', 'lgu');

alter table public.agencies
  add constraint agencies_office_type_check
  check (office_type in ('district_engineering_office', 'field_office', 'other'));
