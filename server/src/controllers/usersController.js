import { adminClient } from '../config/supabase.js';
import { badRequest, notFound, unwrap } from '../utils/httpError.js';
import { avatarUrl, removeAvatarFile, setAvatar, uploadAvatar } from '../services/avatars.js';

function pagination(query, maxSize = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
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
  res.json({ data: row });
}

export async function listUsers(req, res) {
  const { page, pageSize, from, to } = pagination(req.query, 200);
  let q = adminClient.from('profiles').select('*, agency:agencies(code, name)', { count: 'exact' }).order('created_at', { ascending: false });
  if (req.query.role) q = q.eq('role', req.query.role);
  if (req.query.approval_status) q = q.eq('approval_status', req.query.approval_status);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`email.ilike.%${s}%,full_name.ilike.%${s}%`);
  }
  const { data, count, error } = await q.range(from, to);
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

export async function createUser(req, res) {
  const { email, password, full_name, role, agency_id, position } = req.body;
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error) throw badRequest(error.message);
  // profile row is created by the on_auth_user_created trigger with role 'public'
  const profile = unwrap(
    await adminClient.from('profiles').update({ full_name, role, agency_id: agency_id ?? null, position: position ?? null }).eq('id', data.user.id).select('*').single(),
  );
  res.status(201).json({ data: profile });
}

export async function updateUser(req, res) {
  const { userId } = req.params;
  const target = unwrap(await adminClient.from('profiles').select('id, role, is_active, email').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
  if (userId === req.user.id && (req.body.role && req.body.role !== 'admin')) throw badRequest('You cannot remove your own administrator role.');
  if (userId === req.user.id && req.body.is_active === false) throw badRequest('You cannot deactivate your own account.');

  const patch = { ...req.body };
  // Granting a staff role resolves any pending access request.
  if (patch.role && patch.role !== 'public') Object.assign(patch, { approval_status: 'approved', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() });
  const row = unwrap(await adminClient.from('profiles').update(patch).eq('id', userId).select('*').single());

  if (req.body.is_active !== undefined && req.body.is_active !== target.is_active) {
    // Block sign-in for deactivated accounts as well (sessions are also rejected by the API).
    const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: req.body.is_active ? 'none' : '876000h' });
    if (error) console.error('[users] ban toggle failed', error.message);
  }
  res.json({ data: row });
}

/** Approve a staff access request: grant the (possibly adjusted) role. */
export async function approveUser(req, res) {
  const { userId } = req.params;
  const target = unwrap(await adminClient.from('profiles').select('id, email, approval_status, requested_role').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
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
  res.json({ data: row });
}

/** Decline a staff access request. The account keeps public (read-only) access. */
export async function rejectUser(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) throw badRequest('You cannot decline your own account.');
  const target = unwrap(await adminClient.from('profiles').select('id, email, approval_status, requested_role').eq('id', userId).maybeSingle());
  if (!target) throw notFound('User not found');
  if (target.approval_status !== 'pending') throw badRequest('Only pending requests can be declined.');
  const row = unwrap(
    await adminClient
      .from('profiles')
      .update({ role: 'public', approval_status: 'rejected', reviewed_by: req.user.id, reviewed_at: new Date().toISOString(), review_note: req.body.note ?? null })
      .eq('id', userId)
      .select('*')
      .single(),
  );
  res.json({ data: row });
}
