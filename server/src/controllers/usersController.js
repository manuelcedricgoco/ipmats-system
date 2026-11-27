import { adminClient } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { HttpError, badRequest, conflict, forbidden, notFound, unwrap } from '../utils/httpError.js';
import { avatarUrl, removeAvatarFile, setAvatar, uploadAvatar } from '../services/avatars.js';
import { pagination } from '../utils/pagination.js';
import { suspendAccount, unsuspendAccount } from '../services/accountSuspension.js';

/** PACC accounts are managed by PACC itself; the System Administrator may not act on them. */
export function assertNotPaccAccount(target) {
  if (target?.role === 'pacc') throw forbidden('PACC accounts are managed by PACC.');
}

export async function me(req, res) {
  const { avatar_path, ...profile } = req.user.profile;
  res.json({ data: { ...profile, avatar_url: await avatarUrl(avatar_path) } });
}

export async function uploadMyAvatar(req, res) {
  if (!req.file) throw badRequest('Choose a photo in the "avatar" field.');
  const previous = req.user.profile.avatar_path;
  const path = await uploadAvatar(req.user.id, req.file.buffer);
  await setAvatar(req.user.id, previous, path);
  res.json({ data: { avatar_url: await avatarUrl(path) } });
}

export async function deleteMyAvatar(req, res) {
  const previous = req.user.profile.avatar_path;
  unwrap(await adminClient.from('profiles').update({ avatar_path: null }).eq('id', req.user.id));
  await removeAvatarFile(previous);
  res.json({ data: { avatar_url: null } });
}

export async function updateMe(req, res) {
  const row = unwrap(await adminClient.from('profiles').update({ full_name: req.body.full_name, position: req.body.position }).eq('id', req.user.id).select('*').single());
  await logActivity(req, { action: 'account.update', entityType: 'user', entityId: req.user.id, summary: 'Updated own name / position' });
  res.json({ data: row });
}

export async function listUsers(req, res) {
  const { page, pageSize, from, to } = pagination(req.query, { maxSize: 200 });
  let q = adminClient
    .from('profiles')
    .select('*, agency:agencies(code, name)', { count: 'exact' })
    .or('role.is.null,role.neq.pacc') // PACC accounts are not the Administrator's to list (further .or() filters are ANDed)
    .order('created_at', { ascending: false });
  if (req.query.role) q = q.eq('role', req.query.role);
  if (req.query.status === 'suspended') q = q.or('suspended_at.not.is.null,is_active.eq.false');
  else if (req.query.status === 'active') q = q.eq('is_active', true);
  if (req.query.approval_status) q = q.eq('approval_status', req.query.approval_status);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  const { data, count, error } = await q.range(from, to);
  unwrap({ data, error });
  // Name of the Administrator who suspended each suspended account.
  const suspenderIds = [...new Set(data.map((u) => u.suspended_by).filter(Boolean))];
  const suspenders = suspenderIds.length
    ? new Map(unwrap(await adminClient.from('profiles').select('id, full_name, email').in('id', suspenderIds)).map((p) => [p.id, p]))
    : new Map();
  const rows = data.map((u) => {
    const s = suspenders.get(u.suspended_by);
    return { ...u, suspender: s ? { full_name: s.full_name, email: s.email } : null };
  });
  res.json({ data: rows, page, pageSize, total: count ?? 0 });
}

export async function createUser(req, res) {
  const { email, password, full_name, role, agency_id, position } = req.body;
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error) throw badRequest(error.message);
  // The on_auth_user_created trigger creates the profile without a role; an account made by the
  // System Administrator is approved right away (a role may only be set on an approved account).
  const profile = unwrap(
    await adminClient
      .from('profiles')
      .update({
        full_name,
        role,
        agency_id: agency_id ?? null,
        position: position ?? null,
        approval_status: 'approved',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: null,
      })
      .eq('id', data.user.id)
      .select('*')
      .single(),
  );
  await logActivity(req, { action: 'user.create', entityType: 'user', entityId: profile.id, summary: `Created account ${email} (${role})` });
  res.status(201).json({ data: profile });
}

