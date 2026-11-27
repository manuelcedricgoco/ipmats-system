/**
 * Sample supporting documents for every project (demonstration data).
 *
 *   From the server folder, with the service-role key in server/.env:
 *     node --env-file=.env scripts/seed-sample-documents.mjs --dry-run   # list what would be added, upload nothing
 *     node --env-file=.env scripts/seed-sample-documents.mjs             # add the documents
 *
 * Each project gets two PDFs, generated from its own record with the report layout and clearly marked
 * "SAMPLE – FOR DEMONSTRATION ONLY": a contract agreement and a program of work (its phases, or the
 * project type's template when no phases are set up yet). They go to the private "project-documents"
 * bucket and the project_documents table, exactly like a document uploaded on the Documents tab.
 *
 * Safe to run again: a project that already has a document with the same sample title is skipped.
 * Optional: SEED_UPLOADER_EMAIL=<staff email> shows that account as the uploader (otherwise none).
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { planFromTemplate } from '../src/services/completion.js';
import { contractAgreement, programOfWork } from './mockDocuments.mjs';

const BUCKET = 'project-documents';
export const SAMPLE_TITLES = Object.freeze({
  contract: 'Contract agreement (SAMPLE)',
  program_of_work: 'Program of work (SAMPLE)',
});
const DESCRIPTION = 'Sample generated from the project record for demonstration. Not an official DPWH, contractor or COA document.';

const today = () => new Date().toISOString().slice(0, 10);

/** The two sample PDFs of one project: [{ doc_type, title, file_name, description, document_date, buffer }]. */
export async function buildSampleDocuments(project, phases = []) {
  const plan = phases.length ? phases : planFromTemplate(project.project_type, project.notice_to_proceed, project.duration_days);
  const base = { description: DESCRIPTION, document_date: project.notice_to_proceed || today() };
  return [
    { ...base, doc_type: 'contract', title: SAMPLE_TITLES.contract, file_name: `${project.project_code}-contract-agreement-sample.pdf`, buffer: await contractAgreement(project) },
    { ...base, doc_type: 'program_of_work', title: SAMPLE_TITLES.program_of_work, file_name: `${project.project_code}-program-of-work-sample.pdf`, buffer: await programOfWork(project, plan) },
  ];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_UPLOADER_EMAIL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Run from the server folder: node --env-file=.env scripts/seed-sample-documents.mjs');
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const must = ({ data, error }, what) => {
    if (error) throw new Error(`${what}: ${error.message}`);
    return data;
  };

  let uploaderId = null;
  if (SEED_UPLOADER_EMAIL) {
    const p = must(await db.from('profiles').select('id').eq('email', SEED_UPLOADER_EMAIL.trim().toLowerCase()).maybeSingle(), 'Uploader lookup');
    if (!p) throw new Error(`No account with the email ${SEED_UPLOADER_EMAIL}.`);
    uploaderId = p.id;
  }

  const projects = must(await db.from('v_project_summary').select('*').order('project_code'), 'Projects');
  const existing = must(await db.from('project_documents').select('project_id, title'), 'Existing documents');
  const have = new Set(existing.map((d) => `${d.project_id}|${d.title}`));
  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const project of projects) {
    const phases = must(
      await db.from('project_phases').select('sequence_no, name, weight, planned_start, planned_end').eq('project_id', project.id).order('sequence_no'),
      `Phases of ${project.project_code}`,
    );
    for (const doc of await buildSampleDocuments(project, phases)) {
      if (have.has(`${project.id}|${doc.title}`)) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        console.log(`[dry run] ${project.project_code}: would add "${doc.title}" (${doc.buffer.length} bytes)`);
        added += 1;
        continue;
      }
      const path = `${project.id}/${randomUUID()}_${doc.file_name}`;
      try {
        must(await db.storage.from(BUCKET).upload(path, doc.buffer, { contentType: 'application/pdf', upsert: false }), 'Upload');
        const row = await db
          .from('project_documents')
          .insert({
            project_id: project.id,
            title: doc.title,
            doc_type: doc.doc_type,
            description: doc.description,
            document_date: doc.document_date,
            storage_path: path,
            file_name: doc.file_name,
            mime_type: 'application/pdf',
            size_bytes: doc.buffer.length,
            uploaded_by: uploaderId,
          })
          .select('id')
          .single();
        if (row.error) {
          await db.storage.from(BUCKET).remove([path]); // never leave an orphan file
          throw new Error(`Save: ${row.error.message}`);
        }
        await db.from('activity_logs').insert({
          actor_id: null,
          actor_name: 'System',
          actor_role: 'system',
          action: 'document.upload',
          entity_type: 'document',
          entity_id: row.data.id,
          project_id: project.id,
          summary: `Added sample document "${doc.title}" to ${project.project_code} (demo seed script)`,
          details: { file_name: doc.file_name, size_bytes: doc.buffer.length, sample: true },
        });
        console.log(`${project.project_code}: added "${doc.title}"`);
        added += 1;
      } catch (err) {
        console.error(`${project.project_code}: "${doc.title}" failed — ${err.message}`);
        failed += 1;
      }
    }
  }
  console.log(`${dryRun ? 'Dry run: would add' : 'Added'} ${added}, skipped ${skipped} (already there), failed ${failed} — ${projects.length} projects.`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
