import { BadgeCheck, CircleSlash, Clock, Hourglass } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '../common/Badges.jsx';
import Button from '../common/Button.jsx';
import { Card, CardBody, CardHeader } from '../common/Card.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Textarea } from '../common/Form.jsx';
import { dateTime } from '../../lib/format.js';
import { DECISION_TEXT, NOT_YET_NOTE_MAX, NOT_YET_NOTE_MIN, VERIFIED_LOCK_MESSAGE, verificationCard } from '../../lib/progress.js';

const DECISION_CLS = { verified: 'bg-emerald-50 text-emerald-800', not_yet: 'bg-amber-50 text-amber-800' };
const ROLE_TITLE = { auditor: 'Auditor', pacc: 'PACC' };

/**
 * Progress rules (030): the completion verification of a project. A Completed project shows 99% ("Completed –
 * awaiting verification") until both the Auditor and PACC verify it; then 100% ("Completed – verified") and its
 * progress and photos are locked. `actor`: 'auditor' (Flag & audit tab, Auditor) or 'pacc' (PACC project page)
 * may decide; everyone else reads. `onDecide(decision, note)` posts and returns the new state.
 */
export default function CompletionVerificationCard({ state, actor = null, onDecide }) {
  const card = verificationCard(state, actor);
  const [asking, setAsking] = useState(null); // 'verified' | 'not_yet'
  const [note, setNote] = useState('');
  const close = () => {
    setAsking(null);
    setNote('');
  };
  const noteOk = note.trim().length >= NOT_YET_NOTE_MIN && note.trim().length <= NOT_YET_NOTE_MAX;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Completion verification"
        description="A completed project shows 100% only after both the Auditor and PACC verify its completion."
        actions={
          card.canAct && (
            <>
              <Button size="sm" variant="secondary" icon={CircleSlash} onClick={() => setAsking('not_yet')} disabled={!card.canNotYet}>Not yet</Button>
              <Button size="sm" icon={BadgeCheck} onClick={() => setAsking('verified')} disabled={!card.canVerify} title={card.verifyBlockedReason || undefined}>Verify completion</Button>
            </>
          )
        }
      />
      <CardBody className="space-y-4 text-sm">
        <Summary card={card} />
        {card.canAct && card.verifyBlockedReason && <p className="text-xs font-medium text-amber-800">{card.verifyBlockedReason}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {card.sides.map((s) => (
            <div key={s.role} className="rounded-md border border-slate-200 p-3">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{s.title}</span>
                <Pill className={DECISION_CLS[s.decision] || 'bg-slate-100 text-slate-600'}>{s.text}</Pill>
              </p>
              {s.note && <p className="mt-1.5 whitespace-pre-line break-words text-slate-700">{s.note}</p>}
              {s.at && <p className="mt-1 text-xs text-slate-500">{s.by ? `${s.by} · ` : ''}{dateTime(s.at)}</p>}
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</p>
          {card.history.length === 0 ? (
            <p className="text-slate-500">No decisions yet.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-auto rounded-md border border-slate-200">
              {card.history.map((h) => (
                <li key={h.id} className={`px-3 py-2 ${h.counts ? '' : 'bg-slate-50 text-slate-500'}`}>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{ROLE_TITLE[h.verifier_role] || h.verifier_role}</span>
                    <Pill className={DECISION_CLS[h.decision] || 'bg-slate-100 text-slate-600'}>{DECISION_TEXT[h.decision] || h.decision}</Pill>
                    <span className="text-xs text-slate-500">{h.verifier_name ? `${h.verifier_name} · ` : ''}{dateTime(h.created_at)}</span>
                    {!h.counts && <span className="text-xs text-slate-500">(before the project last became Completed; no longer counts)</span>}
                  </p>
                  {h.note && <p className="mt-0.5 whitespace-pre-line break-words text-slate-700">{h.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>

      <ConfirmDialog
        open={asking === 'verified'}
        onClose={close}
        title="Verify completion"
        description={`You confirm, as ${actor === 'pacc' ? 'PACC' : 'the Auditor'}, that the work on this project is complete.`}
        confirmLabel="Verify completion"
        confirmVariant="primary"
        confirmIcon={BadgeCheck}
        onConfirm={async () => {
          await onDecide('verified', null);
          close();
        }}
      >
        <p>When both the Auditor and PACC have verified, the project shows 100% and its progress, phase plan and 360° photos can no longer change. Finance records and documents stay open.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={asking === 'not_yet'}
        onClose={close}
        title="Not yet"
        description="Record that the completion cannot be verified yet, and why. The project stays at 99%."
        confirmLabel="Record Not yet"
        confirmVariant="primary"
        confirmIcon={CircleSlash}
        confirmDisabled={!noteOk}
        onConfirm={async () => {
          await onDecide('not_yet', note.trim());
          close();
        }}
      >
        <Field label="Reason" required hint={`${note.trim().length}/${NOT_YET_NOTE_MAX} · at least ${NOT_YET_NOTE_MIN} characters`}>
          {(a) => <Textarea {...a} rows={4} maxLength={NOT_YET_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} invalid={note.length > 0 && !noteOk} />}
        </Field>
      </ConfirmDialog>
    </Card>
  );
}

function Summary({ card }) {
  if (card.phase === 'verified') {
    return (
      <Alert tone="info" title="Completed – verified">
        Both the Auditor and PACC verified the completion. The project shows 100%. {VERIFIED_LOCK_MESSAGE}
      </Alert>
    );
  }
  if (card.phase === 'not_completed') {
    return (
      <p className="flex items-start gap-2 text-slate-600">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        Verification opens once the project is Completed (every phase at 100%, an actual completion date and a final as-built 360° photo).
      </p>
    );
  }
  if (card.phase === 'awaiting_case') {
    return (
      <Alert tone="warning" title="Completed – awaiting verification">
        The Auditor and PACC both verified. The project becomes verified once its PACC case is closed.
      </Alert>
    );
  }
  return (
    <p className="flex items-start gap-2 text-slate-700">
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <span>
        <strong className="font-semibold">Completed – awaiting verification.</strong> The project shows 99% until both verify. Waiting for: {card.waitingFor.join(' and ')}.
      </span>
    </p>
  );
}