export async function updateUser(req, res) {
  const { userId } = req.params;
  const target = unwrap(await adminClient.from('profiles').select('id, role, is_active, email').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
  assertNotPaccAccount(target);
  if (userId === req.user.id && (req.body.role && req.body.role !== 'admin')) throw badRequest('You cannot remove your own administrator role.');
  if (userId === req.user.id && req.body.is_active === false) throw badRequest('You cannot deactivate your own account.');

  const patch = { ...req.body };
  // Granting a staff role resolves any pending access request.
  if (patch.role) Object.assign(patch, { approval_status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() });
  // Reactivating an account also clears a suspension (normally done with POST /users/:id/unsuspend).
  if (patch.is_active === true) Object.assign(patch, { suspended_at: null, suspended_by: null, suspension_reason: null });
  const row = unwrap(await adminClient.from('profiles').update(patch).eq('id', userId).select('*').single());

  if (req.body.is_active !== undefined && req.body.is_active !== target.is_active) {
    // Block sign-in for deactivated accounts as well (sessions are also rejected by the API).
    const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: req.body.is_active ? 'none' : '876000h' });
    if (error) console.error('[users] ban toggle failed', error.message);
  }
  const what = [
    req.body.role && req.body.role !== target.role ? `role ${target.role ?? 'none'} → ${req.body.role}` : null,
    req.body.is_active !== undefined && req.body.is_active !== target.is_active ? (req.body.is_active ? 'reactivated' : 'deactivated') : null,
  ].filter(Boolean);
  await logActivity(req, {
    action: 'user.update',
    entityType: 'user',
    entityId: userId,
    summary: `Updated account ${target.email}${what.length ? ` (${what.join(', ')})` : ''}`,
    details: { fields: Object.keys(req.body) },
  });
  res.json({ data: row });
}

