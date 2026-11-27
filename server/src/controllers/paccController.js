/**
 * PACC portal API
 *   GET  /pacc/inbox                              projects that need PACC's attention, with the reasons
 *   GET  /pacc/projects/:id                       investigation view (opening it marks new reports "under review")
 *   POST /pacc/reports/:reportId/close            close one citizen report with an outcome
 *   POST /pacc/projects/:id/reports/close-all     close every open report of a project with one outcome
 *   GET  /pacc/cases                              every case, newest first
 *   GET  /pacc/cases/:caseId                      a case with its notes, documents (signed links) and attached reports
 *   POST /pacc/projects/:id/cases                 open a case on a project (optionally attaching open reports)
 *   PATCH /pacc/cases/:caseId                     change status, respondents, charges or the "show status to public" switch
 *   POST /pacc/cases/:caseId/notes                add a note (append-only; also allowed on a closed case)
 *   POST /pacc/cases/:caseId/documents            upload a case document (PDF, JPEG, PNG or WebP)
 *   GET/POST /pacc/members, POST /pacc/members/:userId/(suspend|unsuspend), DELETE /pacc/members/:userId   PACC manages its own accounts
 * Reports never expose tracking_hash. Every write is recorded in pacc_activity.
 */
import { randomUUID } from 'node:crypto';
import { adminClient } from '../config/supabase.js';
import { canTransition, isClosedCaseStatus, referralReasons } from '../services/citizenReports.js';
import { removeAvatarFile } from '../services/avatars.js';
import { logPacc } from '../services/paccActivity.js';
import { detectImageFormat } from '../services/imageFormat.js';
import { signedUrl, signedUrls } from '../services/storage.js';
import { pagination } from '../utils/pagination.js';
import { HttpError, badRequest, conflict, notFound, unwrap } from '../utils/httpError.js';
import { suspendAccount, unsuspendAccount } from '../services/accountSuspension.js';

const OPEN_CASE = ['under_investigation', 'case_filed'];
const PAGE = 1000;

/** Read every row of a query (Supabase returns at most 1000 per request). */
async function allRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(await build().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function inbox(req, res) {
  const db = adminClient ?? req.db;
  const [reports, cases, red] = await Promise.all([
    allRows(() => db.from('citizen_reports').select('id, project_id, submitted_on').neq('status', 'closed').not('project_id', 'is', null).order('id')),
    allRows(() => db.from('pacc_cases').select('id, project_id, status').in('status', OPEN_CASE).not('project_id', 'is', null).order('id')),
    allRows(() => db.from('projects').select('id').eq('public_flag', 'red').order('id')),
  ]);

  const byProject = new Map();
  const entry = (id) => {
    if (!byProject.has(id)) byProject.set(id, { open_reports: 0, last_report_on: null, open_case: null, red: false });
    return byProject.get(id);
  };
  for (const rep of reports) {
    const e = entry(rep.project_id);
    e.open_reports += 1;
    if (!e.last_report_on || rep.submitted_on > e.last_report_on) e.last_report_on = rep.submitted_on;
  }
  for (const cs of cases) entry(cs.project_id).open_case = { id: cs.id, status: cs.status };
  for (const p of red) entry(p.id).red = true;

  const rows = [];
  for (const [id, e] of byProject) {
    const reasons = referralReasons({ publicFlag: e.red ? 'red' : null, openReports: e.open_reports, hasOpenCase: Boolean(e.open_case) });
    if (reasons.length) rows.push({ id, e, reasons });
  }
  const ids = rows.map((x) => x.id);
  const info = new Map();
  const flags = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [part, flagRows] = await Promise.all([
      db.from('v_project_summary').select('id, project_code, name, municipality_name, contractor_name').in('id', chunk).then(unwrap),
      db.from('projects').select('id, public_flag').in('id', chunk).then(unwrap),
    ]);
    for (const p of part) info.set(p.id, p);
    for (const p of flagRows) flags.set(p.id, p.public_flag);
  }
  res.json({ data: assembleInbox(rows, info, flags) });
}

