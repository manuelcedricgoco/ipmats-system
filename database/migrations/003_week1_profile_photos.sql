-- =============================================================================
-- WEEK 1 — 003_week1_profile_photos.sql
-- Private bucket for profile photos (registration and My account).
-- Photos are only ever shared through short-lived signed links from the API.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
