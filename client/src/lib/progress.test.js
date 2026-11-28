import { describe, expect, it } from 'vitest';
import {
  COMPLETED_AWAITING_LABEL,
  COMPLETED_VERIFIED_LABEL,
  FINALIZING_TEXT,
  MAX_REFERENCE_PHOTOS,
  REFERENCE_PHOTOS_MESSAGE,
  VERIFIED_LOCK_MESSAGE,
  activityProgress,
  activityWeightTotal,
  activityWeightsOk,
  addReferencePhotos,
  completionLabel,
  isLocked,
  officialProgress,
  phasePlanPayload,
  phasePlanReady,
  phaseProgress,
  formRowProgress,
  progressDecreased,
  progressFormProblem,
  progressFormRows,
  progressPayloadPhases,
  referencePhotoProblem,
  statusLabel,
  verificationCard,
  pointsBehind,
  rowPointsBehind,
  weightedProgress,
} from './progress.js';

describe('pointsBehind (030)', () => {
  it('planned − actual for a project that is not Completed', () => {
    expect(pointsBehind(40, 50)).toBe(10);
    expect(pointsBehind(80, 70, 'ongoing')).toBe(-10);
    expect(pointsBehind(33.335, 50.001, 'delayed')).toBe(16.67);
  });
  it('0 for a Completed project (99% awaiting verification vs a plan of 100%)', () => {
    expect(pointsBehind(99, 100, 'completed')).toBe(0);
    expect(rowPointsBehind({ overall_progress: 99, planned_progress: 100, status: 'completed' })).toBe(0);
  });
  it('0 without a plan', () => {
    expect(pointsBehind(20, null)).toBe(0);
    expect(rowPointsBehind(null)).toBe(0);
  });
});

describe('sub-activities (030)', () => {
  const acts = [
    { name: 'Excavation', weight: 30, accomplishment: 100 },
    { name: 'Hauling', weight: 70, accomplishment: 50 },
  ];
  it('the running weight total and whether it is 100 (± 0.01)', () => {
    expect(activityWeightTotal(acts)).toBe(100);
    expect(activityWeightsOk(acts)).toBe(true);
    expect(activityWeightTotal([{ weight: '33.33' }, { weight: '33.33' }, { weight: '33.33' }])).toBe(99.99);
    expect(activityWeightsOk([{ weight: '33.33' }, { weight: '33.33' }, { weight: '33.33' }])).toBe(true);
    expect(activityWeightsOk([{ weight: 40 }, { weight: 50 }])).toBe(false);
    expect(activityWeightsOk([])).toBe(true); // a phase without sub-activities
  });
  it('phase % = Σ(weight × accomplishment) ÷ Σ(weight), 2 decimals, each value 0–100', () => {
    expect(activityProgress(acts)).toBe(65);
    expect(activityProgress([{ weight: 1, accomplishment: 1 }, { weight: 2, accomplishment: 0 }])).toBe(0.33);
    expect(activityProgress([{ weight: 50, accomplishment: 150 }, { weight: 50, accomplishment: -5 }])).toBe(50);
    expect(activityProgress([])).toBe(0);
  });
  it('a phase with sub-activities takes its % from them; one without keeps its own', () => {
    expect(phaseProgress({ accomplishment: 10, activities: acts })).toBe(65);
    expect(phaseProgress({ accomplishment: 42.5, activities: [] })).toBe(42.5);
    expect(phaseProgress({ accomplishment: '12' })).toBe(12);
  });
  it('overall = phases weighted by their weight', () => {
    expect(weightedProgress([{ weight: 40, accomplishment: 100 }, { weight: 60, accomplishment: 50 }])).toBe(70);
    expect(weightedProgress([])).toBe(0);
  });
});

