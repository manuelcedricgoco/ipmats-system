/**
 * Names on project records (who submitted a report, uploaded a photo, reviewed a flag…).
 * Records are read as the caller, and the names come from a profiles embed. A contractor account
 * may read only its own profile (RLS, 029), so for it those embeds come back empty: the missing
 * names (and roles, for "by <name> (Contractor)") are filled in here with the service role.
 * Rows that already have a name are left as they are, so staff responses do not change.
 */
import { adminClient } from '../config/supabase.js';
import { unwrap } from '../utils/httpError.js';

async function loadProfiles(ids) {
  const rows = unwrap(await adminClient.from('profiles').select('id, full_name, role, position').in('id', ids));
  return new Map(rows.map((p) => [p.id, p]));
}

/**
 * @param {object[]} rows
 * @param {{ id: string, name: string, role?: string, position?: string }[]} fields
 *        id: the column holding the account id; name / role / position: the output keys to fill
 * @param {(ids: string[]) => Promise<Map<string, object>>} [load]
 */
export async function fillMissingNames(rows, fields, load = adminClient ? loadProfiles : null) {
  const missing = new Set();
  for (const row of rows) for (const f of fields) if (row[f.id] && row[f.name] == null) missing.add(row[f.id]);
  if (!missing.size || !load) return rows;
  const people = await load([...missing]);
  return rows.map((row) => {
    const out = { ...row };
    for (const f of fields) {
      const p = people.get(row[f.id]);
      if (!p || out[f.name] != null) continue;
      out[f.name] = p.full_name || null;
      if (f.role && out[f.role] == null) out[f.role] = p.role ?? null;
      if (f.position && out[f.position] == null) out[f.position] = p.position ?? null;
    }
    return out;
  });
}
