// Progress rules (migration 030): sub-activities, reference photos on every report, a Completed
// project at 99% until the Auditor and PACC verified it, then 100% and locked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import {
  COMPLETED_AWAITING_LABEL,
  COMPLETED_VERIFIED_LABEL,
  behindSchedule,
  completionLabel,
  computeActivityProgress,
  computeSlippage,
  officialProgress,
} from '../services/completion.js';
import {
  NOT_COMPLETED_MESSAGE,
  PACC_OPEN_CASE_MESSAGE,
  VERIFIED_LOCK_MESSAGE,
  assertCanVerify,
  assertCompletionDateEditable,
  assertNotLocked,
  currentVerifications,
  isFullyVerified,
  PACC_VERIFIER_NAME,
  verificationState,
  verifierIdentity,
} from '../services/completionVerification.js';
import { evaluateProject } from '../services/flagDetection.js';
import { completionTimestamps } from '../services/projectEvaluation.js';
import { ACTIVITY_WEIGHTS_MESSAGE, applyProgressUpdate, checkPhasePlan, checkProgressUpdate } from '../services/validationRules.js';
import { PROGRESS_PHOTOS_MESSAGE, parseJsonPayload, uploadProgressPhotos } from '../middleware/upload.js';
import { completionVerification, phasesReplace, progressSubmit } from '../routes/schemas.js';
import { errorHandler } from '../middleware/errorHandler.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PDF = Buffer.from('%PDF-1.4 not a photo');
const messages = (problems) => problems.map((p) => p.message).join(' | ');
const user = (role, over = {}) => ({ id: `${role}-id`, role, profile: { approval_status: 'approved', full_name: 'Ana Cruz', ...over } });

let role;
let routers;
let phasesController;
before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  role = await import('../middleware/role.js');
  phasesController = await import('../controllers/phasesController.js');
  routers = {
    progress: (await import('../routes/progress.js')).default,
    images: (await import('../routes/images.js')).default,
    audit: (await import('../routes/audit.js')).default,
    pacc: (await import('../routes/pacc.js')).default,
    finance: (await import('../routes/finance.js')).default,
    documents: (await import('../routes/documents.js')).default,
  };
});

// ---------------------------------------------------------------------------
// The exact messages and labels
// ---------------------------------------------------------------------------
describe('messages and labels', () => {
  it('are exact', () => {
    assert.equal(VERIFIED_LOCK_MESSAGE, "This project's completion was verified; its progress and photos can no longer change.");
    assert.equal(PACC_OPEN_CASE_MESSAGE, 'Close the PACC case before verifying completion.');
    assert.equal(PROGRESS_PHOTOS_MESSAGE, 'Attach 1 to 5 reference photos.');
    assert.equal(ACTIVITY_WEIGHTS_MESSAGE, 'Sub-activity weights in a phase must add up to 100.');
    assert.equal(NOT_COMPLETED_MESSAGE, 'Only a completed project can be verified.');
    assert.equal(COMPLETED_AWAITING_LABEL, 'Completed – awaiting verification');
    assert.equal(COMPLETED_VERIFIED_LABEL, 'Completed – verified');
  });
  it('completionLabel: only for a Completed project', () => {
    assert.equal(completionLabel({ status: 'completed', completion_verified_at: null }), COMPLETED_AWAITING_LABEL);
    assert.equal(completionLabel({ status: 'completed', completion_verified_at: '2026-11-28T00:00:00Z' }), COMPLETED_VERIFIED_LABEL);
    assert.equal(completionLabel({ status: 'ongoing', completion_verified_at: null }), null);
    assert.equal(completionLabel(null), null);
  });
});