describe('phase plan payload (030)', () => {
  const rows = [
    { id: 'p1', name: ' Earthworks ', weight: '40', planned_start: '2026-01-01', planned_end: '', activities: [{ id: 'a1', name: ' Excavation ', weight: '60' }, { name: 'Hauling', weight: '40' }] },
    { name: 'Paving', weight: 60, planned_start: '', planned_end: '', activities: [] },
  ];
  it('sends every phase with its sub-activities in order (no id for new ones)', () => {
    expect(phasePlanPayload(rows)).toEqual({
      phases: [
        { id: 'p1', sequence_no: 1, name: 'Earthworks', weight: 40, planned_start: '2026-01-01', planned_end: null, activities: [{ id: 'a1', name: 'Excavation', weight: 60 }, { name: 'Hauling', weight: 40 }] },
        { sequence_no: 2, name: 'Paving', weight: 60, planned_start: null, planned_end: null, activities: [] },
      ],
    });
  });
  it('is ready when the phases total 100 and each phase with sub-activities totals 100', () => {
    expect(phasePlanReady(rows)).toBe(true);
    expect(phasePlanReady([{ ...rows[0], weight: 30 }, rows[1]])).toBe(false);
    expect(phasePlanReady([{ ...rows[0], activities: [{ name: 'A', weight: 50 }] }, rows[1]])).toBe(false);
  });
});

describe('progress form (030)', () => {
  const phases = [
    { id: 'p1', name: 'Earthworks', weight: 40, accomplishment: 65, activities: [{ id: 'a1', name: 'Excavation', weight: 30, accomplishment: 100 }, { id: 'a2', name: 'Hauling', weight: 70, accomplishment: 50 }] },
    { id: 'p2', name: 'Paving', weight: 60, accomplishment: 10, activities: [] },
  ];
  it('rows keep the last values; phases with sub-activities get activity rows', () => {
    const rows = progressFormRows(phases);
    expect(rows[0]).toMatchObject({ phase_id: 'p1', previous: 65, activities: [{ activity_id: 'a1', previous: 100, accomplishment: 100 }, { activity_id: 'a2', previous: 50, accomplishment: 50 }] });
    expect(rows[1]).toMatchObject({ phase_id: 'p2', previous: 10, accomplishment: 10, activities: [] });
  });
  it('sends changed sub-activities (never the phase %) and changed phase % values', () => {
    const rows = progressFormRows(phases);
    rows[0].activities[1].accomplishment = '80';
    rows[1].accomplishment = '25.5';
    expect(progressPayloadPhases(rows)).toEqual([
      { phase_id: 'p1', activities: [{ activity_id: 'a2', accomplishment: 80 }] },
      { phase_id: 'p2', accomplishment: 25.5 },
    ]);
  });
  it('sends every phase when nothing changed (a report needs at least one)', () => {
    expect(progressPayloadPhases(progressFormRows(phases))).toEqual([
      { phase_id: 'p1', activities: [{ activity_id: 'a1', accomplishment: 100 }, { activity_id: 'a2', accomplishment: 50 }] },
      { phase_id: 'p2', accomplishment: 10 },
    ]);
  });
  it('the form shows a phase with sub-activities as computed, and spots lower values', () => {
    const rows = progressFormRows(phases);
    rows[0].activities[1].accomplishment = 90;
    expect(formRowProgress(rows[0])).toBe(93);
    expect(formRowProgress(rows[1])).toBe(10);
    expect(progressDecreased(rows)).toBe(false);
    rows[0].activities[0].accomplishment = 90;
    expect(progressDecreased(rows)).toBe(true);
    const again = progressFormRows(phases);
    again[1].accomplishment = 5;
    expect(progressDecreased(again)).toBe(true);
  });
  it('needs a description of 10–2000 characters and 1–5 photos', () => {
    const photo = { type: 'image/jpeg', size: 1000 };
    expect(progressFormProblem({ description: 'short', files: [photo] })).toBe('Describe the work done in at least 10 characters.');
    expect(progressFormProblem({ description: 'x'.repeat(2001), files: [photo] })).toBe('The description can be at most 2000 characters.');
    expect(progressFormProblem({ description: 'Laid the base course', files: [] })).toBe(REFERENCE_PHOTOS_MESSAGE);
    expect(progressFormProblem({ description: 'Laid the base course', files: Array(6).fill(photo) })).toBe(REFERENCE_PHOTOS_MESSAGE);
    expect(progressFormProblem({ description: '  Laid the base course ', files: [photo] })).toBeNull();
    expect(REFERENCE_PHOTOS_MESSAGE).toBe('Attach 1 to 5 reference photos.');
  });
});

