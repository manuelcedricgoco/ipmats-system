-- =============================================================================
-- 017 — Remove the "public" user role; registration waits for admin approval
--
-- Browsing the portal needs no account (016), so there are no Public accounts.
-- Only DPWH Personnel and Auditors register, and no role is granted until the
-- System Administrator approves the request:
--   profiles.role             NULL until approved (was 'public')
--   profiles.requested_role   the role asked for at sign-up (dpwh_personnel / auditor)
--   profiles.approval_status  pending -> approved | rejected   (existing columns, 003/010)
-- A role can only be set on an approved account (new CHECK), and the role
-- lookup used by every RLS policy now also requires approval.
--
-- user_role is a Postgres ENUM and a value cannot be dropped from one, so the
-- type is recreated without 'public' and the columns are moved onto it.
-- Objects that depend on the type are dropped first and re-created after:
-- the column default, CHECK profiles_requested_role_check, function
-- private.app_role() and policy "activity: admin and auditor read".
--
-- Existing accounts with the 'public' role (decision recorded with the owner):
--   * pending staff requests (applicant@dpwh360.local): role cleared, stay pending
--   * approved Public Viewers (public@dpwh360.local): role cleared, deactivated
--     (is_active = false, sign-in banned). Kept, not deleted.
-- =============================================================================

-- 1. Accounts holding the old role
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role drop not null;

update auth.users u set banned_until = 'infinity'
from public.profiles p
where p.id = u.id and p.role = 'public' and p.approval_status = 'approved';

update public.profiles set is_active = false
where role = 'public' and approval_status = 'approved';

update public.profiles set role = null where role = 'public';

-- 2. Drop what depends on the type
drop policy if exists "activity: admin and auditor read" on public.activity_logs;
alter table public.profiles drop constraint if exists profiles_requested_role_check;
drop function if exists private.app_role();

-- 3. Recreate the type without 'public'
alter type public.user_role rename to user_role_old;
create type public.user_role as enum ('admin', 'dpwh_personnel', 'auditor');
alter table public.profiles
  alter column role type public.user_role using role::text::public.user_role,
  alter column requested_role type public.user_role using requested_role::text::public.user_role;
drop type public.user_role_old;

-- 4. Constraints
alter table public.profiles
  add constraint profiles_requested_role_check
  check (requested_role is null or requested_role in ('dpwh_personnel', 'auditor'));
alter table public.profiles
  add constraint profiles_role_requires_approval
  check (role is null or approval_status = 'approved');

-- 5. Role lookup for RLS: only active AND approved accounts have a role
create function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active and p.approval_status = 'approved'
$$;
revoke all on function private.app_role() from public;
grant execute on function private.app_role() to anon, authenticated, service_role;

create policy "activity: admin and auditor read" on public.activity_logs
  for select to authenticated
  using ((select private.app_role()) in ('admin', 'auditor'));

-- 6. Sign-up: no role is granted; a staff request waits for approval
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_req    text := meta ->> 'requested_role';
  v_agency smallint;
begin
  if v_req is not null and v_req not in ('dpwh_personnel', 'auditor') then
    v_req := null;
  end if;
  if (meta ->> 'agency_id') ~ '^\d{1,4}$' then
    select a.id into v_agency from public.agencies a where a.id = (meta ->> 'agency_id')::smallint;
  end if;
  -- No valid requested role: nothing to approve (public browsing needs no account).
  -- Accounts created by the System Administrator are approved by the API right after.
  insert into public.profiles (id, email, full_name, role, agency_id, position, requested_role, approval_status, requested_at, review_note)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(meta ->> 'full_name', ''), 120),
    null,
    v_agency,
    nullif(left(coalesce(meta ->> 'position', ''), 120), ''),
    v_req::public.user_role,
    case when v_req is null then 'rejected' else 'pending' end,
    now(),
    case when v_req is null then 'No staff role was requested. Browsing the public portal needs no account.' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