// ---------------------------------------------------------------------------
// The 99% cap (one helper, used wherever overall progress is stored)
// ---------------------------------------------------------------------------
describe('officialProgress', () => {
  it('caps at 99 until verified', () => {
    assert.equal(officialProgress(100, null), 99);
    assert.equal(officialProgress(99.5, undefined), 99);
    assert.equal(officialProgress(42.125, null), 42.13);
    assert.equal(officialProgress(0, null), 0);
  });
  it('is the computed value once verified', () => {
    assert.equal(officialProgress(100, '2026-11-28T00:00:00Z'), 100);
    assert.equal(officialProgress(64.5, '2026-11-28T00:00:00Z'), 64.5);
  });
  it('is used by every writer of overall_progress', () => {
    const phases = readFileSync(new URL('../controllers/phasesController.js', import.meta.url), 'utf8');
    assert.match(phases, /const overall = officialProgress\(computeOverallProgress\(phases\), project\.completion_verified_at\);\s+unwrap\(await adminClient\.from\('projects'\)\.update\(\{ overall_progress: overall/);
    // the report row stores the same capped value
    assert.match(phases, /overall_progress: overall,\s+phase_snapshot:/);
    const evaluation = readFileSync(new URL('../services/projectEvaluation.js', import.meta.url), 'utf8');
    assert.match(evaluation, /overall_progress: result\.metrics\.overallProgress/);
    // The only other writer sets 100 once both verified (completionController).
    const writers = ['controllers', 'services'].flatMap((dir) =>
      ['phasesController.js', 'completionController.js', 'projectEvaluation.js', 'projectsController.js', 'financeController.js', 'imagesController.js'].map((f) => [dir, f]),
    );
    for (const [dir, f] of writers) {
      let src;
      try {
        src = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      } catch {
        continue;
      }
      const writes = (src.match(/overall_progress: [^,}\n]+/g) ?? []).map((w) => w.trim());
      for (const w of writes) assert.match(w, /overall_progress: (overall|result\.metrics\.overallProgress|100)$/, `${f}: ${w}`);
    }
    assert.match(readFileSync(new URL('../controllers/completionController.js', import.meta.url), 'utf8'), /\.update\(\{ completion_verified_at: now, overall_progress: 100 \}\)/);
  });
  it('the PDF and Excel reports show the stored value (they never compute it)', () => {
    for (const f of ['../controllers/reportsController.js', '../services/report.js']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /computeOverallProgress|detectCompletion/, f);
    }
  });
});

describe('slippage of a Completed project is 0', () => {
  it('computeSlippage (actual − planned) is 0 when Completed', () => {
    assert.equal(computeSlippage(99, 100, 'completed'), 0);
    assert.equal(computeSlippage(40, 50, 'ongoing'), -10);
    assert.equal(computeSlippage(40, 50), -10);
  });
  it('behindSchedule (planned − overall from a stored row) is 0 when Completed', () => {
    assert.equal(behindSchedule({ status: 'completed', overall_progress: 99, planned_progress: 100 }), 0);
    assert.equal(behindSchedule({ status: 'delayed', overall_progress: 40.5, planned_progress: 60 }), 19.5);
    assert.equal(behindSchedule({ status: 'ongoing', overall_progress: 80, planned_progress: 70 }), -10);
    assert.equal(behindSchedule(null), 0);
  });
  it('is used by the phases view, the dashboard and the audit PDF', () => {
    const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(read('../controllers/phasesController.js'), /slippage: computeSlippage\(overall, planned, project\.status\)/);
    assert.match(read('../controllers/dashboardController.js'), /slippage: behindSchedule\(r\)/);
    assert.match(read('../services/report.js'), /const slip = behindSchedule\(p\);/);
    // no other planned − overall computation is left on the server
    for (const f of ['../controllers/dashboardController.js', '../services/report.js', '../controllers/reportsController.js', '../controllers/mapController.js', '../controllers/flagsController.js']) {
      assert.doesNotMatch(read(f), /planned_progress\) - Number\(r\.overall_progress|planned - actual/, f);
    }
  });
});

describe('evaluateProject with the cap', () => {
  const project = {
    latitude: 13.4, longitude: 120.7, approved_budget: 1100000, contract_amount: 1000000, status: 'ongoing',
    notice_to_proceed: '2026-01-01', target_completion_date: '2026-12-31', actual_completion_date: '2026-11-15',
  };
  const done = [{ weight: 100, accomplishment: 100 }];
  const final = [{ id: 'i', file_hash: 'h', gps_source: 'exif', latitude: 13.4, longitude: 120.7, captured_at: '2026-11-15T09:00:00+08:00', inspection_date: '2026-11-15', is_final: true }];
  const run = (p, phases = done, images = final) => evaluateProject({ project: { ...project, ...p }, phases, images, today: '2026-11-20' });

  it('a Completed project that is not verified shows 99%', () => {
    const r = run({});
    assert.equal(r.status, 'completed');
    assert.equal(r.metrics.overallProgress, 99);
  });
  it('a verified Completed project shows 100%', () => {
    const r = run({ status: 'completed', completion_verified_at: '2026-11-19T00:00:00Z' });
    assert.equal(r.metrics.overallProgress, 100);
  });
  it('a verification no longer counts once the project is not Completed (no final photo)', () => {
    const r = run({ completion_verified_at: '2026-11-19T00:00:00Z' }, done, []);
    assert.notEqual(r.status, 'completed');
    assert.equal(r.metrics.overallProgress, 99);
  });
  it('all phases at 100% without the other requirements: 99% and the missing items are still reported', () => {
    const r = run({ actual_completion_date: null }, done, []);
    assert.equal(r.metrics.overallProgress, 99);
    assert.ok(r.reasons.some((x) => x.code === 'COMPLETION_INCOMPLETE_REQUIREMENTS'));
  });
});

describe('completionTimestamps', () => {
  const NOW = new Date('2026-11-28T03:00:00Z');
  it('sets completed_at when the project becomes Completed, keeps it while Completed', () => {
    assert.deepEqual(completionTimestamps({ completed_at: null }, 'completed', NOW), { completed_at: NOW.toISOString() });
    assert.deepEqual(completionTimestamps({ completed_at: '2026-11-01T00:00:00Z' }, 'completed', NOW), {});
  });
  it('clears completed_at and the verification when it leaves Completed', () => {
    assert.deepEqual(completionTimestamps({ completed_at: '2026-11-01T00:00:00Z', completion_verified_at: '2026-11-02T00:00:00Z' }, 'ongoing', NOW), {
      completed_at: null,
      completion_verified_at: null,
    });
    assert.deepEqual(completionTimestamps({ completed_at: null, completion_verified_at: null }, 'delayed', NOW), {});
  });
  it('is saved with the evaluation', () => {
    const src = readFileSync(new URL('../services/projectEvaluation.js', import.meta.url), 'utf8');
    assert.match(src, /const update = \{\s+\.\.\.completionTimestamps\(project, result\.status\),/);
  });
});

// ---------------------------------------------------------------------------
// Verification (either order, both required, after completed_at)
// ---------------------------------------------------------------------------
describe('currentVerifications', () => {
  const completedAt = '2026-11-20T00:00:00Z';
  const row = (verifier_role, decision, created_at, id = `${verifier_role}-${created_at}`) => ({ id, verifier_role, decision, created_at, note: decision === 'not_yet' ? 'Punch list open' : null });

  it('takes the latest decision of each side made after completed_at', () => {
    const rows = [
      row('auditor', 'verified', '2026-11-19T00:00:00Z'), // before completion: does not count
      row('auditor', 'not_yet', '2026-11-21T00:00:00Z'),
      row('auditor', 'verified', '2026-11-22T00:00:00Z'),
      row('pacc', 'verified', '2026-11-21T12:00:00Z'),
    ];
    const c = currentVerifications(rows, completedAt);
    assert.equal(c.auditor.created_at, '2026-11-22T00:00:00Z');
    assert.equal(c.pacc.decision, 'verified');
    assert.equal(isFullyVerified(c), true);
  });
  it('needs both sides, in either order; a later "Not yet" undoes a side', () => {
    assert.equal(isFullyVerified(currentVerifications([row('pacc', 'verified', '2026-11-21T00:00:00Z')], completedAt)), false);
    assert.equal(
      isFullyVerified(currentVerifications([row('pacc', 'verified', '2026-11-21T00:00:00Z'), row('auditor', 'verified', '2026-11-22T00:00:00Z')], completedAt)),
      true,
    );
    assert.equal(
      isFullyVerified(
        currentVerifications(
          [row('pacc', 'verified', '2026-11-21T00:00:00Z'), row('auditor', 'verified', '2026-11-22T00:00:00Z'), row('pacc', 'not_yet', '2026-11-23T00:00:00Z')],
          completedAt,
        ),
      ),
      false,
    );
  });
  it('verifications from before the project last became Completed never count', () => {
    const rows = [row('auditor', 'verified', '2026-11-19T00:00:00Z'), row('pacc', 'verified', '2026-11-19T01:00:00Z')];
    assert.equal(isFullyVerified(currentVerifications(rows, completedAt)), false);
  });
});

describe('assertCanVerify', () => {
  const completed = { status: 'completed', completion_verified_at: null };
  const err = (fn) => {
    try {
      fn();
    } catch (e) {
      return e;
    }
    return null;
  };
  it('only a Completed project (409)', () => {
    const e = err(() => assertCanVerify({ project: { status: 'ongoing' }, role: 'auditor', decision: 'verified' }));
    assert.equal(e.status, 409);
    assert.equal(e.message, NOT_COMPLETED_MESSAGE);
  });
  it('PACC cannot verify with an open PACC case (409); "Not yet" is still recorded', () => {
    const e = err(() => assertCanVerify({ project: completed, role: 'pacc', decision: 'verified', hasOpenPaccCase: true }));
    assert.equal(e.status, 409);
    assert.equal(e.message, PACC_OPEN_CASE_MESSAGE);
    assert.equal(err(() => assertCanVerify({ project: completed, role: 'pacc', decision: 'not_yet', hasOpenPaccCase: true })), null);
    assert.equal(err(() => assertCanVerify({ project: completed, role: 'auditor', decision: 'verified', hasOpenPaccCase: true })), null);
  });
  it('nothing more once verified', () => {
    const e = err(() => assertCanVerify({ project: { ...completed, completion_verified_at: '2026-11-28T00:00:00Z' }, role: 'auditor', decision: 'not_yet' }));
    assert.equal(e.status, 409);
    assert.equal(e.message, VERIFIED_LOCK_MESSAGE);
  });
});

describe('verificationState', () => {
  const project = { id: ID, status: 'completed', completed_at: '2026-11-20T00:00:00Z', completion_verified_at: null };
  const rows = [
    { id: 'v1', verifier_role: 'pacc', decision: 'not_yet', note: 'Site visit pending', verified_by: null, verifier_name: 'PACC', created_at: '2026-11-21T00:00:00Z' },
    { id: 'v0', verifier_role: 'auditor', decision: 'verified', note: null, verified_by: 'a1', verifier_name: 'Auditor A', created_at: '2026-11-19T00:00:00Z' },
  ];
  it('current decisions, the label and the history (newest first, with whether each counts)', () => {
    const s = verificationState(project, rows);
    assert.equal(s.label, COMPLETED_AWAITING_LABEL);
    assert.equal(s.is_verified, false);
    assert.equal(s.auditor, null); // made before completed_at
    assert.equal(s.pacc.decision, 'not_yet');
    assert.deepEqual(s.history.map((h) => [h.id, h.counts]), [['v1', true], ['v0', false]]);
    assert.equal(s.history[0].verifier_name, 'PACC');
    assert.equal(s.history[1].verifier_name, 'Auditor A');
    assert.equal(s.history[1].verified_by, 'a1');
    assert.equal('pacc_case_open' in s, false);
  });
  it('a PACC decision never names the PACC member, for anyone (the decision and reason stay)', () => {
    // even a row written before the rule (or by hand) is answered without the member
    const s = verificationState(project, [{ ...rows[0], verified_by: 'p1', verifier_name: 'PACC Member' }, rows[1]]);
    assert.equal(s.pacc.verifier_name, 'PACC');
    assert.equal(s.pacc.verified_by, null);
    assert.equal(s.pacc.note, 'Site visit pending');
  });
  it('not Completed: no label and nothing counts', () => {
    const s = verificationState({ ...project, status: 'ongoing', completed_at: null }, rows);
    assert.equal(s.label, null);
    assert.equal(s.pacc, null);
    assert.ok(s.history.every((h) => h.counts === false));
  });
  it('verified', () => {
    const s = verificationState({ ...project, completion_verified_at: '2026-11-22T00:00:00Z' }, [], { pacc_case_open: false });
    assert.equal(s.label, COMPLETED_VERIFIED_LABEL);
    assert.equal(s.is_verified, true);
    assert.equal(s.pacc_case_open, false);
  });
});

describe('verifierIdentity', () => {
  it('an Auditor row names the auditor', () => {
    assert.deepEqual(verifierIdentity('auditor', user('auditor')), { verified_by: 'auditor-id', verifier_name: 'Ana Cruz' });
  });
  it("a PACC row names no member: verified_by NULL, verifier_name 'PACC' (the member goes to pacc_activity only)", () => {
    assert.equal(PACC_VERIFIER_NAME, 'PACC');
    assert.deepEqual(verifierIdentity('pacc', user('pacc')), { verified_by: null, verifier_name: 'PACC' });
    const src = readFileSync(new URL('../controllers/completionController.js', import.meta.url), 'utf8');
    assert.match(src, /\.\.\.verifierIdentity\(role, req\.user\),/);
    assert.doesNotMatch(src, /verified_by: req\.user\.id/);
  });
});

describe('completionVerification schema', () => {
  it('verified needs no note; not yet needs a reason of 5–500 characters', () => {
    assert.equal(completionVerification.safeParse({ decision: 'verified' }).success, true);
    assert.equal(completionVerification.safeParse({ decision: 'not_yet' }).success, false);
    assert.equal(completionVerification.safeParse({ decision: 'not_yet', note: 'abc' }).success, false);
    assert.equal(completionVerification.safeParse({ decision: 'not_yet', note: 'Punch list still open' }).success, true);
    assert.equal(completionVerification.safeParse({ decision: 'not_yet', note: 'x'.repeat(501) }).success, false);
    assert.equal(completionVerification.safeParse({ decision: 'approve' }).success, false);
  });
});

// ---------------------------------------------------------------------------
// The lock at 100% (verified)
// ---------------------------------------------------------------------------
describe('the lock', () => {
  const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err ?? null)));
  it('assertNotLocked: 409 with the exact message once verified', () => {
    assert.throws(() => assertNotLocked({ completion_verified_at: '2026-11-28T00:00:00Z' }), (e) => e.status === 409 && e.message === VERIFIED_LOCK_MESSAGE);
    assert.doesNotThrow(() => assertNotLocked({ completion_verified_at: null }));
    assert.doesNotThrow(() => assertNotLocked(null));
  });
  it('requireUnlockedProject refuses a verified project and passes the others', async () => {
    const mw = (p) => role.makeRequireUnlockedProject(async (id) => (assert.equal(id, ID), p));
    const err = await run(mw({ id: ID, completion_verified_at: '2026-11-28T00:00:00Z' }), { params: { id: ID } });
    assert.equal(err.status, 409);
    assert.equal(err.message, VERIFIED_LOCK_MESSAGE);
    assert.equal(await run(mw({ id: ID, completion_verified_at: null }), { params: { id: ID } }), null);
    assert.equal(await run(mw(null), { params: { id: ID } }), null);
  });
  it('guards progress, the phase plan and every 360° photo write; not finance or documents', () => {
    const has = (router, method, path) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.some((s) => s.handle === role.requireUnlockedProject);
    assert.equal(has(routers.progress, 'post', '/projects/:id/progress'), true);
    assert.equal(has(routers.progress, 'put', '/projects/:id/phases'), true);
    assert.equal(has(routers.images, 'post', '/projects/:id/images'), true);
    assert.equal(has(routers.images, 'patch', '/projects/:id/images/:imageId'), true);
    assert.equal(has(routers.images, 'delete', '/projects/:id/images/:imageId'), true);
    for (const router of [routers.finance, routers.documents]) {
      for (const layer of router.stack.filter((l) => l.route)) {
        assert.equal(layer.route.stack.some((s) => s.handle === role.requireUnlockedProject), false, layer.route.path);
      }
    }
  });
  it('the controllers check it again, and a verified completion date cannot be changed', () => {
    const src = readFileSync(new URL('../controllers/phasesController.js', import.meta.url), 'utf8');
    assert.equal(src.match(/assertNotLocked\(project\);/g).length, 2); // replacePhases, submitProgress
    const locked = { completion_verified_at: '2026-11-28T00:00:00Z', actual_completion_date: '2026-11-15' };
    assert.throws(() => assertCompletionDateEditable(locked, { actual_completion_date: null }), (e) => e.status === 409 && e.message === VERIFIED_LOCK_MESSAGE);
    assert.throws(() => assertCompletionDateEditable(locked, { actual_completion_date: '2026-11-16' }), (e) => e.status === 409);
    assert.doesNotThrow(() => assertCompletionDateEditable(locked, { actual_completion_date: '2026-11-15', name: 'New name' }));
    assert.doesNotThrow(() => assertCompletionDateEditable(locked, { name: 'New name' }));
    assert.doesNotThrow(() => assertCompletionDateEditable({ ...locked, completion_verified_at: null }, { actual_completion_date: null }));
    assert.match(readFileSync(new URL('../controllers/projectsController.js', import.meta.url), 'utf8'), /assertCompletionDateEditable\(current, req\.body\);/);
  });
});