/** Pure step: join the candidate rows with project details and the reviewed flag, then sort. */
export function assembleInbox(rows, info, flags) {
  return rows
    .filter((x) => info.has(x.id))
    .map(({ id, e, reasons }) => ({
      project_id: id,
      project_code: info.get(id).project_code,
      name: info.get(id).name,
      municipality_name: info.get(id).municipality_name ?? null,
      contractor_name: info.get(id).contractor_name ?? null,
      public_flag: flags.get(id) ?? null,
      open_reports: e.open_reports,
      last_report_on: e.last_report_on,
      open_case: e.open_case,
      reasons,
    }))
    .sort((a, b) => b.reasons.length - a.reasons.length || b.open_reports - a.open_reports);
}

export async function projectView(req, res) {
  const id = req.params.id;
  const project = unwrap(await req.db.from('v_project_summary').select('*').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found.');

  // Opening the project counts as review: new reports become "under review".
  if (adminClient) {
    const changed = unwrap(await adminClient.from('citizen_reports').update({ status: 'under_review' }).eq('project_id', id).eq('status', 'received').select('id'));
    if (changed.length) {
      await logPacc(req, {
        action: 'report.review',
        entityType: 'project',
        entityId: id,
        projectId: id,
        summary: `Opened ${project.project_code}; ${changed.length} citizen report${changed.length === 1 ? '' : 's'} now under review.`,
        details: { count: changed.length },
      });
    }
  }

  const [reportRows, history, reviews, findings, cases] = await Promise.all([
    req.db
      .from('citizen_reports')
      .select('id, category, description, status, outcome, case_id, submitted_on')
      .eq('project_id', id)
      .order('submitted_on', { ascending: false })
      .order('id')
      .then(unwrap),
    req.db.from('flag_history').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(50).then(unwrap),
    req.db.from('flag_reviews').select('*, auditor:profiles!flag_reviews_auditor_id_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('audit_findings').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('pacc_cases').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
  ]);

  const files = reportRows.length
    ? unwrap(await req.db.from('citizen_report_files').select('id, report_id, storage_path').in('report_id', reportRows.map((r) => r.id)).order('id'))
    : [];
  const urls = await signedUrls('citizen-reports', files.map((f) => f.storage_path));
  const reports = reportRows.map((r) => ({
    ...r,
    files: files.filter((f) => f.report_id === r.id).map((f) => ({ id: f.id, url: urls[f.storage_path] ?? null })),
  }));

  res.json({
    data: {
      project,
      reports,
      flag_history: history,
      flag_reviews: reviews.map(({ auditor, ...r }) => ({ ...r, auditor_name: auditor?.full_name ?? null })),
      findings,
      cases,
    },
  });
}

export async function closeReport(req, res) {
  const { outcome } = req.body;
  const rep = unwrap(await adminClient.from('citizen_reports').select('id, project_id, project_code, status').eq('id', req.params.reportId).maybeSingle());
  if (!rep) throw notFound('Report not found.');
  if (rep.status === 'closed') throw conflict('This report is already closed.');
  const done = unwrap(await adminClient.from('citizen_reports').update({ status: 'closed', outcome }).eq('id', rep.id).neq('status', 'closed').select('id'));
  if (!done.length) throw conflict('This report is already closed.');
  await logPacc(req, {
    action: 'report.close',
    entityType: 'citizen_report',
    entityId: rep.id,
    projectId: rep.project_id,
    summary: `Closed a citizen report on ${rep.project_code} as ${outcome}.`,
    details: { outcome },
  });
  res.json({ data: { id: rep.id, status: 'closed', outcome } });
}

export async function closeAllReports(req, res) {
  const { outcome } = req.body;
  const id = req.params.id;
  const done = unwrap(await adminClient.from('citizen_reports').update({ status: 'closed', outcome }).eq('project_id', id).neq('status', 'closed').select('id, project_code'));
  if (done.length) {
    await logPacc(req, {
      action: 'report.close_all',
      entityType: 'project',
      entityId: id,
      projectId: id,
      summary: `Closed ${done.length} citizen report${done.length === 1 ? '' : 's'} on ${done[0].project_code} as ${outcome}.`,
      details: { outcome, count: done.length },
    });
  }
  res.json({ data: { closed: done.length, outcome } });
}

// ---------------------------------------------------------------------------
// PACC cases (one non-closed case per project; closed is final)
// ---------------------------------------------------------------------------

const CASE_BUCKET = 'pacc-case-documents';
const OPEN_CASE_EXISTS = 'This project already has an open PACC case.';
const CANNOT_ATTACH = 'Only open reports of this project that are not in another case can be attached.';
const CASE_CLOSED = 'This case is closed.';
const STATUS_LABELS = { under_investigation: 'under investigation', case_filed: 'case filed', resolved: 'resolved', dismissed: 'dismissed' };

/**
 * Outcome given to a closed case's open reports: resolved → valid, dismissed → invalid.
 * The database applies this same mapping: the trigger of migration 025 (private.close_pacc_case_reports)
 * closes the reports in the same transaction as the case update, so the API only updates the case.
 */
export function outcomeForClosedCase(status) {
  if (status === 'resolved') return 'valid';
  if (status === 'dismissed') return 'invalid';
  return null;
}

/** What a case document really is, from its first bytes (the client's MIME type is not trusted). */
export function caseDocumentFormat(buffer) {
  if (Buffer.isBuffer(buffer) && buffer.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  const image = detectImageFormat(buffer);
  if (image === 'jpeg') return { ext: 'jpg', mime: 'image/jpeg' };
  if (image) return { ext: image, mime: `image/${image}` };
  return null;
}

async function loadCase(caseId, columns = '*') {
  const cs = unwrap(await adminClient.from('pacc_cases').select(columns).eq('id', caseId).maybeSingle());
  if (!cs) throw notFound('Case not found.');
  return cs;
}

export async function listCases(req, res) {
  const rows = await allRows(() =>
    req.db
      .from('pacc_cases')
      .select('id, project_id, project_code, project_name, status, show_public, created_at, closed_at, contractor:contractors(name)')
      .order('created_at', { ascending: false })
      .order('id'),
  );
  res.json({ data: rows.map(({ contractor, ...c }) => ({ ...c, contractor_name: contractor?.name ?? null })) });
}

export async function getCase(req, res) {
  const { caseId } = req.params;
  const cs = unwrap(
    await req.db
      .from('pacc_cases')
      .select('*, contractor:contractors(name), opener:profiles!pacc_cases_opened_by_fkey(full_name)')
      .eq('id', caseId)
      .maybeSingle(),
  );
  if (!cs) throw notFound('Case not found.');
  const [notes, documents, reports] = await Promise.all([
    req.db
      .from('pacc_case_notes')
      .select('id, body, author_id, created_at, author:profiles!pacc_case_notes_author_id_fkey(full_name)')
      .eq('case_id', caseId)
      .order('created_at')
      .order('id')
      .then(unwrap),
    req.db
      .from('pacc_case_documents')
      .select('id, title, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at, uploader:profiles!pacc_case_documents_uploaded_by_fkey(full_name)')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .order('id')
      .then(unwrap),
    req.db
      .from('citizen_reports')
      .select('id, category, status, outcome, submitted_on')
      .eq('case_id', caseId)
      .order('submitted_on', { ascending: false })
      .order('id')
      .then(unwrap),
  ]);
  const urls = await signedUrls(CASE_BUCKET, documents.map((d) => d.storage_path));
  const { contractor, opener, ...rest } = cs;
  res.json({
    data: {
      ...rest,
      contractor_name: contractor?.name ?? null,
      opened_by_name: opener?.full_name ?? null,
      notes: notes.map(({ author, ...n }) => ({ ...n, author_name: author?.full_name ?? null })),
      documents: documents.map(({ uploader, ...d }) => ({ ...d, uploaded_by_name: uploader?.full_name ?? null, url: urls[d.storage_path] ?? null })),
      reports,
    },
  });
}

/** Only open reports of the project that are in no other case may be attached. */
const attachable = (q, projectId) => q.eq('project_id', projectId).neq('status', 'closed').is('case_id', null);

/** Run a query per chunk of 100 ids (keeps the request URL short) and collect the rows. */
async function inChunks(ids, run) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) rows.push(...unwrap(await run(ids.slice(i, i + 100))));
  return rows;
}

export async function createCase(req, res) {
  const { id } = req.params;
  const { contractor_id = null, other_respondents = null, charges } = req.body;
  const reportIds = [...new Set(req.body.report_ids ?? [])];
  const project = unwrap(await req.db.from('projects').select('id, project_code, name').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found');

  if (reportIds.length) {
    const found = await inChunks(reportIds, (chunk) => attachable(req.db.from('citizen_reports').select('id').in('id', chunk), id));
    if (found.length !== reportIds.length) throw badRequest(CANNOT_ATTACH);
  }

  const cs = unwrap(
    await adminClient
      .from('pacc_cases')
      .insert({ project_id: id, project_code: project.project_code, project_name: project.name, contractor_id, other_respondents, charges, status: 'under_investigation', opened_by: req.user.id })
      .select('*')
      .single(),
    { conflictMessage: OPEN_CASE_EXISTS, foreignKeyMessage: 'Contractor not found.' },
  );

  if (reportIds.length) {
    try {
      const attached = await inChunks(reportIds, (chunk) =>
        attachable(adminClient.from('citizen_reports').update({ status: 'under_review', case_id: cs.id }).in('id', chunk), id).select('id'),
      );
      // Someone closed or attached one of them since the check above.
      if (attached.length !== reportIds.length) throw badRequest(CANNOT_ATTACH);
    } catch (err) {
      // No half-made case: deleting it also unlinks the reports (citizen_reports.case_id ON DELETE SET NULL).
      const { error } = await adminClient.from('pacc_cases').delete().eq('id', cs.id);
      if (error) console.error('[pacc] case cleanup failed', error.message);
      throw err;
    }
  }

  await logPacc(req, {
    action: 'case.create',
    entityType: 'case',
    entityId: cs.id,
    projectId: id,
    summary: `Opened a PACC case on ${project.project_code}${reportIds.length ? ` with ${reportIds.length} citizen report${reportIds.length === 1 ? '' : 's'} attached` : ''}.`,
    details: { contractor_id, report_count: reportIds.length },
  });
  res.status(201).json({ data: cs });
}

/** Plain-English list of what a case update changed, for the activity trail. */
function describeCaseChanges(patch) {
  const parts = [];
  if (patch.status) parts.push(`status ${STATUS_LABELS[patch.status]}`);
  if (patch.show_public !== undefined) parts.push(patch.show_public ? 'status shown to the public' : 'status hidden from the public');
  if (patch.charges !== undefined) parts.push('charges edited');
  if (patch.contractor_id !== undefined || patch.other_respondents !== undefined) parts.push('respondents edited');
  return parts.join(', ');
}

/**
 * True when a case update would leave the case without a respondent. Checked only when the patch edits the
 * respondents: a case whose only contractor was deleted later (FK SET NULL) can still be closed or toggled.
 */
export function missingRespondent(current, patch) {
  if (patch.contractor_id === undefined && patch.other_respondents === undefined) return false;
  const contractorId = patch.contractor_id !== undefined ? patch.contractor_id : current.contractor_id;
  const others = patch.other_respondents !== undefined ? patch.other_respondents : current.other_respondents;
  return !contractorId && !others;
}

export async function updateCase(req, res) {
  const cs = await loadCase(req.params.caseId);
  if (isClosedCaseStatus(cs.status)) throw badRequest(CASE_CLOSED);

  const patch = Object.fromEntries(Object.entries(req.body).filter(([, v]) => v !== undefined));
  if (patch.status === cs.status) delete patch.status; // same status sent back: not a change
  if (patch.status) {
    if (!canTransition(cs.status, patch.status)) throw badRequest('That status change is not allowed.');
    if (isClosedCaseStatus(patch.status)) patch.closed_at = new Date().toISOString();
  }
  if (missingRespondent(cs, patch)) throw badRequest('Name at least one respondent.');
  if (!Object.keys(patch).length) return res.json({ data: cs });

  // Guarded by the status we read: of two concurrent changes, only the first applies.
  // Closing the case also closes its open reports (trigger of migration 025, same transaction).
  const rows = unwrap(await adminClient.from('pacc_cases').update(patch).eq('id', cs.id).eq('status', cs.status).select('*'), {
    foreignKeyMessage: 'Contractor not found.',
  });
  if (!rows.length) throw conflict('The case was changed by someone else. Reload and try again.');

  const closing = Boolean(patch.status && isClosedCaseStatus(patch.status));
  await logPacc(req, {
    action: closing ? 'case.close' : 'case.update',
    entityType: 'case',
    entityId: cs.id,
    projectId: cs.project_id,
    summary: closing
      ? `Closed the PACC case on ${cs.project_code} as ${patch.status}; attached open citizen reports are closed as ${outcomeForClosedCase(patch.status)}.`
      : `Updated the PACC case on ${cs.project_code}: ${describeCaseChanges(patch)}.`,
    details: { changed: Object.keys(patch).filter((k) => k !== 'closed_at'), from_status: cs.status, to_status: patch.status ?? cs.status, ...(patch.show_public !== undefined && { show_public: patch.show_public }) },
  });
  res.json({ data: rows[0] });
}

export async function addCaseNote(req, res) {
  // Notes are append-only history, so they may be added to a closed case too (follow-up records).
  const cs = await loadCase(req.params.caseId, 'id, project_id, project_code');
  const note = unwrap(await adminClient.from('pacc_case_notes').insert({ case_id: cs.id, body: req.body.body, author_id: req.user.id }).select('*').single());
  await logPacc(req, {
    action: 'case.note',
    entityType: 'case',
    entityId: cs.id,
    projectId: cs.project_id,
    summary: `Added a note to the PACC case on ${cs.project_code}.`,
    details: { note_id: note.id },
  });
  res.status(201).json({ data: { ...note, author_name: req.user.profile?.full_name ?? null } });
}

export async function uploadCaseDocument(req, res) {
  if (!req.file) throw badRequest('Attach the document in the "file" field.');
  const cs = await loadCase(req.params.caseId, 'id, project_id, project_code, status');
  if (isClosedCaseStatus(cs.status)) throw badRequest(CASE_CLOSED);
  const format = caseDocumentFormat(req.file.buffer);
  if (!format) throw badRequest('Attach a PDF, JPEG, PNG or WebP file.');

  const storagePath = `${cs.id}/${randomUUID()}.${format.ext}`;
  const up = await adminClient.storage.from(CASE_BUCKET).upload(storagePath, req.file.buffer, { contentType: format.mime, upsert: false });
  if (up.error) throw Object.assign(new Error('Storage upload failed'), { cause: up.error });

  const insert = await adminClient
    .from('pacc_case_documents')
    .insert({
      case_id: cs.id,
      title: req.body.title,
      storage_path: storagePath,
      file_name: String(req.file.originalname || 'document').slice(0, 200),
      mime_type: format.mime,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
    })
    .select('*')
    .single();
  if (insert.error) {
    await adminClient.storage.from(CASE_BUCKET).remove([storagePath]); // never leave an orphan file
    unwrap(insert);
  }
  await logPacc(req, {
    action: 'case.document',
    entityType: 'case',
    entityId: cs.id,
    projectId: cs.project_id,
    summary: `Added document "${req.body.title}" to the PACC case on ${cs.project_code}.`,
    details: { document_id: insert.data.id, file_name: insert.data.file_name, size_bytes: req.file.size },
  });
  res.status(201).json({ data: { ...insert.data, url: await signedUrl(CASE_BUCKET, storagePath) } });
}

// ---------------------------------------------------------------------------
// PACC members (accounts with the PACC role, managed only by PACC)
// ---------------------------------------------------------------------------

const MEMBER_COLUMNS = 'id, email, full_name, position, is_active, suspended_at, suspension_reason, created_at';

async function loadMember(userId) {
  const member = unwrap(await adminClient.from('profiles').select(`${MEMBER_COLUMNS}, avatar_path`).eq('id', userId).eq('role', 'pacc').maybeSingle());
  if (!member) throw notFound('Member not found');
  return member;
}

/** PACC must always keep at least one active account. */
async function assertNotLastActiveMember(member) {
  if (!member.is_active) return;
  const { count, error } = await adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'pacc').eq('is_active', true);
  unwrap({ data: null, error });
  if ((count ?? 0) <= 1) throw badRequest('You cannot suspend or remove the last active PACC account.');
}

export async function listMembers(_req, res) {
  const rows = unwrap(await adminClient.from('profiles').select(MEMBER_COLUMNS).eq('role', 'pacc').order('created_at', { ascending: false }));
  res.json({ data: rows });
}

export async function createMember(req, res) {
  const { email, password, full_name, position } = req.body;
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error) throw badRequest(error.message);
  // The sign-up trigger creates the profile without a role; make it an approved PACC account.
  let profile;
  try {
    profile = unwrap(
      await adminClient
        .from('profiles')
        .update({ full_name, position: position ?? null, role: 'pacc', approval_status: 'approved', is_active: true, reviewed_by: req.user.id, reviewed_at: new Date().toISOString(), review_note: null })
        .eq('id', data.user.id)
        .select(MEMBER_COLUMNS)
        .single(),
    );
  } catch (err) {
    await adminClient.auth.admin.deleteUser(data.user.id); // no half-made account without a role
    throw err;
  }
  await logPacc(req, { action: 'member.create', entityType: 'member', entityId: profile.id, summary: `Added PACC member ${email}`, details: { email, full_name } });
  res.status(201).json({ data: profile });
}