describe('reference photos (030)', () => {
  const jpg = (size = 1000) => ({ name: 'a.jpg', type: 'image/jpeg', size });
  it('JPEG, PNG or WebP up to 10 MB', () => {
    expect(referencePhotoProblem(jpg())).toBeNull();
    expect(referencePhotoProblem({ type: 'image/webp', size: 10 * 1024 * 1024 })).toBeNull();
    expect(referencePhotoProblem({ type: 'image/gif', size: 10 })).toBe('The file is not a JPEG, PNG or WebP image.');
    expect(referencePhotoProblem(jpg(10 * 1024 * 1024 + 1))).toBe('Each reference photo can be at most 10 MB.');
  });
  it('adds good files up to 5 and says why others were left out', () => {
    expect(addReferencePhotos([], [jpg(), { type: 'text/plain', size: 1 }])).toEqual({ files: [jpg()], error: 'The file is not a JPEG, PNG or WebP image.' });
    const four = Array(4).fill(jpg());
    const out = addReferencePhotos(four, [jpg(), jpg()]);
    expect(out.files).toHaveLength(MAX_REFERENCE_PHOTOS);
    expect(out.error).toBe(REFERENCE_PHOTOS_MESSAGE);
    expect(addReferencePhotos([jpg()], [jpg()]).error).toBeNull();
  });
});

describe('completion labels and lock (030)', () => {
  it('labels a Completed project by its verification', () => {
    expect(COMPLETED_AWAITING_LABEL).toBe('Completed – awaiting verification');
    expect(COMPLETED_VERIFIED_LABEL).toBe('Completed – verified');
    expect(completionLabel({ status: 'completed', completion_verified_at: null })).toBe(COMPLETED_AWAITING_LABEL);
    expect(completionLabel({ status: 'completed', completion_verified_at: '2026-11-28T00:00:00Z' })).toBe(COMPLETED_VERIFIED_LABEL);
    expect(completionLabel({ status: 'ongoing', completion_verified_at: null })).toBeNull();
    expect(completionLabel(null)).toBeNull();
  });
  it('status label: the completion label for Completed, else the status label', () => {
    expect(statusLabel('completed', null)).toBe(COMPLETED_AWAITING_LABEL);
    expect(statusLabel('completed', '2026-11-28')).toBe(COMPLETED_VERIFIED_LABEL);
    expect(statusLabel('ongoing', null)).toBe('On-going');
  });
  it('the overall shown is at most 99 until verified', () => {
    expect(officialProgress(100, null)).toBe(99);
    expect(officialProgress(99.5, null)).toBe(99);
    expect(officialProgress(64.444, null)).toBe(64.44);
    expect(officialProgress(100, '2026-11-28T00:00:00Z')).toBe(100);
  });
  it('a verified project is locked', () => {
    expect(isLocked({ completion_verified_at: '2026-11-28T00:00:00Z' })).toBe(true);
    expect(isLocked({ completion_verified_at: null })).toBe(false);
    expect(VERIFIED_LOCK_MESSAGE).toBe("This project's completion was verified; its progress and photos can no longer change.");
  });
});

