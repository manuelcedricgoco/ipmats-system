import { Award, ClipboardCheck, Gavel, Plus, Save, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import BiddingRounds, { AboveAbcWarning } from '../../../components/bidding/BiddingRounds.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardHeader } from '../../../components/common/Card.jsx';
import ConfirmDialog from '../../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea, fieldErrors } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useReference } from '../../../hooks/useReference.js';
import { api } from '../../../lib/api.js';
import {
  ABOVE_ABC_MESSAGE,
  awardConfirmText,
  bidAmountProblem,
  bidderOptions,
  eligibilityChoices,
  eligibilityMeta,
  eligibilityProblem,
  failReasonProblem,
  isAboveAbc,
  roundInProgress,
} from '../../../lib/bidding.js';
import { peso, todayIso } from '../../../lib/format.js';

/**
 * Bidding of the project's contract (032). Every role that opens the project page reads the rounds and their
 * ranked bids (a contractor only on its own company's projects); DPWH Personnel record them: open a round, add,
 * change or remove bids while it is open, set each bid's eligibility, evaluate, declare a failure of bidding, and
 * award the rank-1 passed bid, which sets the project's contractor and contract amount. Which buttons show follows
 * the API's `permissions` and each round's `actions`; every write answers with the whole bidding, shown as is,
 * and the API's refusals are shown in the dialog.
 */
export default function BiddingTab() {
  const { project, reloadProject } = useOutletContext();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/projects/${project.id}/bidding`, undefined, { select: (r) => r.data });
  // The answer of the last write (the whole bidding); cleared when the tab loads again.
  const [latest, setLatest] = useState(null);
  useEffect(() => setLatest(null), [data]);
  // { kind: 'open' | 'editRound' | 'addBid' | 'editBid' | 'eligibility' | 'remove' | 'evaluate' | 'fail' | 'award', round?, bid? }
  const [dialog, setDialog] = useState(null);
  const close = useCallback(() => setDialog(null), []);

  if (loading && !data) return <PageLoader label="Loading the bidding…" withHeader={false} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const bidding = latest || data;
  const perms = bidding.permissions || {};
  const awardedRound = bidding.rounds.find((r) => r.status === 'awarded');
  const winner = awardedRound?.bids.find((b) => b.is_winner);
  const inProgress = roundInProgress(bidding.rounds);

  /**
   * Send a write, show its answer (the whole bidding) and say what happened. A refusal is thrown back to the
   * dialog, which shows the API's message; after a 409 (someone else changed the round) the tab reloads behind it.
   */
  const write = async (send, message) => {
    let res;
    try {
      res = await send();
    } catch (e) {
      if (e?.status === 409) reload();
      throw e;
    }
    if (res?.data?.rounds) setLatest(res.data);
    else reload();
    toast.success(message);
    close();
  };

  const handlers = {
    onEditRound: (round) => setDialog({ kind: 'editRound', round }),
    onAddBid: (round) => setDialog({ kind: 'addBid', round }),
    onEditBid: (round, bid) => setDialog({ kind: 'editBid', round, bid }),
    onRemoveBid: (round, bid) => setDialog({ kind: 'remove', round, bid }),
    onEligibility: (round, bid) => setDialog({ kind: 'eligibility', round, bid }),
    onEvaluate: (round) => setDialog({ kind: 'evaluate', round }),
    onFail: (round) => setDialog({ kind: 'fail', round }),
    onAward: (round, bidId) => setDialog({ kind: 'award', round, bid: round.bids.find((b) => b.id === bidId) }),
  };
  const r = dialog?.round;

  const openButton = perms.can_open_round && (
    <Button size="sm" icon={Plus} onClick={() => setDialog({ kind: 'open' })}>Open a bidding round</Button>
  );
  let summary;
  if (awardedRound) {
    summary = `Awarded in round ${awardedRound.round_no}${winner ? ` to ${winner.contractor_name} at ${peso(winner.amount)}` : ''}. The project's contractor and contract amount come from this award; contract changes go through variation orders.`;
  } else if (inProgress) {
    summary = `Round ${inProgress.round_no} is ${inProgress.status === 'open' ? 'open' : 'evaluated and waiting for the award'}. The award sets the project's contractor and contract amount.`;
  } else if (bidding.project?.contractor_id) {
    summary = bidding.rounds.length
      ? 'This project already has a contractor, so no new bidding round can be opened. The earlier rounds stay on record below.'
      : `${perms.open_round_message || 'This project already has a contractor.'} It was registered with its contractor, so no bidding is recorded here.`;
  } else if (perms.can_manage) {
    summary = 'Not yet awarded. Record the bidding here: the award to the lowest passed bid sets the project\'s contractor and contract amount.';
  } else {
    summary = 'Not yet awarded. The award to the lowest passed bid sets the project\'s contractor and contract amount.';
  }

  return (
    <div className="space-y-6">
      <Card>
        {/* With no round yet, the button is in the empty state below (once on the page). */}
        <CardHeader title="Bidding of the contract" description={summary} actions={bidding.rounds.length > 0 && openButton} />
      </Card>

      <BiddingRounds
        bidding={bidding}
        handlers={perms.can_manage ? handlers : undefined}
        emptyAction={openButton}
        emptyDescription={
          perms.can_open_round
            ? 'Open a round with the opening date of bids. The ABC is the project\'s approved budget at that moment.'
            : 'No bidding round has been recorded for this project.'
        }
      />

      <RoundModal
        open={dialog?.kind === 'open' || dialog?.kind === 'editRound'}
        round={dialog?.kind === 'editRound' ? r : null}
        project={project}
        onClose={close}
        onSave={async (body) => {
          if (dialog.kind === 'open') await write(() => api.post(`/projects/${project.id}/bidding/rounds`, body), 'Bidding round opened.');
          else await write(() => api.patch(`/bidding/rounds/${r.id}`, body), 'Bidding round updated.');
        }}
      />
      <BidModal
        open={dialog?.kind === 'addBid' || dialog?.kind === 'editBid'}
        round={r}
        bid={dialog?.kind === 'editBid' ? dialog.bid : null}
        onClose={close}
        onSave={async (body) => {
          if (dialog.kind === 'addBid') await write(() => api.post(`/bidding/rounds/${r.id}/bids`, body), 'Bid recorded.');
          else await write(() => api.patch(`/bidding/bids/${dialog.bid.id}`, body), 'Bid updated.');
        }}
      />
      <EligibilityModal
        open={dialog?.kind === 'eligibility'}
        round={r}
        bid={dialog?.bid}
        onClose={close}
        onSave={(body) => write(() => api.patch(`/bidding/bids/${dialog.bid.id}`, body), 'Eligibility saved.')}
      />
      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        onClose={close}
        title="Remove this bid?"
        description={dialog?.bid ? `${dialog.bid.contractor_name} · ${peso(dialog.bid.amount)} · round ${r?.round_no}` : undefined}
        confirmLabel="Remove bid"
        confirmIcon={Trash2}
        onConfirm={() => write(() => api.del(`/bidding/bids/${dialog.bid.id}`), 'Bid removed.')}
      >
        <p>Use this for a bid recorded by mistake. A bid that did not qualify stays on record: set its eligibility to failed with the reason instead.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'evaluate'}
        onClose={close}
        title={`Evaluate round ${r?.round_no ?? ''}?`}
        confirmLabel="Evaluate"
        confirmVariant="primary"
        confirmIcon={ClipboardCheck}
        onConfirm={() => write(() => api.post(`/bidding/rounds/${r.id}/evaluate`), 'Round evaluated. The passed bids are ranked.')}
      >
        <p>The passed bids are ranked by amount, lowest first. After this, bids can no longer be added, changed or removed; eligibility can still change (post-qualification).</p>
      </ConfirmDialog>
      <FailDialog
        open={dialog?.kind === 'fail'}
        round={r}
        onClose={close}
        onConfirm={(reason) => write(() => api.post(`/bidding/rounds/${r.id}/fail`, { reason }), 'Failure of bidding recorded. A new round can be opened.')}
      />
      <ConfirmDialog
        open={dialog?.kind === 'award'}
        onClose={close}
        title={`Award round ${r?.round_no ?? ''}?`}
        confirmLabel="Award the contract"
        confirmVariant="primary"
        confirmIcon={Award}
        onConfirm={async () => {
          try {
            await write(() => api.post(`/bidding/rounds/${r.id}/award`, dialog.bid ? { bid_id: dialog.bid.id } : {}), 'Contract awarded. The project\'s contractor and contract amount are set.');
          } catch (e) {
            // Whatever went wrong, show the round and the project as they are now (the error stays in the dialog).
            reload();
            reloadProject();
            throw e;
          }
          reloadProject(); // the header and Overview show the new contractor
        }}
      >
        <p>{awardConfirmText(r, dialog?.bid)}</p>
        <p className="text-xs text-slate-500">Only the lowest passed bid can be awarded. To award another bidder, first mark the lowest bid failed with the reason.</p>
      </ConfirmDialog>
    </div>
  );
}

