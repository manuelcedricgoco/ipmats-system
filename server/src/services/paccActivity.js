/**
 * PACC activity trail. Same contract as logActivity (never throws, never blocks the action),
 * but writes the separate pacc_activity table: PACC actions never go to activity_logs.
 */
import { adminClient } from '../config/supabase.js';

/** @param {object} entry { action: "<area>.<verb>", entityType, entityId?, projectId?, summary, details? } */
export async function logPacc(req, { action, entityType, entityId = null, projectId = null, summary, details = {} }) {
  if (!adminClient) return;
  try {
    const user = req?.user;
    const { error } = await adminClient.from('pacc_activity').insert({
      actor_id: user?.id ?? null,
      actor_name: user ? user.profile?.full_name || user.email || null : null,
      action,
      entity_type: entityType,
      entity_id: entityId == null ? null : String(entityId),
      project_id: projectId,
      summary: String(summary).slice(0, 500),
      details,
    });
    if (error) console.error('[pacc-activity]', action, error.message);
  } catch (e) {
    console.error('[pacc-activity]', action, e.message);
  }
}
