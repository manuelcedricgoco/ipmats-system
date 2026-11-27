-- =============================================================================
-- 020 — Perceptual hash of 360° photos (security fix M-2)
--
-- file_hash (SHA-256) only catches byte-identical re-uploads; re-saving or
-- re-compressing a photo defeats it. phash is a 64-bit difference hash (16 hex
-- characters) computed by the server, compared by Hamming distance to flag
-- near-identical photos reused across projects or inspections.
--
-- Existing rows stay null until `server/scripts/backfill-phash.mjs` is run.
-- No grants: phash is not exposed to the anon role.
-- =============================================================================
alter table public.site_images
  add column if not exists phash text check (phash is null or phash ~ '^[0-9a-f]{16}$');

comment on column public.site_images.phash is
  'Perceptual difference hash (16 hex chars) used to detect near-duplicate photos. Null = not yet computed.';
