import { adminClient } from '../config/supabase.js';
import { unwrap } from '../utils/httpError.js';

export async function getReference(req, res) {
  const [municipalities, barangays, agencies, contractors] = await Promise.all([
    req.db.from('municipalities').select('id, name, is_capital, latitude, longitude').order('name').then(unwrap),
    req.db.from('barangays').select('id, municipality_id, name, latitude, longitude').order('name').then(unwrap),
    req.db.from('agencies').select('id, code, name, office_type, address').order('name').then(unwrap),
    req.db.from('contractors').select('id, name, is_active').order('name').then(unwrap),
  ]);
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ data: { municipalities, barangays, agencies, contractors } });
}

export async function createAgency(req, res) {
  const row = unwrap(await adminClient.from('agencies').insert(req.body).select('*').single());
  res.status(201).json({ data: row });
}

export async function updateAgency(req, res) {
  const row = unwrap(await adminClient.from('agencies').update(req.body).eq('id', req.params.agencyId).select('*').single());
  res.json({ data: row });
}