describe('completion verification card (030)', () => {
  const row = (role, decision, extra = {}) => ({ id: `${role}-${decision}`, verifier_role: role, decision, note: null, verifier_name: role === 'pacc' ? 'PACC' : 'Ana Auditor', created_at: '2026-11-28T01:00:00Z', counts: true, ...extra });
  const base = { status: 'completed', is_completed: true, is_verified: false, completed_at: '2026-11-27T00:00:00Z', completion_verified_at: null, label: COMPLETED_AWAITING_LABEL, auditor: null, pacc: null, history: [] };

  it('read only for everyone but the Auditor (staff page) and PACC (PACC page)', () => {
    for (const actor of [null, undefined, 'dpwh_personnel', 'admin', 'contractor']) {
      const c = verificationCard(base, actor);
      expect(c.canAct).toBe(false);
      expect(c.canVerify).toBe(false);
      expect(c.canNotYet).toBe(false);
    }
    expect(verificationCard(base, 'auditor')).toMatchObject({ canAct: true, canVerify: true, canNotYet: true, verifyBlockedReason: null });
    expect(verificationCard(base, 'pacc')).toMatchObject({ canAct: true, canVerify: true, canNotYet: true });
  });
  it('both sides with their current decision', () => {
    const c = verificationCard({ ...base, auditor: row('auditor', 'verified'), pacc: row('pacc', 'not_yet', { note: 'Drainage unfinished' }) }, null);
    expect(c.sides).toEqual([
      expect.objectContaining({ role: 'auditor', title: 'Auditor', decision: 'verified', text: 'Verified', note: null, by: 'Ana Auditor' }),
      expect.objectContaining({ role: 'pacc', title: 'PACC', decision: 'not_yet', text: 'Not yet', note: 'Drainage unfinished', by: 'PACC' }),
    ]);
    expect(c.waitingFor).toEqual(['PACC']);
    expect(verificationCard(base, null).sides.map((s) => s.text)).toEqual(['No decision yet', 'No decision yet']);
  });
  it('PACC cannot verify while a PACC case is open; "Not yet" stays allowed', () => {
    const c = verificationCard({ ...base, pacc_case_open: true }, 'pacc', { showPacc: true });
    expect(c).toMatchObject({ canAct: true, canVerify: false, canNotYet: true, verifyBlockedReason: 'Close the PACC case before verifying completion.' });
    expect(verificationCard({ ...base, pacc_case_open: true }, 'auditor', { showPacc: true }).canVerify).toBe(true);
  });
  it('no repeated Verify by the side that already verified', () => {
    const c = verificationCard({ ...base, auditor: row('auditor', 'verified') }, 'auditor');
    expect(c.canVerify).toBe(false);
    expect(c.canNotYet).toBe(true);
    expect(c.verifyBlockedReason).toMatch(/already verified/i);
  });
  it('nothing to do before Completed or after verification', () => {
    const open = verificationCard({ ...base, status: 'ongoing', is_completed: false, label: null }, 'auditor');
    expect(open).toMatchObject({ canAct: false, canVerify: false, canNotYet: false, phase: 'not_completed' });
    const done = verificationCard({ ...base, is_verified: true, completion_verified_at: '2026-11-28T02:00:00Z', label: COMPLETED_VERIFIED_LABEL }, 'pacc');
    expect(done).toMatchObject({ canAct: false, phase: 'verified' });
  });
  it('both verified but not yet 100%: staff and PACC see it waits for the PACC case', () => {
    const c = verificationCard({ ...base, auditor: row('auditor', 'verified'), pacc: row('pacc', 'verified') }, null, { showPacc: true });
    expect(c.phase).toBe('awaiting_case');
    expect(c.waitingFor).toEqual([]);
  });
  it('a contractor (no showPacc) never learns of a PACC case: neutral "finalizing"', () => {
    const c = verificationCard({ ...base, auditor: row('auditor', 'verified'), pacc: row('pacc', 'verified'), pacc_case_open: true }, null);
    expect(c.phase).toBe('finalizing');
    expect(c.verifyBlockedReason).toBeNull();
    expect(FINALIZING_TEXT).toBe('Both sides verified; the verification is being finalised.');
  });
  it('copes with no state yet', () => {
    expect(verificationCard(null, 'auditor')).toMatchObject({ canAct: false, phase: 'not_completed', history: [] });
  });
});
