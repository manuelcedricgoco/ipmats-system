-- =============================================================================
-- 018 — Fix the sign-in ban set by 017
--
-- 017 banned the deactivated Public Viewer accounts with banned_until = 'infinity'.
-- Supabase Auth cannot read an infinite timestamp: sign-in failed with HTTP 500
-- "Database error querying schema" instead of a clean "User is banned".
-- Use the same 100-year ban the API sets when an account is deactivated or
-- suspended (ban_duration '876000h', usersController.js).
-- =============================================================================
update auth.users
set banned_until = now() + interval '876000 hours'
where banned_until = 'infinity';
