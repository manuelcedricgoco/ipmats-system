-- =============================================================================
-- 011 — User suspension (User Management)
--
-- A System Administrator can suspend an account with a reason and lift the
-- suspension later. While suspended:
--   * profiles.is_active = false  → the API refuses every request (403)
--   * the Supabase Auth user is banned → the person cannot sign in at all
-- The columns below record when, by whom and why the account was suspended.
--
-- RLS is unchanged: profiles has no UPDATE policy for users, so only the API
-- (service role) writes these columns.
-- =============================================================================
alter table public.profiles
  add column if not exists suspended_at      timestamptz,
  add column if not exists suspended_by      uuid references public.profiles(id) on delete set null,
  add column if not exists suspension_reason text;

alter table public.profiles drop constraint if exists profiles_suspension_reason_check;
alter table public.profiles
  add constraint profiles_suspension_reason_check
  check (suspension_reason is null or char_length(suspension_reason) between 5 and 500);

create index if not exists profiles_suspended_by_idx on public.profiles (suspended_by);

comment on column public.profiles.suspended_at is 'When a System Administrator suspended the account (null = not suspended).';
comment on column public.profiles.suspended_by is 'The System Administrator who suspended the account.';
comment on column public.profiles.suspension_reason is 'Why the account was suspended (5–500 characters).';
