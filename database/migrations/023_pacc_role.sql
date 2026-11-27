-- =============================================================================
-- 023 — New account role: PACC (Presidential Anti-Corruption Commission)
--
-- PACC accounts use the new PACC portal (/pacc): they receive projects referred for
-- investigation and anonymous citizen reports, and record cases (migration 024).
--
-- Only the enum value is added here. Postgres does not allow a new enum value to be used
-- in the same transaction that adds it, so this file must be applied (and committed)
-- before 024, which uses 'pacc' in its role helper and policies.
--
-- Nothing else changes: sign-up still cannot request 'pacc' (profiles_requested_role_check
-- and handle_new_user from 017 allow only dpwh_personnel / auditor), and 'pacc' is NOT a
-- staff role (private.is_staff() is unchanged).
-- =============================================================================

alter type public.user_role add value if not exists 'pacc';
