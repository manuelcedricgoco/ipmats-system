-- =============================================================================
-- 031 — Finance liquidation: receipts for disbursements and expenses
--
-- Additive only: the API before it never reads or writes anything below, so 031 is applied
-- BEFORE the merge (by the project controller) and there is no deploy race.
-- Design: docs/superpowers/specs/2026-11-28-finance-liquidation-design.md
--
--   finance_receipts   Receipts that show where a disbursement or expense went. One financial
--                      record (disbursement or expense only; checked here and by the API) can
--                      have several. Uploaded by DPWH Personnel (any project) or the project's
--                      contractor (own company's projects; API). Status:
--                        submitted → accepted | returned (the Auditor, with a reason when returned).
--                      Only accepted receipts count as liquidated and only they reach the public
--                      (through the API, computed with the service role). An accepted receipt is
--                      never changed or deleted on its own (trigger below): it goes only with its
--                      financial record or project (cascade).
--                      Files are in the private 'finance-receipts' bucket (PDF / JPEG / PNG /
--                      WebP, at most 15 MB, actual bytes checked by the API).
--
-- Access (read only; writes go through the API, as everywhere else):
--   * staff (private.is_staff()), PACC (private.is_pacc()) and the project's contractor
--     (private.contractor_company(), 029) read the rows through RLS, like financial_records
--     (004, 024, 029). anon gets no grant at all.
--   * Storage: one new private bucket, no storage policies; only the API reads or writes files
--     and hands out short-lived signed links.
--
-- Idempotent: safe to run again (if not exists, create or replace, drop … if exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Receipts
-- ---------------------------------------------------------------------------
create table if not exists public.finance_receipts (
  id                  uuid primary key default gen_random_uuid(),
  financial_record_id uuid not null references public.financial_records (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  storage_path        text not null unique,      -- '<project_id>/<financial_record_id>/<uuid>.<ext>' in 'finance-receipts'
  file_name           text not null check (char_length(file_name) between 1 and 200),
  mime_type           text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes          integer not null check (size_bytes > 0),
  amount              numeric(15, 2) not null check (amount > 0),
  receipt_date        date not null,
  description         text check (char_length(description) <= 500),
  status              text not null default 'submitted' check (status in ('submitted', 'accepted', 'returned')),
  review_note         text check (char_length(review_note) <= 500),
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  uploaded_by         uuid references public.profiles (id) on delete set null,
  uploaded_by_role    text check (uploaded_by_role in ('dpwh_personnel', 'contractor')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A returned receipt always says why (5–500 characters).
  constraint finance_receipts_returned_note check (status <> 'returned' or coalesce(char_length(trim(review_note)), 0) >= 5),
  -- Reviewed exactly when accepted or returned.
  constraint finance_receipts_reviewed_at check ((status = 'submitted') = (reviewed_at is null))
);
comment on table public.finance_receipts is
  'Receipts of disbursements and expenses (files in the private finance-receipts bucket). Submitted → accepted | returned by the Auditor; only accepted receipts count as liquidated and reach the public (through the API). Readable by staff, PACC and the project''s contractor; written only by the API.';
create index if not exists finance_receipts_record_idx on public.finance_receipts (financial_record_id);
create index if not exists finance_receipts_project_idx on public.finance_receipts (project_id, status);
create index if not exists finance_receipts_uploaded_by_idx on public.finance_receipts (uploaded_by);
create index if not exists finance_receipts_reviewed_by_idx on public.finance_receipts (reviewed_by);

drop trigger if exists finance_receipts_updated_at on public.finance_receipts;
create trigger finance_receipts_updated_at before update on public.finance_receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Rules kept by the database as well as the API
--    * a receipt belongs to a disbursement or expense of the same project;
--    * status moves only submitted → accepted | returned;
--    * an accepted receipt is never changed or deleted on its own. Cascades (deleting the
--      financial record or the project) and ON DELETE SET NULL of a removed account run at
--      trigger depth > 1 and are allowed.
-- ---------------------------------------------------------------------------
create or replace function private.finance_receipts_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  rec record;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'accepted' then
      raise exception 'An accepted receipt cannot be deleted.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'accepted' then
      raise exception 'An accepted receipt cannot be changed.' using errcode = 'P0001';
    end if;
    if new.status <> old.status and old.status <> 'submitted' then
      raise exception 'Only a submitted receipt can be accepted or returned.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' or new.financial_record_id is distinct from old.financial_record_id or new.project_id is distinct from old.project_id then
    select r.project_id, r.record_type into rec from public.financial_records r where r.id = new.financial_record_id;
    if found and rec.record_type not in ('disbursement', 'expense') then
      raise exception 'Receipts can only be added to disbursements and expenses.' using errcode = 'P0001';
    end if;
    if found and rec.project_id <> new.project_id then
      raise exception 'The receipt''s project must be the financial record''s project.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.finance_receipts_guard() from public, anon, authenticated;

drop trigger if exists finance_receipts_guard on public.finance_receipts;
create trigger finance_receipts_guard before insert or update or delete on public.finance_receipts
  for each row execute function private.finance_receipts_guard();

-- ---------------------------------------------------------------------------
-- 3. Access: staff, PACC and the project's contractor read (RLS)
-- ---------------------------------------------------------------------------
-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.finance_receipts from anon, authenticated;
grant select on public.finance_receipts to authenticated;
grant all on public.finance_receipts to service_role;

alter table public.finance_receipts enable row level security;

drop policy if exists "receipts: staff read" on public.finance_receipts;
create policy "receipts: staff read" on public.finance_receipts
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "receipts: pacc read" on public.finance_receipts;
create policy "receipts: pacc read" on public.finance_receipts
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "receipts: contractor read" on public.finance_receipts;
create policy "receipts: contractor read" on public.finance_receipts
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = finance_receipts.project_id and p.contractor_id = (select private.contractor_company()))
  );

-- ---------------------------------------------------------------------------
-- 4. Storage bucket (private; only the API reads or writes it)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-receipts', 'finance-receipts', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
