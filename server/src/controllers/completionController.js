/**
 * Progress rules (migration 030) — completion verification
 *   GET  /projects/:id/completion-verification       staff, and contractors (own projects, RLS)
 *   POST /projects/:id/completion-verification       Auditor: { decision: 'verified' | 'not_yet', note? }
 *   POST /pacc/projects/:id/completion-verification  PACC: the same (refused while a PACC case is open)
 * When both current decisions are 'verified', projects.completion_verified_at is set, the overall
 * progress becomes 100% and the project is locked (services/completionVerification.js).
 * Auditor decisions are logged in activity_logs, PACC decisions in pacc_activity; the moment the
 * project becomes verified also gets a neutral activity_logs line "Completion verified".
 * The project never becomes verified while it has an open PACC case: the decision is recorded and
 * the verification happens when the case closes (paccController.updateCase).
 * A PACC row names no member (verified_by NULL, verifier_name 'PACC'): the contractor, possibly the
 * investigated party, reads the history; the member is recorded in pacc_activity only.
 */
import { adminClient } from '../config/supabase.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { assertCanVerify, currentVerifications, isFullyVerified, verificationState, verifierIdentity } from '../services/completionVerification.js';
import { logPacc } from '../services/paccActivity.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { notFound, unwrap } from '../utils/httpError.js';

const PROJECT_COLS = 'id, project_code, status, completed_at, completion_verified_at';
const OPEN_CASE = ['under_investigation', 'case_filed'];
const ROW_COLS = 'id, project_id, verifier_role, decision, note, verified_by, verifier_name, created_at';
const DECISION_TEXT = { verified: 'Verified', not_yet: 'Recorded "Not yet" on' };

/** Every verification row of a project, newest first (through `db`, so RLS applies to req.db). */
export async function loadVerifications(db, projectId) {
  return unwrap(await db.from('completion_verifications').select(ROW_COLS).eq('project_id', projectId).order('created_at', { ascending: false }));
}

export async function getCompletionVerification(req, res) {
  // req.db: a contractor reads only its own company's projects (RLS), staff every project.
  const project = unwrap(await req.db.from('projects').select(PROJECT_COLS).eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const rows = await loadVerifications(req.db, project.id);
  res.json({ data: verificationState(project, rows) });
}

async function recordVerification(req, res, role) {
  const { id } = req.params;
  const { decision, note } = req.body;
  const project = unwrap(await adminClient.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found');
  let hasOpenPaccCase = false;
  if (role === 'pacc') {
    const open = unwrap(await adminClient.from('pacc_cases').select('id').eq('project_id', id).in('status', OPEN_CASE).limit(1));
    hasOpenPaccCase = open.length > 0;
  }
  assertCanVerify({ project, role, decision, hasOpenPaccCase });

  const row = unwrap(
    await adminClient
      .from('completion_verifications')
      .insert({
        project_id: id,
        verifier_role: role,
        decision,
        note: note || null,
        ...verifierIdentity(role, req.user),
      })
      .select(ROW_COLS)
      .single(),
  );

  const code = await projectCode(id);
  const entry = {
    action: decision === 'verified' ? 'completion.verify' : 'completion.not_yet',
    entityType: 'project',
    entityId: id,
    projectId: id,
    summary: `${DECISION_TEXT[decision]} the completion of ${code}${role === 'pacc' ? ' (PACC)' : ''}${note ? `: ${note}` : ''}`,
    details: { verifier_role: role, decision, note: note || null, verification_id: row.id },
  };
  if (role === 'pacc') await logPacc(req, entry);
  else await logActivity(req, entry);

  // Both sides verified after the project last became Completed, and no open PACC case: verified, 100%, locked.
  // The flag-history row of that evaluation names no PACC member (contractors read flag history).
  const outcome = await finalizeCompletionIfReady(id, { actorId: role === 'pacc' ? null : req.user.id });
  const rows = await loadVerifications(adminClient, id);
  const current = outcome.project ?? project;
  const extra = {
    ...(role === 'pacc' && { pacc_case_open: hasOpenPaccCase }),
    ...(outcome.waitingForCase && { awaiting_pacc_case: true, message: AWAITING_PACC_CASE_MESSAGE }),
  };
  res.status(201).json({ data: verificationState(current, rows, extra) });
}

export const AWAITING_PACC_CASE_MESSAGE = 'Recorded. The project becomes verified once its PACC case is closed.';

/**
 * Set projects.completion_verified_at (and 100%) when the project is Completed, not yet verified,
 * both current decisions (made after completed_at) are 'verified', and it has no open PACC case.
 * Called after every decision and when a PACC case closes. `actorId` goes to the flag-history row
 * of the re-evaluation: null when PACC caused it, so no PACC member is named where contractors read.
 * Returns { verified, waitingForCase, project } (project: the row after the change, or null).
 */
export async function finalizeCompletionIfReady(projectId, { actorId = null, db = adminClient, reevaluateFn = reevaluate, log = logActivity } = {}) {
  const project = unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', projectId).maybeSingle());
  const none = { verified: false, waitingForCase: false, project };
  if (!project || project.status !== 'completed' || project.completion_verified_at) return none;
  if (!isFullyVerified(currentVerifications(await loadVerifications(db, projectId), project.completed_at))) return none;
  const open = unwrap(await db.from('pacc_cases').select('id').eq('project_id', projectId).in('status', OPEN_CASE).limit(1));
  if (open.length) return { ...none, waitingForCase: true };

  const now = new Date().toISOString();
  // The guard lets only one of two simultaneous calls set it (and log it).
  const done = unwrap(
    await db
      .from('projects')
      .update({ completion_verified_at: now, overall_progress: 100 })
      .eq('id', projectId)
      .eq('status', 'completed')
      .is('completion_verified_at', null)
      .select(PROJECT_COLS),
  );
  if (!done.length) return { ...none, project: unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', projectId).maybeSingle()) };
  await reevaluateFn(projectId, 'completion_verified', actorId);
  await log(null, {
    action: 'completion.verified',
    entityType: 'project',
    entityId: projectId,
    projectId,
    summary: `Completion verified: ${project.project_code} is 100% complete (Auditor and PACC verified); its progress and photos are now locked`,
    details: { completion_verified_at: now },
  });
  return { verified: true, waitingForCase: false, project: unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', projectId).maybeSingle()) };
}

export const verifyAsAuditor = (req, res) => recordVerification(req, res, 'auditor');
export const verifyAsPacc = (req, res) => recordVerification(req, res, 'pacc');