export async function suspendMember(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot suspend your own account.');
  const member = await loadMember(userId);
  if (member.suspended_at) throw badRequest('This account is already suspended.');
  await assertNotLastActiveMember(member);
  const row = await suspendAccount(userId, req.user.id, req.body.reason);
  await logPacc(req, { action: 'member.suspend', entityType: 'member', entityId: userId, summary: `Suspended PACC member ${member.email}`, details: { email: member.email, reason: req.body.reason } });
  res.json({ data: row });
}

export async function unsuspendMember(req, res) {
  const { userId } = req.params;
  const member = await loadMember(userId);
  if (member.is_active && !member.suspended_at) throw badRequest('This account is not suspended.');
  const row = await unsuspendAccount(userId);
  await logPacc(req, { action: 'member.unsuspend', entityType: 'member', entityId: userId, summary: `Lifted the suspension of PACC member ${member.email}`, details: { email: member.email } });
  res.json({ data: row });
}

/** Records that tie a member to case history (any of them blocks deletion). */
const MEMBER_RECORDS = [
  ['case notes', 'pacc_case_notes', 'author_id'],
  ['cases', 'pacc_cases', 'opened_by'],
  ['case documents', 'pacc_case_documents', 'uploaded_by'],
];

export async function deleteMember(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot remove your own account.');
  const member = await loadMember(userId);
  await assertNotLastActiveMember(member);

  const counts = await Promise.all(
    MEMBER_RECORDS.map(async ([label, table, column]) => {
      const { count, error } = await adminClient.from(table).select('*', { count: 'exact', head: true }).eq(column, userId);
      unwrap({ data: null, error });
      return [label, count ?? 0];
    }),
  );
  const records = counts.filter(([, n]) => n > 0);
  if (records.length) {
    const list = records.map(([label, n]) => `${n} ${label}`).join(', ');
    throw conflict(`This account has records in the system (${list}). Suspend it instead so the history stays intact.`);
  }

  // Deleting the Auth user removes the profile too (profiles.id -> auth.users ON DELETE CASCADE).
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw Object.assign(new HttpError(500, 'The account could not be removed.'), { cause: error });
  try {
    await removeAvatarFile(member.avatar_path);
  } catch (e) {
    console.error('[pacc] avatar cleanup failed', e.message);
  }
  await logPacc(req, { action: 'member.delete', entityType: 'member', entityId: userId, summary: `Removed PACC member ${member.email}`, details: { email: member.email, full_name: member.full_name } });
  res.status(204).end();
}

/** PACC's own activity log (table pacc_activity, readable only by PACC through RLS). */
export async function listActivity(req, res) {
  const { page, pageSize, from, to } = pagination(req.query);
  let q = req.db.from('pacc_activity').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) q = q.gte('created_at', `${req.query.from}T00:00:00+08:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) q = q.lte('created_at', `${req.query.to}T23:59:59.999+08:00`);
  if (req.query.search) {
    const t = String(req.query.search).replace(/[%,()]/g, ' ').trim().slice(0, 80);
    if (t) q = q.or(`summary.ilike.%${t}%,actor_name.ilike.%${t}%`);
  }
  const { data, count, error } = await q.range(from, to);
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}
