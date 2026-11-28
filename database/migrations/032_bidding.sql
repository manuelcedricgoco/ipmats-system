-- =============================================================================
-- 032 — Bidding of project contracts: rounds, bids and the award
--
-- Additive only: the API before it never reads or writes anything below, so 032 is applied
-- BEFORE the merge (by the project controller) and there is no deploy race.
-- Design: docs/superpowers/specs/2026-11-28-bidding-design.md
--
--   bidding_rounds   Rounds of bidding of one project (1, 2, …). Status:
--                      open → evaluated → awarded, or failed (from open or evaluated, with a
--                      reason of 5–500 characters). At most one open-or-evaluated round and at
--                      most one awarded round per project. Awarded and failed rounds are final.
--                      abc is the project's approved budget when the round was opened.
--   bids             One bid per registered contractor per round: amount > 0, eligibility
--                      pending | passed | failed (failed with a note of 5–500 characters).
--                      A bid above the round's ABC cannot pass. Added, changed and removed
--                      only while the round is open; eligibility also while it is evaluated.
--   award_bidding_round(round, bid, actor)
--                    The award in ONE transaction: the round goes evaluated → awarded and the
--                    project gets the winner as contractor and the winning bid as contract
--                    amount, or nothing changes. Only the lowest passed bid (unique, ≤ ABC and
--                    ≤ the approved budget) of an evaluated round, only when the project has no
--                    contractor. Called by the API with the service role only.
--   projects_award_lock  After an award, the project's contractor and contract amount stay as
--                    awarded (contract changes go through variation orders).
--
-- Access (read only; writes go through the API, as everywhere else):
--   * staff (private.is_staff()), PACC (private.is_pacc()) and the project's contractor
--     (private.contractor_company(), 029) read both tables through RLS. anon gets no grant: the
--     public abstract of bids is computed by the API with the service role (safe fields only).
--   * award_bidding_round: EXECUTE for service_role only (not anon, not authenticated).
--
-- Idempotent: safe to run again (if not exists, create or replace, drop … if exists).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bidding_rounds (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  round_no       integer not null check (round_no >= 1),
  status         text not null default 'open' check (status in ('open', 'evaluated', 'awarded', 'failed')),
  opening_date   date not null,
  abc            numeric(15, 2) not null check (abc >= 0),   -- the project's approved budget when the round opened
  notes          text check (char_length(notes) <= 1000),
  failure_reason text check (char_length(failure_reason) <= 500),
  awarded_bid_id uuid,                                       -- FK added below (bids is created after this table)
  awarded_at     timestamptz,
  awarded_by     uuid references public.profiles (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bidding_rounds_project_round_no unique (project_id, round_no),
  -- A failed round always says why (5–500 characters).
  constraint bidding_rounds_failed_reason check (status <> 'failed' or coalesce(char_length(trim(failure_reason)), 0) >= 5),
  -- Award time exactly on an awarded round.
  constraint bidding_rounds_awarded_at check ((status = 'awarded') = (awarded_at is not null))
);
comment on table public.bidding_rounds is
  'Bidding rounds of a project: open → evaluated → awarded, or failed (with a reason). At most one open-or-evaluated and one awarded round per project; awarded and failed rounds are final. Readable by staff, PACC and the project''s contractor; written only by the API.';
-- At most one round in progress (open or evaluated) per project: two simultaneous "open round"
-- requests get 23505 for the second.
create unique index if not exists bidding_rounds_one_active_per_project
  on public.bidding_rounds (project_id) where status in ('open', 'evaluated');
-- At most one awarded round per project.
create unique index if not exists bidding_rounds_one_awarded_per_project
  on public.bidding_rounds (project_id) where status = 'awarded';
create index if not exists bidding_rounds_awarded_by_idx on public.bidding_rounds (awarded_by);
create index if not exists bidding_rounds_created_by_idx on public.bidding_rounds (created_by);

create table if not exists public.bids (
  id               uuid primary key default gen_random_uuid(),
  round_id         uuid not null references public.bidding_rounds (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  contractor_id    uuid not null references public.contractors (id) on delete restrict,
  amount           numeric(15, 2) not null check (amount > 0),
  eligibility      text not null default 'pending' check (eligibility in ('pending', 'passed', 'failed')),
  eligibility_note text check (char_length(eligibility_note) <= 500),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bids_one_per_contractor unique (round_id, contractor_id),
  -- A failed bid always says why (5–500 characters).
  constraint bids_failed_note check (eligibility <> 'failed' or coalesce(char_length(trim(eligibility_note)), 0) >= 5)
);
comment on table public.bids is
  'Bids of registered contractors in a bidding round: amount, eligibility (pending / passed / failed with a note). Readable by staff, PACC and the project''s contractor; written only by the API.';
create index if not exists bids_project_idx on public.bids (project_id);
create index if not exists bids_contractor_idx on public.bids (contractor_id);
create index if not exists bids_created_by_idx on public.bids (created_by);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bidding_rounds_awarded_bid_fkey') then
    alter table public.bidding_rounds
      add constraint bidding_rounds_awarded_bid_fkey foreign key (awarded_bid_id) references public.bids (id) on delete set null;
  end if;
end;
$$;
create index if not exists bidding_rounds_awarded_bid_idx on public.bidding_rounds (awarded_bid_id);

drop trigger if exists bidding_rounds_updated_at on public.bidding_rounds;
create trigger bidding_rounds_updated_at before update on public.bidding_rounds
  for each row execute function public.set_updated_at();
drop trigger if exists bids_updated_at on public.bids;
create trigger bids_updated_at before update on public.bids
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Rules kept by the database as well as the API
--    Rounds: status moves only open → evaluated | failed, evaluated → awarded | failed; awarded
--    and failed rounds are never changed or deleted; project, number and ABC never change; only
--    an open round's opening date and notes can be edited; a round is evaluated only when it has
--    bids and none is pending; it is awarded only to its lowest passed bid (unique, ≤ ABC).
--    Bids: added, removed and their amount changed only while the round is open; eligibility
--    while open or evaluated (an evaluated round's bids stay passed or failed); never on a final
--    round; a bid above the ABC cannot pass. A bid locks its round (FOR SHARE), so bid changes
--    and the round's status change (evaluate, award) never interleave.
--    Cascades (deleting the project) and ON DELETE SET NULL of a removed account run at trigger
--    depth > 1 and are allowed.
-- ---------------------------------------------------------------------------
create or replace function private.bidding_rounds_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  lowest numeric;
  winner record;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('awarded', 'failed') then
      raise exception 'This bidding round is closed.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'open' or new.awarded_bid_id is not null or new.awarded_at is not null or new.awarded_by is not null then
      raise exception 'A bidding round starts open.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status in ('awarded', 'failed') then
    raise exception 'This bidding round is closed.' using errcode = 'P0001';
  end if;
  if new.project_id <> old.project_id or new.round_no <> old.round_no or new.abc <> old.abc then
    raise exception 'A bidding round''s project, number and ABC cannot change.' using errcode = 'P0001';
  end if;
  if old.status <> 'open' and (new.opening_date <> old.opening_date or new.notes is distinct from old.notes) then
    raise exception 'Only an open bidding round can be edited.' using errcode = 'P0001';
  end if;
  if new.status <> 'awarded' and (new.awarded_bid_id is not null or new.awarded_at is not null or new.awarded_by is not null) then
    raise exception 'Only an awarded round has an award.' using errcode = 'P0001';
  end if;
  if new.status <> 'failed' and new.failure_reason is not null then
    raise exception 'Only a failed round has a failure reason.' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    return new;
  end if;

  if not ((old.status = 'open' and new.status in ('evaluated', 'failed'))
       or (old.status = 'evaluated' and new.status in ('awarded', 'failed'))) then
    raise exception 'A bidding round cannot go from % to %.', old.status, new.status using errcode = 'P0001';
  end if;

  if new.status = 'evaluated' then
    if not exists (select 1 from public.bids b where b.round_id = new.id) then
      raise exception 'Add at least one bid before evaluating.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.bids b where b.round_id = new.id and b.eligibility = 'pending') then
      raise exception 'Set every bid to passed or failed before evaluating.' using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'awarded' then
    select b.id, b.amount, b.eligibility into winner from public.bids b where b.id = new.awarded_bid_id and b.round_id = new.id;
    if not found or winner.eligibility <> 'passed' or winner.amount > new.abc then
      raise exception 'Only the lowest passed bid can be awarded.' using errcode = 'P0001';
    end if;
    select min(b.amount) into lowest from public.bids b where b.round_id = new.id and b.eligibility = 'passed';
    if winner.amount > lowest
       or (select count(*) from public.bids b where b.round_id = new.id and b.eligibility = 'passed' and b.amount = lowest) > 1 then
      raise exception 'Only the lowest passed bid can be awarded.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.bidding_rounds_guard() from public, anon, authenticated;

drop trigger if exists bidding_rounds_guard on public.bidding_rounds;
create trigger bidding_rounds_guard before insert or update or delete on public.bidding_rounds
  for each row execute function private.bidding_rounds_guard();

create or replace function private.bids_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  rnd record;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and (new.round_id <> old.round_id or new.project_id <> old.project_id or new.contractor_id <> old.contractor_id) then
    raise exception 'A bid''s round, project and contractor cannot change.' using errcode = 'P0001';
  end if;

  -- Lock the round for the rest of the transaction: evaluating or awarding it waits for this change.
  select r.status, r.abc, r.project_id into rnd
  from public.bidding_rounds r
  where r.id = case when tg_op = 'DELETE' then old.round_id else new.round_id end
  for share;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new; -- the foreign key refuses an unknown round
  end if;

  if rnd.status in ('awarded', 'failed') then
    raise exception 'This bidding round is closed.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    if rnd.status <> 'open' then
      raise exception 'Bids can only be added, changed or removed while the round is open.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if rnd.status <> 'open' then
      raise exception 'Bids can only be added, changed or removed while the round is open.' using errcode = 'P0001';
    end if;
    if new.project_id <> rnd.project_id then
      raise exception 'The bid''s project must be the round''s project.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and rnd.status <> 'open' then
    if new.amount <> old.amount then
      raise exception 'Bids can only be added, changed or removed while the round is open.' using errcode = 'P0001';
    end if;
    if new.eligibility = 'pending' then
      raise exception 'An evaluated round''s bids stay passed or failed.' using errcode = 'P0001';
    end if;
  end if;

  if new.eligibility = 'passed' and new.amount > rnd.abc then
    raise exception 'A bid above the ABC cannot pass.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.bids_guard() from public, anon, authenticated;

drop trigger if exists bids_guard on public.bids;
create trigger bids_guard before insert or update or delete on public.bids
  for each row execute function private.bids_guard();

-- After an award, the project's contractor and contract amount stay as awarded (the API answers 409
-- first; this also closes the race of a project edit read just before the award commits). The
-- award itself sets exactly the awarded values, so it passes. Cascades (depth > 1) are allowed.
create or replace function private.projects_award_lock()
returns trigger language plpgsql set search_path = '' as $$
declare
  won record;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.contractor_id is not distinct from old.contractor_id and new.contract_amount is not distinct from old.contract_amount then
    return new;
  end if;
  select b.contractor_id, b.amount into won
  from public.bidding_rounds r join public.bids b on b.id = r.awarded_bid_id
  where r.project_id = new.id and r.status = 'awarded';
  if found and (new.contractor_id is distinct from won.contractor_id or new.contract_amount is distinct from won.amount) then
    raise exception 'The contractor and contract amount were set by the bidding award.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.projects_award_lock() from public, anon, authenticated;

drop trigger if exists projects_award_lock on public.projects;
create trigger projects_award_lock before update of contractor_id, contract_amount on public.projects
  for each row execute function private.projects_award_lock();

-- ---------------------------------------------------------------------------
-- 3. The award, in one transaction (called by the API with the service role)
--    Locks the round, then the project; re-checks every rule on the locked rows; sets the round
--    awarded and the project's contractor and contract amount. Any failure raises (P0001 with the
--    reason, P0002 when the round does not exist) and nothing changes.
-- ---------------------------------------------------------------------------
create or replace function public.award_bidding_round(p_round_id uuid, p_bid_id uuid default null, p_actor_id uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  rnd record;
  prj record;
  winner record;
  ties integer;
  at timestamptz := now();
begin
  select r.id, r.project_id, r.status, r.abc into rnd from public.bidding_rounds r where r.id = p_round_id for update;
  if not found then
    raise exception 'Bidding round not found.' using errcode = 'P0002';
  end if;
  if rnd.status in ('awarded', 'failed') then
    raise exception 'This bidding round is closed.' using errcode = 'P0001';
  end if;
  if rnd.status <> 'evaluated' then
    raise exception 'Evaluate the round before awarding it.' using errcode = 'P0001';
  end if;

  select p.id, p.contractor_id, p.approved_budget into prj from public.projects p where p.id = rnd.project_id for update;
  if prj.contractor_id is not null then
    raise exception 'This project already has a contractor.' using errcode = 'P0001';
  end if;

  select b.id, b.contractor_id, b.amount, c.is_active into winner
  from public.bids b join public.contractors c on c.id = b.contractor_id
  where b.round_id = rnd.id and b.eligibility = 'passed'
  order by b.amount, b.id
  limit 1;
  if not found then
    raise exception 'No bid passed. Mark the round failed and open a new one.' using errcode = 'P0001';
  end if;
  select count(*) into ties from public.bids b where b.round_id = rnd.id and b.eligibility = 'passed' and b.amount = winner.amount;
  if ties > 1 then
    raise exception 'Two or more passed bids tie for the lowest amount. Break the tie (for example by drawing lots) and mark the other bids failed with the reason.' using errcode = 'P0001';
  end if;
  if p_bid_id is not null and p_bid_id <> winner.id then
    raise exception 'Only the lowest passed bid can be awarded.' using errcode = 'P0001';
  end if;
  if winner.amount > rnd.abc then
    raise exception 'A bid above the ABC cannot pass.' using errcode = 'P0001';
  end if;
  if winner.amount > prj.approved_budget then
    raise exception 'The winning bid is above the project''s approved budget.' using errcode = 'P0001';
  end if;
  if not winner.is_active then
    raise exception 'The winning contractor is inactive. Reactivate it, or mark its bid failed with the reason.' using errcode = 'P0001';
  end if;

  update public.bidding_rounds
     set status = 'awarded', awarded_bid_id = winner.id, awarded_at = at, awarded_by = p_actor_id
   where id = rnd.id;
  update public.projects
     set contractor_id = winner.contractor_id, contract_amount = winner.amount, updated_by = p_actor_id
   where id = prj.id;

  return jsonb_build_object(
    'round_id', rnd.id,
    'project_id', prj.id,
    'bid_id', winner.id,
    'contractor_id', winner.contractor_id,
    'amount', winner.amount,
    'awarded_at', at
  );
end;
$$;
comment on function public.award_bidding_round(uuid, uuid, uuid) is
  'Awards an evaluated bidding round to its lowest passed bid and sets the project''s contractor and contract amount, in one transaction. Service role only.';
revoke all on function public.award_bidding_round(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_bidding_round(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Access: staff, PACC and the project's contractor read (RLS)
-- ---------------------------------------------------------------------------
-- 002 set default privileges that grant SELECT on new tables to anon and authenticated:
-- start from nothing, then grant only what is needed.
revoke all on public.bidding_rounds from anon, authenticated;
revoke all on public.bids from anon, authenticated;
grant select on public.bidding_rounds, public.bids to authenticated;
grant all on public.bidding_rounds, public.bids to service_role;

alter table public.bidding_rounds enable row level security;
alter table public.bids enable row level security;

drop policy if exists "bidding rounds: staff read" on public.bidding_rounds;
create policy "bidding rounds: staff read" on public.bidding_rounds
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "bidding rounds: pacc read" on public.bidding_rounds;
create policy "bidding rounds: pacc read" on public.bidding_rounds
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "bidding rounds: contractor read" on public.bidding_rounds;
create policy "bidding rounds: contractor read" on public.bidding_rounds
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = bidding_rounds.project_id and p.contractor_id = (select private.contractor_company()))
  );

drop policy if exists "bids: staff read" on public.bids;
create policy "bids: staff read" on public.bids
  for select to authenticated using ((select private.is_staff()));
drop policy if exists "bids: pacc read" on public.bids;
create policy "bids: pacc read" on public.bids
  for select to authenticated using ((select private.is_pacc()));
drop policy if exists "bids: contractor read" on public.bids;
create policy "bids: contractor read" on public.bids
  for select to authenticated using (
    (select private.contractor_company()) is not null
    and exists (select 1 from public.projects p where p.id = bids.project_id and p.contractor_id = (select private.contractor_company()))
  );

-- PostgREST: pick up the new function (POST /rest/v1/rpc/award_bidding_round, service role only).
notify pgrst, 'reload schema';
