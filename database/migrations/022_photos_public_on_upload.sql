-- =============================================================================
-- 022 — 360° photos are public as soon as DPWH personnel upload them
--
-- Decision (27 Nov 2026): Auditors (and Admins) no longer decide which site photos the public
-- sees. Every photo uploaded by DPWH personnel appears on the public portal at once; the API's
-- "show to / hide from public" route is removed. An Admin can still delete a wrong upload.
--
--   * site_images.is_public now defaults to true (the API also inserts true explicitly).
--   * Photos still hidden under the old approval step are made public.
--   * The anon policy "images: public read" (using is_public) and the column grants of 016 are
--     unchanged; with every row public they simply let every photo row through.
--   * public_reviewed_by / public_reviewed_at are kept as history of the old approvals.
-- =============================================================================

alter table public.site_images alter column is_public set default true;

comment on column public.site_images.is_public is
  'Shown on the public portal. Always true since 022: photos are public as soon as they are uploaded.';

update public.site_images
set is_public = true
where not is_public;