function ErrorAlert({ err, title }) {
  if (!err) return null;
  return (
    <Alert tone="error" title={title} className="sm:col-span-2">
      {err.message}
      {err.details?.length > 0 && <ul className="mt-1 list-disc pl-4">{err.details.map((d, i) => <li key={i}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}</ul>}
    </Alert>
  );
}

/** Open a round (`round` null) or edit an open round's opening date and notes. */
function RoundModal({ open, round, project, onClose, onSave }) {
  const [form, setForm] = useState({ opening_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setForm({ opening_date: round?.opening_date || todayIso(), notes: round?.notes || '' });
  }, [open, round]);
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.opening_date) return setErr({ message: 'Choose the opening date of bids.' });
    setSaving(true);
    setErr(null);
    try {
      await onSave({ opening_date: form.opening_date, notes: form.notes.trim() || null });
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={round ? `Edit round ${round.round_no}` : 'Open a bidding round'}
      description={round ? `ABC ${peso(round.abc)} (fixed when the round was opened)` : `The ABC is the approved budget now: ${peso(project.approved_budget)}.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="round-form" icon={round ? Save : Gavel} loading={saving}>{round ? 'Save' : 'Open round'}</Button></>}
    >
      <form id="round-form" onSubmit={submit} className="space-y-4">
        <ErrorAlert err={err} title={round ? 'Not saved' : 'Not opened'} />
        <Field label="Opening of bids" required error={fe.opening_date}>
          {(a) => <Input {...a} type="date" value={form.opening_date} onChange={(e) => setForm((f) => ({ ...f, opening_date: e.target.value }))} required />}
        </Field>
        <Field label="Notes" error={fe.notes} hint="For example the invitation to bid reference or where the bids were opened. At most 1000 characters.">
          {(a) => <Textarea {...a} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} maxLength={1000} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Add a bid (contractor + amount) or change an open round's bid amount. */
function BidModal({ open, round, bid, onClose, onSave }) {
  const { ref } = useReference();
  const [form, setForm] = useState({ contractor_id: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setForm({ contractor_id: bid?.contractor_id || '', amount: bid ? String(bid.amount) : '' });
  }, [open, bid]);
  const options = bidderOptions(ref?.contractors, round);
  const fe = fieldErrors(err);
  const above = round && isAboveAbc(form.amount, round.abc);

  const submit = async (e) => {
    e.preventDefault();
    if (!bid && !form.contractor_id) return setErr({ message: 'Choose a contractor from the list.' });
    const problem = bidAmountProblem(form.amount);
    if (problem) return setErr({ message: problem });
    setSaving(true);
    setErr(null);
    try {
      await onSave(bid ? { amount: Number(form.amount) } : { contractor_id: form.contractor_id, amount: Number(form.amount) });
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bid ? 'Change the bid' : 'Add a bid'}
      description={round ? `Round ${round.round_no} · ABC ${peso(round.abc)}` : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="bid-form" icon={Save} loading={saving}>{bid ? 'Save' : 'Add bid'}</Button></>}
    >
      <form id="bid-form" onSubmit={submit} className="space-y-4">
        <ErrorAlert err={err} title="Not saved" />
        {bid ? (
          <Field label="Contractor">{(a) => <Input {...a} value={bid.contractor_name || ''} readOnly aria-readonly="true" className="bg-slate-50" />}</Field>
        ) : (
          <Field
            label="Contractor"
            required
            error={fe.contractor_id}
            hint={
              <>
                {ref && options.length === 0 ? 'Every active contractor already has a bid in this round. ' : 'Registered, active contractors without a bid in this round. '}
                New bidders are added on the <Link className="text-brand-700 hover:underline" to="/app/contractors">Contractors</Link> page first.
              </>
            }
          >
            {(a) => (
              <Select {...a} value={form.contractor_id} onChange={(e) => setForm((f) => ({ ...f, contractor_id: e.target.value }))}>
                <option value="">{ref ? 'Choose a contractor' : 'Loading contractors…'}</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Bid amount (PHP)" required error={fe.amount}>
          {(a) => <Input {...a} type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required invalid={above} />}
        </Field>
        {above && (
          <Alert tone={bid?.eligibility === 'passed' ? 'error' : 'warning'}>
            {bid?.eligibility === 'passed'
              ? `This bid passed, and a bid above the ABC (${peso(round.abc)}) cannot stay passed, so this amount will be refused. Lower it, or first set the bid's eligibility to failed with the reason.`
              : `This bid is above the ABC (${peso(round.abc)}). It can be recorded, but it cannot pass: ${ABOVE_ABC_MESSAGE}`}
          </Alert>
        )}
      </form>
    </Modal>
  );
}