/** Approve a staff access request: grant the (possibly adjusted) role. */
export async function approveUser(req, res) {
  const { userId } = req.params;
  const target = unwrap(await adminClient.from('profiles').select('id, email, role, approval_status, requested_role').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
  assertNotPaccAccount(target);
  if (target.approval_status === 'approved') throw badRequest('This account is already approved.');
  const row = unwrap(
    await adminClient
      .from('profiles')
      .update({
        role: req.body.role,
        ...(req.body.agency_id !== undefined ? { agency_id: req.body.agency_id } : {}),
        ...(req.body.position !== undefined ? { position: req.body.position } : {}),
        approval_status: 'approved',
        is_active: true,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        review_note: null,
      })
      .eq('id', userId)
      .select('*')
      .single(),
  );
  await logActivity(req, { action: 'user.approve', entityType: 'user', entityId: userId, summary: `Approved staff access for ${target.email} as ${req.body.role}` });
  res.json({ data: row });
}

/** Decline a staff access request. The account gets no role: it can browse the public portal like any visitor. */
export async function rejectUser(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot decline your own account.');
  const target = unwrap(await adminClient.from('profiles').select('id, email, role, approval_status, requested_role').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
  assertNotPaccAccount(target);
  if (target.approval_status !== 'pending') throw badRequest('Only pending requests can be declined.');
  const row = unwrap(
    await adminClient
      .from('profiles')
      .update({ role: null, approval_status: 'rejected', reviewed_by: req.user.id, reviewed_at: new Date().toISOString(), review_note: req.body.note ?? null })
      .eq('id', userId)
      .select('*')
      .single(),
  );
  await logActivity(req, { action: 'user.decline', entityType: 'user', entityId: userId, summary: `Declined the ${target.requested_role || 'staff'} access request of ${target.email}` });
  res.json({ data: row });
}

// ---------------------------------------------------------------------------
// Delete, suspend and lift suspension (System Administrator)
// ---------------------------------------------------------------------------

async function loadTarget(userId) {
  const target = unwrap(
    await adminClient.from('profiles').select('id, email, full_name, role, is_active, avatar_path, suspended_at').eq('id', userId).maybeSingle(),
  );
  if (!target) throw notFound('User not found');
  assertNotPaccAccount(target);
  return target;
}

/** The system must always keep at least one active System Administrator. */
async function assertNotLastActiveAdmin(target, verb) {
  if (target.role !== 'admin' || !target.is_active) return;
  const { count, error } = await adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
  unwrap({ data: null, error });
  if ((count ?? 0) <= 1) throw badRequest(`You cannot ${verb} the last active System Administrator. Give another account the Administrator role first.`);
}

/** Records that tie an account to the project history (any of them blocks deletion). */
const USER_RECORDS = [
  ['activity log entries', 'activity_logs', ['actor_id']],
  ['projects', 'projects', ['created_by', 'updated_by']],
  ['progress updates', 'progress_updates', ['submitted_by']],
  ['financial records', 'financial_records', ['created_by']],
  ['site images', 'site_images', ['uploaded_by', 'public_reviewed_by']],
  ['project documents', 'project_documents', ['uploaded_by']],
  ['audit findings', 'audit_findings', ['auditor_id', 'assigned_to', 'published_by', 'action_updated_by']],
  ['flag reviews', 'flag_reviews', ['auditor_id']],
  ['flag history entries', 'flag_history', ['created_by']],
  ['contractors', 'contractors', ['created_by']],
];

async function countUserRecords(userId) {
  const results = await Promise.all(
    USER_RECORDS.map(async ([label, table, columns]) => {
      // userId is validated as a UUID by the route, so it is safe inside the filter string.
      const { count, error } = await adminClient
        .from(table)
        .select('*', { count: 'exact', head: true })
        .or(columns.map((c) => `${c}.eq.${userId}`).join(','));
      unwrap({ data: null, error });
      return [label, count ?? 0];
    }),
  );
  return results.filter(([, n]) => n > 0);
}

export async function deleteUser(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot delete your own account.');
  const target = await loadTarget(userId);
  await assertNotLastActiveAdmin(target, 'delete');

  const records = await countUserRecords(userId);
  if (records.length) {
    const list = records.map(([label, n]) => `${n} ${label}`).join(', ');
    throw conflict(`This account has records in the system (${list}). Suspend it instead so the history stays intact.`);
  }

  // Deleting the Auth user removes the profile too (profiles.id → auth.users ON DELETE CASCADE).
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw Object.assign(new HttpError(500, 'The account could not be deleted.'), { cause: error });
  // Remove the photo only once the account is gone, so a failed delete never leaves a broken photo link.
  try {
    await removeAvatarFile(target.avatar_path);
  } catch (e) {
    console.error('[users] avatar cleanup failed', e.message);
  }

  await logActivity(req, {
    action: 'user.delete',
    entityType: 'user',
    entityId: userId,
    summary: `Deleted account ${target.email}${target.full_name ? ` (${target.full_name})` : ''}`,
    details: { email: target.email, full_name: target.full_name, role: target.role },
  });
  res.status(204).end();
}

export async function suspendUser(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot suspend your own account.');
  const target = await loadTarget(userId);
  if (target.suspended_at) throw badRequest('This account is already suspended.');
  await assertNotLastActiveAdmin(target, 'suspend');
  const { reason } = req.body;

  const row = await suspendAccount(userId, req.user.id, reason);

  await logActivity(req, {
    action: 'user.suspend',
    entityType: 'user',
    entityId: userId,
    summary: `Suspended account ${target.email}`,
    details: { email: target.email, reason },
  });
  res.json({ data: row });
}

export async function unsuspendUser(req, res) {
  const { userId } = req.params;
  const target = await loadTarget(userId);
  if (target.is_active && !target.suspended_at) throw badRequest('This account is not suspended.');

  const row = await unsuspendAccount(userId);

  await logActivity(req, {
    action: 'user.unsuspend',
    entityType: 'user',
    entityId: userId,
    summary: `Lifted the suspension of ${target.email}`,
    details: { email: target.email },
  });
  res.json({ data: row });
}
