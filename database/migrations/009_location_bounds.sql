-- =============================================================================
-- 009 — Project location range matches the Occidental Mindoro boundary
--
-- The exact boundary check (point inside the province polygon, OpenStreetMap
-- relation 1506320) runs in the API (server/src/utils/geo.js) and in the map
-- picker. This database check is the last safety net: the rectangle around that
-- polygon. The old rectangle (lat 12–14, lng 119.9–121.4) cut off the north-west
-- edge of the province and reached far into Oriental Mindoro.
-- All existing projects are inside the new range.
-- =============================================================================
alter table public.projects
  drop constraint if exists projects_latitude_check,
  drop constraint if exists projects_longitude_check,
  add constraint projects_latitude_check check (latitude >= 12.0 and latitude <= 14.05),
  add constraint projects_longitude_check check (longitude >= 119.85 and longitude <= 121.3);
