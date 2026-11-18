-- =============================================================================
-- IPMATS / DPWH 360° — WEEK 1 (November 5–12, 2026)
-- 001_week1_core_schema.sql
-- Objective 1: centralized platform with secure login and registration for
-- managing infrastructure projects, contractors, budgets, agencies and duration.
-- Owner: Manuel Cedric Goco (Back-end) — Supabase connection & role-based access
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Roles used for access control
create type public.user_role as enum ('admin', 'dpwh_personnel', 'auditor', 'public');
create type public.project_type as enum ('road', 'bridge', 'flood_control', 'building', 'water_supply', 'other');
-- Week 1: status is set manually by DPWH personnel (automatic detection comes in a later week)
create type public.project_status as enum ('not_started', 'ongoing', 'delayed', 'completed', 'suspended', 'terminated');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Location reference data (Occidental Mindoro)
-- -----------------------------------------------------------------------------
create table public.municipalities (
  id          smallint generated always as identity primary key,
  name        text not null unique,
  is_capital  boolean not null default false,
  latitude    numeric(9, 6) not null,
  longitude   numeric(9, 6) not null,
  created_at  timestamptz not null default now()
);

create table public.barangays (
  id               integer generated always as identity primary key,
  municipality_id  smallint not null references public.municipalities (id) on delete restrict,
  name             text not null,
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),
  created_at       timestamptz not null default now(),
  unique (municipality_id, name)
);
create index barangays_municipality_idx on public.barangays (municipality_id);

-- -----------------------------------------------------------------------------
-- Implementing agencies / DPWH offices
-- -----------------------------------------------------------------------------
create table public.agencies (
  id          smallint generated always as identity primary key,
  code        text not null unique,
  name        text not null,
  office_type text not null check (office_type in ('regional_office', 'district_engineering_office', 'lgu', 'other')),
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger agencies_updated_at before update on public.agencies
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- User profiles (1:1 with Supabase Auth users). The role lives here and is
-- only ever changed by the System Administrator through the API.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  full_name        text not null default '',
  role             public.user_role not null default 'public',
  agency_id        smallint references public.agencies (id) on delete set null,
  position         text,
  is_active        boolean not null default true,
  -- staff sign-up approval
  requested_role   public.user_role check (requested_role is null or requested_role in ('dpwh_personnel', 'auditor')),
  approval_status  text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  requested_at     timestamptz,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  -- profile photo (private 'avatars' bucket)
  avatar_path      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_agency_idx on public.profiles (agency_id);
create index profiles_reviewed_by_idx on public.profiles (reviewed_by);
create index profiles_pending_idx on public.profiles (requested_at) where approval_status = 'pending';
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new account gets a profile with NO staff access. A sign-up may REQUEST
-- DPWH Personnel or Auditor; the request is recorded, never applied.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
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
  insert into public.profiles (id, email, full_name, role, agency_id, position, requested_role, approval_status, requested_at)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(meta ->> 'full_name', ''), 120),
    'public',
    v_agency,
    nullif(left(coalesce(meta ->> 'position', ''), 120), ''),
    v_req::public.user_role,
    case when v_req is null then 'approved' else 'pending' end,
    case when v_req is null then null else now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Contractors
-- -----------------------------------------------------------------------------
create table public.contractors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  pcab_license_no text unique,
  classification  text,
  address         text,
  contact_person  text,
  contact_number  text,
  email           text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger contractors_updated_at before update on public.contractors
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Projects: identification, agency, contractor, location, budget and duration
-- -----------------------------------------------------------------------------
create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  project_code           text not null unique,
  name                   text not null,
  description            text,
  project_type           public.project_type not null,
  agency_id              smallint not null references public.agencies (id) on delete restrict,
  contractor_id          uuid references public.contractors (id) on delete set null,
  contract_ref_no        text,
  municipality_id        smallint not null references public.municipalities (id) on delete restrict,
  barangay_id            integer references public.barangays (id) on delete set null,
  latitude               numeric(9, 6) not null check (latitude between 12.0 and 14.0),
  longitude              numeric(9, 6) not null check (longitude between 119.9 and 121.4),
  approved_budget        numeric(15, 2) not null check (approved_budget >= 0),
  contract_amount        numeric(15, 2) check (contract_amount >= 0),
  notice_to_proceed      date,
  duration_days          integer check (duration_days > 0),
  target_completion_date date,
  actual_completion_date date,
  fund_source            text,
  status                 public.project_status not null default 'not_started',
  created_by             uuid references public.profiles (id) on delete set null,
  updated_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint projects_target_after_ntp check (target_completion_date is null or notice_to_proceed is null or target_completion_date >= notice_to_proceed),
  constraint projects_completion_after_ntp check (actual_completion_date is null or notice_to_proceed is null or actual_completion_date >= notice_to_proceed)
);
create index projects_municipality_idx on public.projects (municipality_id);
create index projects_barangay_idx on public.projects (barangay_id);
create index projects_agency_idx on public.projects (agency_id);
create index projects_contractor_idx on public.projects (contractor_id);
create index projects_status_idx on public.projects (status);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
