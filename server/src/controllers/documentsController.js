/**
 * Gap fix — Supporting project documents (concept document §7.2 "Upload supporting project documents",
 * workflow step 3). Files go to the private "project-documents" bucket; the table keeps who uploaded what.
 *   GET    /projects/:id/documents                  staff: list with short-lived download links
 *   POST   /projects/:id/documents                  DPWH Personnel, Admin: upload (PDF, image, Word, Excel)
 *   DELETE /projects/:id/documents/:documentId      Admin, or the person who uploaded it
 */
import { randomUUID } from 'node:crypto';
import { adminClient } from '../config/supabase.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { fillMissingNames } from '../services/profileNames.js';
import { signedUrls } from '../services/storage.js';
import { badRequest, forbidden, notFound, unwrap } from '../utils/httpError.js';

export const DOCUMENT_BUCKET = 'project-documents';
export const TYPE_LABELS = {
  contract: 'Contract',
  program_of_work: 'Program of work',
  progress_report: 'Progress report',
  inspection_report: 'Inspection report',
  variation_order: 'Variation order',
  payment_document: 'Payment document',
  as_built_plan: 'As-built plan',
  other: 'Other',
};

/** Keep letters, digits, dots, dashes and underscores for the storage key. */
const safeName = (name) => String(name || 'document').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-120);

export async function listDocuments(req, res) {
  const rows = unwrap(
    await req.db
      .from('project_documents')
      .select('*, phase:project_phases(name), uploader:profiles!project_documents_uploaded_by_fkey(full_name)')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false }),
  );
  const urls = await signedUrls(DOCUMENT_BUCKET, rows.map((r) => r.storage_path));
  const data = rows.map(({ phase, uploader, ...r }) => ({
    ...r,
    type_label: TYPE_LABELS[r.doc_type] || r.doc_type,
    phase_name: phase?.name ?? null,
    uploaded_by_name: uploader?.full_name ?? null,
    url: urls[r.storage_path] ?? null,
  }));
  res.json({ data: await fillMissingNames(data, [{ id: 'uploaded_by', name: 'uploaded_by_name' }]) });
}

export async function uploadDocument(req, res) {
  if (!req.file) throw badRequest('Attach the document in the "file" field.');
  const { id } = req.params;
  const p = unwrap(await adminClient.from('projects').select('id, project_code').eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  if (req.body.phase_id) {
    const ph = unwrap(await adminClient.from('project_phases').select('id').eq('id', req.body.phase_id).eq('project_id', id).maybeSingle());
    if (!ph) throw badRequest('The selected phase does not belong to this project.');
  }
  const storagePath = `${id}/${randomUUID()}_${safeName(req.file.originalname)}`;
  const up = await adminClient.storage.from(DOCUMENT_BUCKET).upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (up.error) throw Object.assign(new Error('Storage upload failed'), { cause: up.error });

  const insert = await adminClient
    .from('project_documents')
    .insert({
      project_id: id,
      phase_id: req.body.phase_id || null,
      title: req.body.title,
      doc_type: req.body.doc_type,
      description: req.body.description ?? null,
      document_date: req.body.document_date ?? null,
      storage_path: storagePath,
      file_name: String(req.file.originalname || 'document').slice(0, 200),
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      uploaded_by: req.user.id,
    })
    .select('*')
    .single();
  if (insert.error) {
    await adminClient.storage.from(DOCUMENT_BUCKET).remove([storagePath]); // never leave an orphan file
    unwrap(insert);
  }
  await logActivity(req, {
    action: 'document.upload',
    entityType: 'document',
    entityId: insert.data.id,
    projectId: id,
    summary: `Uploaded ${TYPE_LABELS[req.body.doc_type].toLowerCase()} "${req.body.title}" to ${p.project_code}`,
    details: { file_name: insert.data.file_name, size_bytes: req.file.size },
  });
  res.status(201).json({ data: insert.data });
}

export async function deleteDocument(req, res) {
  const doc = unwrap(
    await adminClient.from('project_documents').select('id, project_id, title, storage_path, uploaded_by').eq('id', req.params.documentId).eq('project_id', req.params.id).maybeSingle(),
  );
  if (!doc) throw notFound('Document not found');
  if (req.user.role !== 'admin' && doc.uploaded_by !== req.user.id) throw forbidden('Only the person who uploaded this document or an administrator can delete it.');
  unwrap(await adminClient.from('project_documents').delete().eq('id', doc.id));
  await adminClient.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path]);
  await logActivity(req, {
    action: 'document.delete',
    entityType: 'document',
    entityId: doc.id,
    projectId: doc.project_id,
    summary: `Deleted document "${doc.title}" from ${await projectCode(doc.project_id)}`,
  });
  res.status(204).end();
}
