import { adminClient } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { conflict, notFound, unwrap } from '../utils/httpError.js';

export async function listContractors(req, res) {
  const contractors = unwrap(await req.db.from('contractors').select('*').order('name'));
  // project counts per contractor (only projects the caller may see)
  const projects = unwrap(await req.db.from('v_project_summary').select('contractor_id, contract_amount, status'));
  const stats = new Map();
  for (const p of projects) {
    const s = stats.get(p.contractor_id) || { project_count: 0, total_contract: 0, ongoing: 0, completed: 0 };
    s.project_count += 1;
    s.total_contract += Number(p.contract_amount || 0);
    if (p.status === 'completed') s.completed += 1;
    else if (p.status === 'ongoing' || p.status === 'delayed') s.ongoing += 1;
    stats.set(p.contractor_id, s);
  }
  res.json({ data: contractors.map((c) => ({ ...c, ...(stats.get(c.id) || { project_count: 0, total_contract: 0, ongoing: 0, completed: 0 }) })) });
}

export async function getContractor(req, res) {
  const c = unwrap(await req.db.from('contractors').select('*').eq('id', req.params.contractorId).maybeSingle());
  if (!c) throw notFound('Contractor not found');
  const projects = unwrap(
    await req.db
      .from('v_project_summary')
      .select('id, project_code, name, municipality_name, contract_amount, duration_days, status, completion_verified_at')
      .eq('contractor_id', c.id)
      .order('project_code'),
  );
  res.json({ data: { ...c, projects } });
}

export async function createContractor(req, res) {
  const row = unwrap(await adminClient.from('contractors').insert({ ...req.body, created_by: req.user.id }).select('*').single());
  await logActivity(req, { action: 'contractor.create', entityType: 'contractor', entityId: row.id, summary: `Added contractor "${row.name}"` });
  res.status(201).json({ data: row });
}

export async function updateContractor(req, res) {
  const row = unwrap(await adminClient.from('contractors').update(req.body).eq('id', req.params.contractorId).select('*').maybeSingle());
  if (!row) throw notFound('Contractor not found');
  await logActivity(req, { action: 'contractor.update', entityType: 'contractor', entityId: row.id, summary: `Updated contractor "${row.name}" (${Object.keys(req.body).join(', ')})` });
  res.json({ data: row });
}

/**
 * Delete a contractor (System Administrator). projects.contractor_id is ON DELETE SET NULL, so deleting a
 * contractor that still has projects would silently remove it from them: that is refused instead.
 */
export async function deleteContractor(req, res) {
  const { contractorId } = req.params;
  const c = unwrap(await adminClient.from('contractors').select('id, name, pcab_license_no').eq('id', contractorId).maybeSingle());
  if (!c) throw notFound('Contractor not found');
  const { data: used, count, error } = await adminClient
    .from('projects')
    .select('project_code', { count: 'exact' })
    .eq('contractor_id', contractorId)
    .order('project_code')
    .limit(5);
  unwrap({ data: used, error });
  if (count) {
    const codes = used.map((p) => p.project_code).join(', ') + (count > used.length ? ', …' : '');
    throw conflict(`This contractor is assigned to ${count} project(s) (${codes}). Reassign them, or edit the contractor and untick "Active" instead.`);
  }
  // 029: contractor accounts keep their company (profiles.contractor_id is ON DELETE RESTRICT).
  const { count: accounts, error: aErr } = await adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('contractor_id', contractorId);
  unwrap({ data: null, error: aErr });
  if (accounts) {
    throw conflict(`This contractor has ${accounts} user account(s). Delete them or give them another company first, or edit the contractor and untick "Active" instead.`);
  }
  unwrap(await adminClient.from('contractors').delete().eq('id', contractorId));
  await logActivity(req, {
    action: 'contractor.delete',
    entityType: 'contractor',
    entityId: c.id,
    summary: `Deleted contractor "${c.name}"`,
    details: { name: c.name, pcab_license_no: c.pcab_license_no },
  });
  res.status(204).end();
}