/** Passed / failed (with the reason) / back to pending (open round only). */
function EligibilityModal({ open, round, bid, onClose, onSave }) {
  const [form, setForm] = useState({ eligibility: 'pending', eligibility_note: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open || !bid) return;
    setErr(null);
    const choices = eligibilityChoices(round?.status);
    setForm({ eligibility: choices.includes(bid.eligibility) ? bid.eligibility : choices[0], eligibility_note: bid.eligibility_note || '' });
  }, [open, bid, round]);
  if (!bid || !round) return null;
  const aboveAbc = Boolean(bid.above_abc);
  const problem = eligibilityProblem({ eligibility: form.eligibility, note: form.eligibility_note, aboveAbc });
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    if (problem) return setErr({ message: problem });
    setSaving(true);
    setErr(null);
    try {
      await onSave({ eligibility: form.eligibility, eligibility_note: form.eligibility_note.trim() || null });
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Eligibility of the bid"
      description={`${bid.contractor_name} · ${peso(bid.amount)} · round ${round.round_no}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="eligibility-form" icon={Save} loading={saving}>Save</Button></>}
    >
      <form id="eligibility-form" onSubmit={submit} className="space-y-4">
        <ErrorAlert err={err} title="Not saved" />
        {aboveAbc && <p className="flex flex-wrap items-center gap-2 text-sm text-amber-900"><AboveAbcWarning /> {ABOVE_ABC_MESSAGE}</p>}
        <Field label="Eligibility" required error={fe.eligibility} hint={round.status === 'evaluated' ? 'The round is evaluated: a bid stays passed or failed (post-qualification).' : undefined}>
          {(a) => (
            <Select
              {...a}
              value={form.eligibility}
              onChange={(e) => {
                const eligibility = e.target.value;
                // A failed bid's reason does not stay as the note of a bid that now passes (the API clears it too).
                setForm((f) => ({ eligibility, eligibility_note: eligibility !== 'failed' && bid.eligibility === 'failed' && f.eligibility_note === (bid.eligibility_note || '') ? '' : f.eligibility_note }));
              }}
            >
              {eligibilityChoices(round.status).map((k) => <option key={k} value={k}>{eligibilityMeta(k).label}</option>)}
            </Select>
          )}
        </Field>
        <Field
          label={form.eligibility === 'failed' ? 'Reason the bid failed' : 'Note'}
          required={form.eligibility === 'failed'}
          error={fe.eligibility_note}
          hint={form.eligibility === 'failed' ? '5–500 characters, for example "Expired PCAB licence". Shown on the public abstract of bids.' : 'Optional, at most 500 characters. Shown on the public abstract of bids.'}
        >
          {(a) => <Textarea {...a} value={form.eligibility_note} onChange={(e) => setForm((f) => ({ ...f, eligibility_note: e.target.value }))} rows={2} maxLength={500} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Failure of bidding: the reason (5–500 characters). */
function FailDialog({ open, round, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const problem = failReasonProblem(reason);
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Failure of bidding, round ${round?.round_no ?? ''}`}
      description="The round becomes final and stays on record. A new round can then be opened."
      confirmLabel="Declare failure of bidding"
      confirmIcon={XCircle}
      confirmDisabled={Boolean(problem)}
      onConfirm={() => onConfirm(reason.trim())}
    >
      <Field label="Reason" required hint='5–500 characters, for example "No bid passed the eligibility check." Shown on the public abstract of bids.'>
        {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />}
      </Field>
    </ConfirmDialog>
  );
}
