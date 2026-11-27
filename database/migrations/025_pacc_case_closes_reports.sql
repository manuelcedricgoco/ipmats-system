-- =============================================================================
-- 025 — Closing a PACC case closes its attached citizen reports
--
-- Apply AFTER 024 (it uses pacc_cases and citizen_reports).
-- Design: docs/superpowers/specs/2026-11-27-pacc-portal-design.md
--   "Closed is final: no reopening; PACC opens a new case instead. Closing a case closes its
--    attached reports in the same database transaction."
--
-- The API (supabase-js) cannot run several statements in one transaction, so the database does
-- it: an AFTER UPDATE OF status trigger on pacc_cases. When a case becomes 'resolved' or
-- 'dismissed', every attached report that is not yet closed is closed in the same transaction as
-- the case update, with the outcome
--     resolved  -> valid
--     dismissed -> invalid
-- (the same mapping as outcomeForClosedCase() in server/src/controllers/paccController.js).
-- Reports PACC already closed keep the outcome PACC gave them.
--
-- Security definer: the trigger must update citizen_reports whoever writes the case (the API
-- writes with the service role, but this keeps it working for any writer). The function lives in
-- the private schema, so it is not callable through the REST API.
--
-- Idempotent: safe to run again (create or replace, drop trigger if exists).
-- =============================================================================

create or replace function private.close_pacc_case_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'dismissed') and old.status is distinct from new.status then
    update public.citizen_reports r
    set status  = 'closed',
        outcome = (case new.status when 'resolved' then 'valid' else 'invalid' end)
    where r.case_id = new.id
      and r.status <> 'closed';
  end if;
  return null;
end;
$$;
revoke all on function private.close_pacc_case_reports() from public;

drop trigger if exists pacc_cases_close_reports on public.pacc_cases;
create trigger pacc_cases_close_reports
  after update of status on public.pacc_cases
  for each row execute function private.close_pacc_case_reports();
