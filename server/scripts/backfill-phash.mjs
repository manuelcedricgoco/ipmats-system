/**
 * Computes site_images.phash for rows that do not have one yet.
 * Run from server/:  node --env-file=.env scripts/backfill-phash.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { dHash } from '../src/services/perceptualHash.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with: node --env-file=.env scripts/backfill-phash.mjs).');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = 'panoramas';
const PAGE = 500;

let updated = 0;
let skipped = 0;
const failedIds = new Set();
for (;;) {
  const { data: rows, error } = await db.from('site_images').select('id, storage_path').is('phash', null).order('id').limit(PAGE + failedIds.size);
  if (error) {
    console.error(`Could not read site_images: ${error.message}`);
    process.exit(1);
  }
  const todo = rows.filter((r) => !failedIds.has(r.id)).slice(0, PAGE);
  if (!todo.length) break;
  for (const row of todo) {
    try {
      const file = await db.storage.from(BUCKET).download(row.storage_path);
      if (file.error) throw file.error;
      const phash = await dHash(Buffer.from(await file.data.arrayBuffer()));
      const upd = await db.from('site_images').update({ phash }).eq('id', row.id);
      if (upd.error) throw upd.error;
      updated += 1;
    } catch (err) {
      skipped += 1;
      failedIds.add(row.id);
      console.warn(`Skipped ${row.id}: ${err.message}`);
    }
  }
}
console.log(`updated ${updated} / skipped ${skipped}`);
