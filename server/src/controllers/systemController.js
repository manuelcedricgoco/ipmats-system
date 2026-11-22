/**
 * Gap fixes — System Administrator tools from the concept document
 *   GET /activity                 Activity and Audit Logs (Admin, Auditor) — filters, pagination
 *   GET /settings/flag-rules      current automatic flag rules (staff can read them)
 *   PUT /settings/flag-rules      Admin changes the thresholds; every project is re-checked at once
 */
import { adminClient } from '../config/supabase.js';
import { runFlagCheck } from '../jobs/dailyFlagCheck.js';
import { logActivity } from '../services/activityLog.js';
import { DEFAULT_RULES } from '../services/flagDetection.js';
import { getFlagRules } from '../services/settings.js';
import { unwrap } from '../utils/httpError.js';
import { pagination } from '../utils/pagination.js';

const ACTIVITY_AREAS = ['project', 'phases', 'progress', 'finance', 'image', 'document', 'flag', 'finding', 'contractor', 'agency', 'user', 'account', 'settings'];

export async function listActivity(req, res) {
  const { page, pageSize, from, to } = pagination(req.query);
  let q = req.db.from('activity_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (req.query.area && ACTIVITY_AREAS.includes(req.query.area)) q = q.like('action', `${req.query.area}.%`);
  if (req.query.role) q = q.eq('actor_role', String(req.query.role));
  if (req.query.project_id) q = q.eq('project_id', String(req.query.project_id));
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) q = q.gte('created_at', `${req.query.from}T00:00:00+08:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) q = q.lte('created_at', `${req.query.to}T23:59:59.999+08:00`);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim().slice(0, 80);
    if (s) q = q.or(`summary.ilike.%${s}%,actor_name.ilike.%${s}%`);
  }
  const { data, count, error } = await q.range(from, to);
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

export async function getFlagRulesSetting(req, res) {
  const rules = await getFlagRules(req.db);
  const row = unwrap(await req.db.from('system_settings').select('updated_at, updated_by').eq('key', 'flag_rules').maybeSingle());
  let updatedByName = null;
  if (row?.updated_by && adminClient) {
    const p = unwrap(await adminClient.from('profiles').select('full_name').eq('id', row.updated_by).maybeSingle());
    updatedByName = p?.full_name ?? null;
  }
  res.json({ data: { rules, defaults: DEFAULT_RULES, updated_at: row?.updated_at ?? null, updated_by_name: updatedByName } });
}

export async function updateFlagRules(req, res) {
  const before = await getFlagRules(adminClient);
  const rules = { ...DEFAULT_RULES, ...req.body };
  unwrap(
    await adminClient
      .from('system_settings')
      .upsert({ key: 'flag_rules', value: rules, description: 'Automatic flag thresholds (changed by the System Administrator)', updated_by: req.user.id }, { onConflict: 'key' }),
  );
  const changed = Object.keys(rules).filter((k) => Number(before[k]) !== Number(rules[k]));
  // New rules apply to every project right away
  const check = await runFlagCheck({ trigger: 'rules_changed', actorId: req.user.id });
  await logActivity(req, {
    action: 'settings.flag_rules',
    entityType: 'settings',
    entityId: 'flag_rules',
    summary: changed.length
      ? `Changed automatic flag rules (${changed.map((k) => `${k}: ${before[k]} → ${rules[k]}`).join(', ')}); ${check.changed} project flag(s) changed after the re-check`
      : 'Saved automatic flag rules without changes; all projects re-checked',
    details: { before, after: rules, recheck: { evaluated: check.evaluated, changed: check.changed, changes: check.changes } },
  });
  res.json({ data: { rules, recheck: check } });
}