// ---------------------------------------------------------------------------
// Who verifies
// ---------------------------------------------------------------------------
describe('verification routes', () => {
  const guardOf = (router, method, path) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]).route.stack.map((s) => s.handle);
  const refusedAs = (handlers, r) => {
    let out;
    handlers[1]({ user: user(r) }, {}, (e) => { out = e ?? null; });
    return out?.status === 403;
  };
  it('the Auditor verifies a project; nobody else on that route (contractors, Personnel, Admin, PACC)', () => {
    const h = guardOf(routers.audit, 'post', '/projects/:id/completion-verification');
    assert.equal(refusedAs(h, 'auditor'), false);
    for (const r of ['contractor', 'dpwh_personnel', 'admin', 'pacc']) assert.equal(refusedAs(h, r), true, r);
  });
  it('staff and contractors read the state', () => {
    const h = guardOf(routers.audit, 'get', '/projects/:id/completion-verification');
    for (const r of ['auditor', 'dpwh_personnel', 'admin', 'contractor']) assert.equal(refusedAs(h, r), false, r);
    assert.equal(refusedAs(h, 'pacc'), true);
  });
  it('PACC verifies under /pacc (every /pacc route needs the PACC role)', () => {
    assert.ok(routers.pacc.stack.some((l) => l.route?.path === '/projects/:id/completion-verification' && l.route.methods.post));
    const src = readFileSync(new URL('../routes/pacc.js', import.meta.url), 'utf8');
    assert.match(src, /r\.use\(requireAuth, requireRole\(ROLES\.PACC\)\);/);
  });
  it('logs: Auditor → activity_logs, PACC → pacc_activity, and a neutral "Completion verified" line', () => {
    const src = readFileSync(new URL('../controllers/completionController.js', import.meta.url), 'utf8');
    assert.match(src, /if \(role === 'pacc'\) await logPacc\(req, entry\);\s+else await logActivity\(req, entry\);/);
    assert.match(src, /await logActivity\(null, \{\s+action: 'completion\.verified',/);
    assert.match(src, /summary: `Completion verified: /);
    assert.match(src, /\.is\('completion_verified_at', null\)/);
  });
});

// ---------------------------------------------------------------------------
// Sub-activities
// ---------------------------------------------------------------------------
describe('computeActivityProgress', () => {
  it('Σ(weight × accomplishment) ÷ 100, to 2 decimals', () => {
    assert.equal(computeActivityProgress([{ weight: 30, accomplishment: 100 }, { weight: 70, accomplishment: 50 }]), 65);
    assert.equal(computeActivityProgress([{ weight: 33.33, accomplishment: 10 }, { weight: 66.67, accomplishment: 15 }]), 13.33);
    assert.equal(computeActivityProgress([{ weight: 50, accomplishment: 100 }, { weight: 50, accomplishment: 100 }]), 100);
  });
});

describe('checkPhasePlan with sub-activities', () => {
  const project = { notice_to_proceed: '2026-03-01', target_completion_date: '2026-12-31' };
  const phase = (activities, over = {}) => ({ sequence_no: 1, name: 'Earthworks', weight: 100, activities, ...over });
  it('accepts weights that total 100 (± 0.01)', () => {
    assert.deepEqual(checkPhasePlan({ project, phases: [phase([{ name: 'Excavation', weight: 60 }, { name: 'Embankment', weight: 40 }])] }), []);
    assert.deepEqual(checkPhasePlan({ project, phases: [phase([{ name: 'A1', weight: 33.33 }, { name: 'A2', weight: 33.33 }, { name: 'A3', weight: 33.33 }])] }), []);
    assert.deepEqual(checkPhasePlan({ project, phases: [phase([])] }), []);
    assert.deepEqual(checkPhasePlan({ project, phases: [phase(undefined)] }), []);
  });
  it('refuses weights that do not, with the exact message', () => {
    const problems = checkPhasePlan({ project, phases: [phase([{ name: 'Excavation', weight: 60 }, { name: 'Embankment', weight: 30 }])] });
    assert.deepEqual(problems, [{ field: 'phases.0.activities', message: ACTIVITY_WEIGHTS_MESSAGE }]);
  });
  it('refuses two sub-activities with the same name in a phase', () => {
    assert.match(messages(checkPhasePlan({ project, phases: [phase([{ name: 'Excavation', weight: 50 }, { name: ' excavation ', weight: 50 }])] })), /same name/);
  });
  it("refuses another phase's sub-activity, and removing one with reported work", () => {
    const existing = [{ id: 'p1', name: 'Earthworks', accomplishment: 30 }];
    const existingActivities = [
      { id: A1, phase_id: 'p1', name: 'Excavation', accomplishment: 50 },
      { id: A2, phase_id: 'other', name: 'Elsewhere', accomplishment: 0 },
    ];
    const keepOther = checkPhasePlan({ project, phases: [phase([{ id: A2, name: 'Elsewhere', weight: 100 }], { id: 'p1' })], existing, existingActivities });
    assert.match(messages(keepOther), /does not belong/);
    assert.match(messages(keepOther), /"Excavation" already has 50% reported and cannot be removed/);
    // removing every sub-activity is allowed: the phase keeps its %
    assert.deepEqual(checkPhasePlan({ project, phases: [phase([], { id: 'p1' })], existing, existingActivities }), []);
  });
  it('the schema: at most 20 per phase, name 2–120, weight above 0 and at most 100', () => {
    const plan = (activities) => ({ phases: [{ sequence_no: 1, name: 'Earthworks', weight: 100, activities }] });
    assert.equal(phasesReplace.safeParse(plan([{ name: 'Excavation', weight: 100 }])).success, true);
    assert.equal(phasesReplace.safeParse(plan([{ name: 'E', weight: 100 }])).success, false);
    assert.equal(phasesReplace.safeParse(plan([{ name: 'Excavation', weight: 0 }])).success, false);
    assert.equal(phasesReplace.safeParse(plan([{ name: 'Excavation', weight: 101 }])).success, false);
    assert.equal(phasesReplace.safeParse(plan(Array.from({ length: 21 }, (_, i) => ({ name: `A${i}x`, weight: 1 })))).success, false);
  });
});

describe('progress with sub-activities', () => {
  const project = { notice_to_proceed: '2026-03-01' };
  const NOW = '2026-11-18';
  const phases = [
    { id: 'p1', name: 'Earthworks', weight: 40, accomplishment: 50, actual_start: '2026-03-02' },
    { id: 'p2', name: 'Concreting', weight: 60, accomplishment: 10, actual_start: '2026-05-02' },
  ];
  const activities = [
    { id: A1, phase_id: 'p1', name: 'Excavation', weight: 50, accomplishment: 80 },
    { id: A2, phase_id: 'p1', name: 'Embankment', weight: 50, accomplishment: 20 },
  ];
  const check = (u) => checkProgressUpdate({ project, phases, activities, update: { report_date: '2026-11-15', description: 'Work on site', ...u }, now: NOW });

  it("the phase's % is the weighted sub-activity %; sub-activities not listed keep their value", () => {
    const { phaseValues, activityValues } = applyProgressUpdate({
      phases,
      activities,
      update: { phases: [{ phase_id: 'p1', activities: [{ activity_id: A2, accomplishment: 60 }] }, { phase_id: 'p2', accomplishment: 25 }] },
    });
    assert.equal(phaseValues.get('p1'), 70);
    assert.equal(phaseValues.get('p2'), 25);
    assert.equal(activityValues.get(A1), 80);
    assert.equal(activityValues.get(A2), 60);
  });
  it('accepts sub-activity values, and an accomplishment equal to the computed one', () => {
    assert.deepEqual(check({ phases: [{ phase_id: 'p1', activities: [{ activity_id: A2, accomplishment: 60 }] }] }), []);
    assert.deepEqual(check({ phases: [{ phase_id: 'p1', accomplishment: 70, activities: [{ activity_id: A2, accomplishment: 60 }] }] }), []);
  });
  it('a phase with sub-activities cannot be set directly', () => {
    assert.match(messages(check({ phases: [{ phase_id: 'p1', accomplishment: 90 }] })), /"Earthworks" has sub-activities: its accomplishment is computed from them \(50%\)/);
  });
  it("refuses another phase's sub-activity, a repeated one, and a lower value without remarks", () => {
    assert.match(messages(check({ phases: [{ phase_id: 'p2', accomplishment: 20, activities: [{ activity_id: A1, accomplishment: 90 }] }] })), /has no sub-activities/);
    assert.match(messages(check({ phases: [{ phase_id: 'p1', activities: [{ activity_id: A1, accomplishment: 90 }, { activity_id: A1, accomplishment: 95 }] }] })), /listed twice/);
    assert.match(messages(check({ phases: [{ phase_id: 'p1', activities: [{ activity_id: A1, accomplishment: 70 }] }] })), /"Excavation" is lower than the last report \(80%\)/);
    assert.deepEqual(check({ remarks: 'Corrected the excavation volume after the survey.', phases: [{ phase_id: 'p1', activities: [{ activity_id: A1, accomplishment: 70 }, { activity_id: A2, accomplishment: 40 }] }] }), []);
  });
  it('a phase without sub-activities still needs its accomplishment', () => {
    assert.match(messages(check({ phases: [{ phase_id: 'p2' }] })), /Enter the accomplishment of "Concreting"/);
  });
  it('an actual end date needs the computed 100%', () => {
    assert.match(messages(check({ phases: [{ phase_id: 'p1', actual_end: '2026-11-15', activities: [{ activity_id: A1, accomplishment: 100 }] }] })), /only have an actual end date when it is 100% complete/);
    assert.deepEqual(
      check({ phases: [{ phase_id: 'p1', actual_end: '2026-11-15', activities: [{ activity_id: A1, accomplishment: 100 }, { activity_id: A2, accomplishment: 100 }] }] }),
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// The progress report: description + 1–5 reference photos (multipart)
// ---------------------------------------------------------------------------
describe('progressSubmit schema', () => {
  const base = { report_date: '2026-11-15', phases: [{ phase_id: ID, accomplishment: 40 }] };
  it('needs a description of 10–2000 characters', () => {
    assert.equal(progressSubmit.safeParse(base).success, false);
    assert.equal(progressSubmit.safeParse({ ...base, description: 'Too short' }).success, false);
    assert.equal(progressSubmit.safeParse({ ...base, description: 'Excavated 120 m of the drainage canal.' }).success, true);
    assert.equal(progressSubmit.safeParse({ ...base, description: 'x'.repeat(2001) }).success, false);
  });
  it('takes per-activity values (and no phase % for such a phase)', () => {
    const r = progressSubmit.safeParse({ ...base, description: 'Excavated 120 m of the drainage canal.', phases: [{ phase_id: ID, activities: [{ activity_id: A1, accomplishment: 55 }] }] });
    assert.equal(r.success, true);
    assert.equal(r.data.phases[0].accomplishment, undefined);
    assert.equal(progressSubmit.safeParse({ ...base, description: 'Excavated 120 m.', phases: [{ phase_id: ID, activities: [{ activity_id: A1, accomplishment: 120 }] }] }).success, false);
  });
});

describe('checkReferencePhotos', () => {
  it('1 to 5 photos, each really a JPEG, PNG or WebP', () => {
    const photo = { buffer: JPEG };
    for (const files of [undefined, [], Array.from({ length: 6 }, () => photo)]) {
      assert.throws(() => phasesController.checkReferencePhotos(files), (e) => e.status === 400 && e.message === PROGRESS_PHOTOS_MESSAGE);
    }
    assert.deepEqual(phasesController.checkReferencePhotos([photo, photo]), ['jpeg', 'jpeg']);
    assert.throws(() => phasesController.checkReferencePhotos([photo, { buffer: PDF }]), (e) => e.status === 400 && /not a JPEG, PNG or WebP/.test(e.message));
  });
  it('photos are stored as uploaded (no re-encoding) under <project>/<report>/<uuid>.<ext> in progress-photos', () => {
    const src = readFileSync(new URL('../controllers/phasesController.js', import.meta.url), 'utf8');
    assert.equal(phasesController.PHOTO_BUCKET, 'progress-photos');
    assert.match(src, /const path = `\$\{projectId\}\/\$\{reportId\}\/\$\{randomUUID\(\)\}\.\$\{EXT\[formats\[i\]\]\}`;/);
    assert.match(src, /upload\(path, file\.buffer, /);
    assert.doesNotMatch(src, /sharp/);
    // a failure removes the stored files and the report
    assert.match(src, /await adminClient\.storage\.from\(PHOTO_BUCKET\)\.remove\(stored\.map\(\(s\) => s\.path\)\);\s+if \(reportSaved\) await adminClient\.from\('progress_updates'\)\.delete\(\)\.eq\('id', reportId\);/);
  });
});

describe('the multipart contract', () => {
  /** The upload + payload steps of the progress route, then echo what the controller would get. */
  const app = () => {
    const a = express();
    a.post('/r', uploadProgressPhotos, parseJsonPayload, (req, res) => res.json({ body: req.body, files: (req.files || []).map((f) => f.originalname) }));
    a.use(errorHandler);
    return a;
  };
  const payload = JSON.stringify({ report_date: '2026-11-15', description: 'Excavated 120 m of the drainage canal.', phases: [] });

  it('fields as JSON in "payload", photos in "photos"', async () => {
    const res = await request(app()).post('/r').field('payload', payload).attach('photos', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' }).attach('photos', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });
    assert.equal(res.status, 200);
    assert.equal(res.body.body.description, 'Excavated 120 m of the drainage canal.');
    assert.deepEqual(res.body.files, ['a.jpg', 'b.jpg']);
  });
  it('more than 5 photos: 400 "Attach 1 to 5 reference photos."', async () => {
    let r = request(app()).post('/r').field('payload', payload);
    for (let i = 0; i < 6; i += 1) r = r.attach('photos', JPEG, { filename: `${i}.jpg`, contentType: 'image/jpeg' });
    const res = await r;
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, PROGRESS_PHOTOS_MESSAGE);
  });
  it('a non-image file type is refused', async () => {
    const res = await request(app()).post('/r').field('payload', payload).attach('photos', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /not a JPEG, PNG or WebP/);
  });
  it('a missing or malformed payload is a 400', async () => {
    assert.equal((await request(app()).post('/r').attach('photos', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })).status, 400);
    const bad = await request(app()).post('/r').field('payload', '{nope');
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /not valid JSON/);
    assert.equal((await request(app()).post('/r').field('payload', '[1,2]')).status, 400);
  });
  it('the route order: company, lock, upload, payload, validation, completion check, controller', () => {
    const layer = routers.progress.stack.find((l) => l.route?.path === '/projects/:id/progress' && l.route.methods.post);
    const names = layer.route.stack.map((s) => s.handle);
    const at = (fn) => names.indexOf(fn);
    assert.ok(at(role.requireOwnProject) < at(role.requireUnlockedProject));
    assert.ok(at(role.requireUnlockedProject) < at(uploadProgressPhotos));
    assert.equal(names[at(uploadProgressPhotos) + 1], parseJsonPayload);
    assert.equal(names.at(-2), role.refuseContractorCompletion);
  });
});

// ---------------------------------------------------------------------------
// Migration 030
// ---------------------------------------------------------------------------
describe('migration 030', () => {
  const code = readFileSync(new URL('../../../database/migrations/030_progress_rules.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  it('creates the three tables with their keys', () => {
    assert.match(code, /create table if not exists public\.phase_activities \(\s+id\s+uuid primary key default gen_random_uuid\(\),\s+phase_id\s+uuid not null references public\.project_phases \(id\) on delete cascade,\s+project_id\s+uuid not null references public\.projects \(id\) on delete cascade,/);
    assert.match(code, /name\s+text not null check \(char_length\(name\) between 2 and 120\)/);
    assert.match(code, /weight\s+numeric\(5, 2\) not null check \(weight > 0 and weight <= 100\)/);
    assert.match(code, /accomplishment numeric\(5, 2\) not null default 0 check \(accomplishment between 0 and 100\)/);
    assert.match(code, /unique \(phase_id, sequence_no\)/);
    assert.match(code, /progress_update_id uuid not null references public\.progress_updates \(id\) on delete cascade/);
    assert.match(code, /storage_path\s+text not null unique/);
    assert.match(code, /size_bytes\s+integer not null check \(size_bytes > 0\)/);
    assert.match(code, /uploaded_by\s+uuid references public\.profiles \(id\) on delete set null/);
    assert.match(code, /verifier_role text not null check \(verifier_role in \('auditor', 'pacc'\)\)/);
    assert.match(code, /decision\s+text not null check \(decision in \('verified', 'not_yet'\)\)/);
    assert.match(code, /check \(decision <> 'not_yet' or coalesce\(char_length\(note\), 0\) >= 5\)/);
    assert.match(code, /constraint completion_verifications_pacc_anonymous check \(verifier_role <> 'pacc' or \(verified_by is null and verifier_name = 'PACC'\)\)/);
  });
  it('adds the report and project columns', () => {
    assert.match(code, /add column if not exists description text,\s+add column if not exists activity_snapshot jsonb not null default '\[\]'::jsonb;/);
    assert.match(code, /check \(description is null or char_length\(description\) <= 2000\)/);
    assert.match(code, /add column if not exists completed_at timestamptz,\s+add column if not exists completion_verified_at timestamptz;/);
  });
  it('verifications are append-only', () => {
    assert.match(code, /before update or delete on public\.completion_verifications\s+for each row execute function public\.prevent_modification\(\);/);
  });
  it('grants: nothing for anon; select for authenticated; all for the service role', () => {
    assert.match(code, /revoke all on public\.phase_activities, public\.progress_photos, public\.completion_verifications from anon, authenticated;/);
    assert.match(code, /grant select on public\.phase_activities, public\.progress_photos, public\.completion_verifications to authenticated;/);
    assert.match(code, /grant all on public\.phase_activities, public\.progress_photos, public\.completion_verifications to service_role;/);
    assert.doesNotMatch(code, /grant[^;]*(phase_activities|progress_photos|completion_verifications)[^;]*\banon\b/i);
    assert.doesNotMatch(code, /\bto\s+anon\s+using/i);
  });
  it('RLS: staff, PACC and the project\'s contractor read each new table', () => {
    for (const t of ['phase_activities', 'progress_photos', 'completion_verifications']) {
      assert.match(code, new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      const policies = [...code.matchAll(new RegExp(`create policy "[^"]+: (staff|pacc|contractor) read" on public\\.${t}\\s+for select to authenticated using \\(([^;]*)\\);`, 'g'))];
      assert.deepEqual(policies.map((m) => m[1]).sort(), ['contractor', 'pacc', 'staff'], t);
      const by = Object.fromEntries(policies.map((m) => [m[1], m[2]]));
      assert.match(by.staff, /^\(select private\.is_staff\(\)\)$/);
      assert.match(by.pacc, /^\(select private\.is_pacc\(\)\)$/);
      assert.match(by.contractor, new RegExp(`p\\.id = ${t}\\.project_id and p\\.contractor_id = \\(select private\\.contractor_company\\(\\)\\)`));
    }
  });
  it('the public view gets completion_verified_at as its last column, with an anon column grant', () => {
    assert.match(code, /grant select \(completion_verified_at\) on public\.projects to anon;/);
    const view = code.match(/create or replace view public\.v_public_projects with \(security_invoker = true\) as[\s\S]*?;/)[0];
    assert.match(view, /p\.public_flag,\s+p\.pacc_public_status,\s+p\.completion_verified_at\s+from public\.projects p/);
    assert.doesNotMatch(view, /completed_at/);
  });
  it('the staff view appends completed_at and completion_verified_at after pacc_case_status', () => {
    const view = code.match(/create or replace view public\.v_project_summary with \(security_invoker = true\) as[\s\S]*?;/)[0];
    assert.match(view, /ps\.case_status as pacc_case_status,\s+p\.completed_at,\s+p\.completion_verified_at\s+from public\.projects p/);
    assert.doesNotMatch(code, /drop view/);
  });
  it('existing data: completed projects get completed_at; nothing shows 100% before verification', () => {
    assert.match(code, /set completed_at = now\(\)\s+where status = 'completed' and completed_at is null;/);
    assert.match(code, /set overall_progress = 99\s+where completion_verified_at is null and overall_progress > 99;/);
    assert.match(code, /update public\.progress_updates u\s+set overall_progress = 99/);
  });
  it('a private bucket for the reference photos (10 MB, JPEG / PNG / WebP), no storage policies', () => {
    assert.match(code, /values \('progress-photos', 'progress-photos', false, 10485760, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)\s+on conflict \(id\) do update/);
    assert.doesNotMatch(code, /storage\.objects/);
  });
});
