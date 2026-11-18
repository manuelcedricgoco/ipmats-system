import { adminClient } from '../config/supabase.js';
import { notFound, unwrap } from '../utils/httpError.js';

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
      .select('id, project_code, name, municipality_name, contract_amount, duration_days, status')
      .eq('contractor_id', c.id)
      .order('project_code'),
  );
  res.json({ data: { ...c, projects } });
}

export async function createContractor(req, res) {
  const row = unwrap(await adminClient.from('contractors').insert({ ...req.body, created_by: req.user.id }).select('*').single());
  res.status(201).json({ data: row });
}

export async function updateContractor(req, res) {
  const row = unwrap(await adminClient.from('contractors').update(req.body).eq('id', req.params.contractorId).select('*').maybeSingle());
  if (!row) throw notFound('Contractor not found');
  res.json({ data: row });
}
