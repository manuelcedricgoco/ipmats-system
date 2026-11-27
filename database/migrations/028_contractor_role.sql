-- =============================================================================
-- 028 — New account role: Contractor (a contractor company's representative)
--
-- Contractor accounts report progress and upload 360° photos for their own company's
-- projects only (migration 029 links the account to the company and adds the access rules).
-- Design: docs/superpowers/specs/2026-11-27-contractor-accounts-design.md
--
-- Only the enum value is added here. Postgres does not allow a new enum value to be used
-- in the same transaction that adds it, so this file must be applied (and committed)
-- before 029, which uses 'contractor' in its CHECKs, role helper and sign-up trigger.
--
-- Nothing else changes: sign-up still cannot request 'contractor' until 029 is applied
-- (profiles_requested_role_check and handle_new_user allow only dpwh_personnel / auditor),
-- and 'contractor' is NOT a staff role (private.is_staff() is unchanged).
-- =============================================================================

alter type public.user_role add value if not exists 'contractor';
