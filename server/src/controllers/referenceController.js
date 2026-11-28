import { adminClient } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { ROLES, STAFF } from '../middleware/role.js';
import { conflict, notFound, unwrap } from '../utils/httpError.js';

/** The contractor list is for approved staff (project forms) and approved PACC accounts (naming case respondents, read-only). */
export function canReadContractors(user) {
  return user?.profile?.approval_status === 'approved' && (STAFF.includes(user.role) || user.role === ROLES.PACC);
}

/**
 * Lookup lists. Open to everyone (the sign-up form and the public portal filters read them as the
 * anonymous role); the contractor list only for canReadContractors (anon may read just id and name).
 */
export async function getReference(req, res) {
  const withContractors = canReadContractors(req.user);
  const [municipalities, barangays, agencies, contractors] = await Promise.all([
    req.db.from('municipalities').select('id, name, is_capital, latitude, longitude').order('name').then(unwrap),
    req.db.from('barangays').select('id, municipality_id, name, latitude, longitude').order('name').then(unwrap),
    req.db.from('agencies').select('id, code, name, office_type, address, is_active').order('name').then(unwrap),
    withContractors ? req.db.from('contractors').select('id, name, is_active').order('name').then(unwrap) : [],
  ]);
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ data: { municipalities, barangays, agencies, contractors } });
}

/**
 * Active contractor companies, id and name only, for the "Contractor representative" option of
 * the Register page (029). Open to everyone, like the rest of /reference; anon could already read
 * contractor names (016). Licence numbers and contact details are not included.
 */
export async function signupContractors(_req, res) {
  const rows = adminClient ? unwrap(await adminClient.from('contractors').select('id, name').eq('is_active', true).order('name')) : [];
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ data: rows });
}

export async function createAgency(req, res) {
  const row = unwrap(await adminClient.from('agencies').insert(req.body).select('*').single());
  await logActivity(req, { action: 'agency.create', entityType: 'agency', entityId: row.id, summary: `Added implementing office "${row.name}" (${row.code})` });
  res.status(201).json({ data: row });
}

export async function updateAgency(req, res) {
  const row = unwrap(await adminClient.from('agencies').update(req.body).eq('id', req.params.agencyId).select('*').single());
  await logActivity(req, { action: 'agency.update', entityType: 'agency', entityId: row.id, summary: `Updated implementing office "${row.name}" (${Object.keys(req.body).join(', ')})` });
  res.json({ data: row });
}

/**
 * Delete an implementing office (System Administrator). Refused while projects use it
 * (projects.agency_id is ON DELETE RESTRICT) or user accounts belong to it
 * (profiles.agency_id is ON DELETE SET NULL, which would silently detach those accounts).
 */
export async function deleteAgency(req, res) {
  const agencyId = Number(req.params.agencyId);
  const a = unwrap(await adminClient.from('agencies').select('id, code, name').eq('id', agencyId).maybeSingle());
  if (!a) throw notFound('Office not found');
  const [projects, users] = await Promise.all([
    adminClient.from('projects').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
    adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
  ]);
  unwrap({ data: null, error: projects.error || users.error });
  const reasons = [
    projects.count ? `Used by ${projects.count} project(s); assign them to another office first.` : null,
    users.count ? `${users.count} user account(s) belong to this office; move them to another office first.` : null,
  ].filter(Boolean);
  if (reasons.length) throw conflict(`This office cannot be deleted. ${reasons.join(' ')}`);
  unwrap(await adminClient.from('agencies').delete().eq('id', agencyId));
  await logActivity(req, {
    action: 'agency.delete',
    entityType: 'agency',
    entityId: a.id,
    summary: `Deleted implementing office "${a.name}" (${a.code})`,
    details: { code: a.code, name: a.name },
  });
  res.status(204).end();
}
