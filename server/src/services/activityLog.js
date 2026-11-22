/**
 * Activity and Audit Log (concept document §4.6, §6 "Activity and Audit Logs", §7.1 "Monitor system activities").
 *
 * Every action that changes data calls logActivity(): who did it (name and role are copied, so the log stays
 * readable even if the account is later removed), what was done, on which record, and a short summary.
 * The table is append-only (database trigger) and only Admins and Auditors can read it.
 * Logging never blocks the action itself: a logging failure is written to the server console only.
 */
import { adminClient } from '../config/supabase.js';

/**
 * @param {object|null} req   Express request (null for system jobs such as the daily flag check)
 * @param {object} entry
 * @param {string} entry.action      "<area>.<verb>", e.g. "project.create", "image.upload", "flag.override"
 * @param {string} entry.entityType  e.g. "project", "image", "finding", "user"
 * @param {string} [entry.entityId]
 * @param {string} [entry.projectId]
 * @param {string} entry.summary     one readable sentence
 * @param {object} [entry.details]   extra facts (changed fields, amounts, flags…)
 */
export async function logActivity(req, { action, entityType, entityId = null, projectId = null, summary, details = {} }) {
  if (!adminClient) return;
  try {
    const user = req?.user;
    const { error } = await adminClient.from('activity_logs').insert({
      actor_id: user?.id ?? null,
      actor_name: user ? user.profile?.full_name || user.email || null : 'System',
      actor_role: user?.role ?? 'system',
      action,
      entity_type: entityType,
      entity_id: entityId == null ? null : String(entityId),
      project_id: projectId,
      summary: String(summary).slice(0, 500),
      details,
    });
    if (error) console.error('[activity-log]', action, error.message);
  } catch (e) {
    console.error('[activity-log]', action, e.message);
  }
}

/** "26OM0315" for summaries; falls back to the id. */
export async function projectCode(projectId) {
  if (!adminClient || !projectId) return projectId;
  const { data } = await adminClient.from('projects').select('project_code').eq('id', projectId).maybeSingle();
  return data?.project_code || projectId;
}

/** Field names that changed between two objects (for update summaries). */
export function changedFields(before, patch) {
  return Object.keys(patch).filter((k) => before && JSON.stringify(before[k] ?? null) !== JSON.stringify(patch[k] ?? null));
}
