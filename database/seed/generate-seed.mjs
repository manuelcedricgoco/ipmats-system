/**
 * WEEK 1 seed generator → database/seed/seed.sql
 * Occidental Mindoro municipalities/barangays (real names, approximate coordinates),
 * DPWH offices, contractors, projects (budget, contract, agency, contractor, duration)
 * and demo accounts. Projects, contractors, people and amounts are FICTIONAL.
 *
 * Usage: node database/seed/generate-seed.mjs [--today=YYYY-MM-DD]
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const toDate = (v) => {
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : v);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const TODAY = toDate(args.today || new Date());
const DEMO_PASSWORD = 'Dpwh360!Demo2026';
const OWNER_EMAIL = 'manuelcedricgoco64@gmail.com'; // existing account → System Administrator

const uuid = (s) => {
  const h = createHash('sha1').update(`dpwh360:${s}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object' && v.raw) return v.raw;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const iso = (d) => (d ? toDate(d).toISOString().slice(0, 10) : null);
const addDays = (d, n) => new Date(toDate(d).getTime() + n * 86400000);
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}
const offsetMeters = (lat, lng, north, east) => [round6(lat + north / 111320), round6(lng + east / (111320 * Math.cos((lat * Math.PI) / 180)))];
function insert(table, rows, conflict = 'do nothing') {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => q(r[c])).join(', ')})`).join(',\n');
  return `insert into public.${table} (${cols.join(', ')}) values\n${values}\non conflict ${conflict};\n\n`;
}

// ------------------------------------------------------------- geography
// [name, lat, lng, inlandLat, inlandLng, isCapital, barangays[]]
const MUNICIPALITIES = [
  ['Abra de Ilog', 13.4436, 120.7283, -1, 0.3, false, ['Poblacion', 'Wawa', 'Balao', 'Cabacao', 'Lumangbayan', 'Armado', 'Tibag', 'San Vicente', 'Udalo', 'Camurong']],
  ['Calintaan', 12.575, 120.942, 0.3, 1, false, ['Poblacion', 'Iriron', 'Concepcion', 'Malpalon', 'New Dagupan', 'Tanyag', 'Maragooc']],
  ['Looc', 13.76, 120.23, 0.5, -0.8, false, ['Poblacion', 'Agkawayan', 'Ambil', 'Balikyas', 'Bonbon', 'Bulacan', 'Burol', 'Guitna', 'Kanluran', 'Talaotao']],
  ['Lubang', 13.858, 120.123, -0.7, 0.5, false, ['Tagbac', 'Maligaya', 'Vigo', 'Tilik', 'Binakas', 'Cabra', 'Tangal', 'Ragara', 'Maliig', 'Lumangbayan']],
  ['Magsaysay', 12.305, 121.147, 0.8, 0.2, false, ['Poblacion', 'Alibog', 'Caguray', 'Calawag', 'Gapasan', 'Laste', 'Lourdes', 'Nicolas', 'Paclolo', 'Purnaga', 'Santa Teresa', 'Sibalat']],
  ['Mamburao', 13.2236, 120.596, 0, 1, true, ['Poblacion 1', 'Poblacion 2', 'Payompon', 'Balansay', 'Fatima', 'Tayamaan', 'Talabaan', 'San Luis', 'Tangkalan', 'Tagumpay']],
  ['Paluan', 13.417, 120.464, -0.6, 0.8, false, ['Harrison', 'Mananao', 'Marikit', 'Pananayan', 'Tubili', 'Lagnas', 'Alipaoy', 'Bagong Silang Pob.', 'Handang Tumulong Pob.', 'Silahis ng Pag-asa Pob.']],
  ['Rizal', 12.4675, 120.97, 0, 1, false, ['Adela', 'Aguas', 'Magsikap', 'Malawaan', 'Pitogo', 'Rizal', 'Rumbang', 'Salvacion', 'San Pedro', 'Santo Niño', 'Manoot']],
  ['Sablayan', 12.838, 120.774, 0.2, 1, false, ['Poblacion', 'Buenavista', 'Claudio Salgado', 'Ligaya', 'Pag-asa', 'Santo Niño', 'Batong Buhay', 'Malisbong', 'Ibud', 'Tuban', 'San Agustin', 'Victoria', 'Burgos']],
  ['San Jose', 12.3527, 121.067, 0.8, 0.3, false, ['Poblacion I', 'Poblacion II', 'Bubog', 'Caminawit', 'Central', 'Labangan Poblacion', 'Mabini', 'Magbay', 'Murtha', 'Natandol', 'Pag-asa', 'San Agustin', 'San Isidro', 'San Roque', 'Bagong Sikat', 'Ipil', 'Mangarin', 'Batasan', 'Bayotbot', 'Monte Claro']],
  ['Santa Cruz', 13.079, 120.719, 0, 1, false, ['Poblacion I', 'Poblacion II', 'Alacaak', 'Barahan', 'Casague', 'Dayap', 'Lumangbayan', 'Mulawin', 'Pinagturilan', 'San Vicente', 'Kurtinganan']],
];

const muniRows = MUNICIPALITIES.map(([name, lat, lng, , , cap]) => ({ name, is_capital: cap, latitude: lat, longitude: lng }));
const barangayCoords = new Map(); // "Muni|Brgy" -> [lat, lng]
const barangayRows = [];
for (const [muni, lat, lng, iLat, iLng, , brgys] of MUNICIPALITIES) {
  const norm = Math.hypot(iLat, iLng);
  const [uLat, uLng] = [iLat / norm, iLng / norm];
  brgys.forEach((b, i) => {
    const dist = 0.003 + 0.0045 * i; // degrees inland
    const side = (i % 2 ? 1 : -1) * 0.004 * Math.min(i, 3);
    const bl = round6(lat + uLat * dist - uLng * side);
    const bg = round6(lng + uLng * dist + uLat * side);
    barangayCoords.set(`${muni}|${b}`, [bl, bg]);
    barangayRows.push({ muni, name: b, latitude: bl, longitude: bg });
  });
}

const AGENCIES = [
  { code: 'DPWH-OMDEO', name: 'DPWH Occidental Mindoro District Engineering Office', office_type: 'district_engineering_office', address: 'Mamburao, Occidental Mindoro' },
  { code: 'DPWH-SJFO', name: 'DPWH San Jose Field Office', office_type: 'field_office', address: 'San Jose, Occidental Mindoro' },
  { code: 'DPWH-LBFO', name: 'DPWH Lubang Field Office', office_type: 'field_office', address: 'Lubang, Occidental Mindoro' },
];

// Fictional contractors
const CONTRACTORS = [
  ['Amihan Infra Builders Corp.', 'PCAB-41871', 'AAA', 'San Jose, Occidental Mindoro', 'Engr. R. Villanueva'],
  ['Sablayan Ridge Constructors', 'PCAB-37702', 'AA', 'Sablayan, Occidental Mindoro', 'Engr. M. Dela Cruz'],
  ['Kanluran Mindoro Engineering Services', 'PCAB-29954', 'A', 'Mamburao, Occidental Mindoro', 'Engr. L. Bautista'],
  ['Pandurucan Concrete Works', 'PCAB-33410', 'A', 'San Jose, Occidental Mindoro', 'Engr. J. Ramos'],
  ['Isla Lubang Builders', 'PCAB-25117', 'B', 'Lubang, Occidental Mindoro', 'Engr. A. Mendoza'],
  ['Mounts Iglit Development Corp.', 'PCAB-39088', 'AA', 'Sablayan, Occidental Mindoro', 'Engr. C. Santos'],
  ['West Mindoro Highway Contractors', 'PCAB-35561', 'AAA', 'Mamburao, Occidental Mindoro', 'Engr. P. Garcia'],
].map(([name, lic, cls, address, person], i) => ({
  id: uuid(`contractor:${name}`),
  name,
  pcab_license_no: lic,
  classification: cls,
  address,
  contact_person: person,
  contact_number: `+63 917 555 ${String(1100 + i * 37).padStart(4, '0')}`,
  email: `info@${name.toLowerCase().replace(/[^a-z]+/g, '')}.example.ph`,
  is_active: true,
}));

// --------------------------------------------------------- demo accounts
const USERS = [
  { key: 'admin', email: 'admin@dpwh360.local', full_name: 'Maria Santos', role: 'admin', agency: 'DPWH-OMDEO', position: 'System Administrator' },
  { key: 'personnel', email: 'personnel@dpwh360.local', full_name: 'Engr. Jose Reyes', role: 'dpwh_personnel', agency: 'DPWH-OMDEO', position: 'Project Engineer' },
  { key: 'personnel2', email: 'personnel.south@dpwh360.local', full_name: 'Engr. Ana Lim', role: 'dpwh_personnel', agency: 'DPWH-SJFO', position: 'Project Engineer' },
  { key: 'auditor', email: 'auditor@dpwh360.local', full_name: 'Carlos Mendoza, CPA', role: 'auditor', agency: 'DPWH-OMDEO', position: 'Technical Auditor' },
  { key: 'applicant', email: 'applicant@dpwh360.local', full_name: 'Rosa Villareal', role: null, requested: 'dpwh_personnel', agency: 'DPWH-OMDEO', position: 'Engineer II' },
].map((u) => ({ ...u, id: uuid(`user:${u.email}`) }));
const userId = (k) => USERS.find((u) => u.key === k).id;


const PROJECTS = [
  { key: 'mam-fmr', code: '25OM0101', type: 'road', muni: 'Mamburao', brgy: 'Talabaan', agency: 'DPWH-OMDEO', c: 6,
    name: 'Concreting of Talabaan–Tangkalan Farm-to-Market Road', budget: 48_500_000, bid: 0.968, ntp: '2025-09-01', days: 240,
    complete: { offset: -9 }, images: [{ at: 'ntp+30' }, { at: 'ntp+130' }, { at: 'done', final: true }], finance: { pct: 95 }, pub: true, fund: 'GAA 2025 – Local Program' },
  { key: 'sj-bridge', code: '26OM0207', type: 'bridge', muni: 'San Jose', brgy: 'Murtha', agency: 'DPWH-SJFO', c: 0,
    name: 'Construction of Murtha Bridge along San Jose–Rizal Road', budget: 96_000_000, bid: 0.975, ntp: '2026-05-04', days: 365,
    delta: 1.5, images: [{ ago: 150 }, { ago: 70 }, { ago: 9 }], finance: { ratio: 0.88 }, pub: true, fund: 'GAA 2026 – Regular Infrastructure' },
  { key: 'sab-road', code: '26OM0115', type: 'road', muni: 'Sablayan', brgy: 'Claudio Salgado', agency: 'DPWH-OMDEO', c: 1,
    name: 'Road Widening of Sablayan–Claudio Salgado Section, K0201+000–K0203+400', budget: 72_300_000, bid: 0.981, ntp: '2026-03-02', days: 300,
    delta: -9.2, images: [{ ago: 120 }, { ago: 14 }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Regular Infrastructure' },
  { key: 'cal-flood', code: '25OM0319', type: 'flood_control', muni: 'Calintaan', brgy: 'Iriron', agency: 'DPWH-SJFO', c: 3,
    name: 'Construction of Flood Control Structure along Iriron River', budget: 65_000_000, bid: 0.972, ntp: '2025-06-02', days: 300,
    fixedActual: 78, images: [{ ago: 300 }, { ago: 170 }, { ago: 25 }], finance: { ratio: 0.92 }, pub: true, fund: 'GAA 2025 – Flood Management Program' },
  { key: 'riz-road', code: '26OM0122', type: 'road', muni: 'Rizal', brgy: 'Magsikap', agency: 'DPWH-SJFO', c: 3,
    name: 'Concreting of Magsikap–Salvacion Access Road', budget: 29_800_000, bid: 0.965, ntp: '2026-08-03', days: 210,
    delta: 0.8, images: [], finance: { ratio: 0.85 }, pub: true, fund: 'GAA 2026 – Local Program' },
  { key: 'mag-flood', code: '26OM0331', type: 'flood_control', muni: 'Magsaysay', brgy: 'Caguray', agency: 'DPWH-SJFO', c: 5,
    name: 'Construction of Revetment along Caguray River (Phase II)', budget: 85_000_000, bid: 0.99, ntp: '2026-05-18', days: 330,
    delta: -3, images: [{ ago: 150 }, { ago: 12 }], finance: { pct: 82 }, pub: false, fund: 'GAA 2026 – Flood Management Program' },
  { key: 'sc-road', code: '26OM0130', type: 'road', muni: 'Santa Cruz', brgy: 'Barahan', agency: 'DPWH-OMDEO', c: 2,
    name: 'Rehabilitation of Barahan–Casague Road', budget: 38_700_000, bid: 0.97, ntp: '2026-04-06', days: 270,
    delta: 0.5, images: [{ ago: 130 }, { ago: 8, reuse: 'adi-bridge#1' }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Regular Infrastructure' },
  { key: 'adi-bridge', code: '26OM0211', type: 'bridge', muni: 'Abra de Ilog', brgy: 'Balao', agency: 'DPWH-OMDEO', c: 6,
    name: 'Replacement of Balao Bridge along Mindoro West Coastal Road', budget: 112_000_000, bid: 0.978, ntp: '2026-01-12', days: 420,
    delta: -1.2, images: [{ ago: 220 }, { ago: 75 }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Regular Infrastructure' },
  { key: 'pal-bridge', code: '25OM0214', type: 'bridge', muni: 'Paluan', brgy: 'Harrison', agency: 'DPWH-OMDEO', c: 2,
    name: 'Construction of Harrison Bridge and Approaches', budget: 54_000_000, bid: 0.963, ntp: '2025-04-07', days: 360,
    complete: { offset: -4 }, images: [{ at: 'ntp+60' }, { at: 'ntp+200' }, { at: 'done', final: true }], finance: { pct: 96 }, pub: true, fund: 'GAA 2025 – Regular Infrastructure' },
  { key: 'lub-road', code: '26OM0141', type: 'road', muni: 'Lubang', brgy: 'Tilik', agency: 'DPWH-LBFO', c: 4,
    name: 'Concreting of Tilik Port Access Road', budget: 24_500_000, bid: 0.958, ntp: '2026-06-01', days: 200,
    delta: -2, images: [{ ago: 80 }, { ago: 6, gps: [700, 520] }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Local Program' },
  { key: 'looc-flood', code: '27OM0302', type: 'flood_control', muni: 'Looc', brgy: 'Agkawayan', agency: 'DPWH-LBFO', c: 4,
    name: 'Construction of Seawall at Barangay Agkawayan', budget: 41_000_000, bid: 0.974, ntp: '2026-12-07', days: 240,
    notStarted: true, images: [], finance: { pct: 0 }, pub: false, fund: 'GAA 2027 – Flood Management Program' },
  { key: 'sj-flood', code: '26OM0308', type: 'flood_control', muni: 'San Jose', brgy: 'Bubog', agency: 'DPWH-SJFO', c: 0,
    name: 'Construction of Flood Control Structure along Pandurucan River, Bubog Section', budget: 134_500_000, bid: 0.982, ntp: '2026-02-16', days: 420,
    delta: -22, images: [{ ago: 200 }, { ago: 18 }], finance: { ratio: 1.05 }, pub: true, fund: 'GAA 2026 – Flood Management Program' },
  { key: 'sab-evac', code: '25OM0405', type: 'building', muni: 'Sablayan', brgy: 'Buenavista', agency: 'DPWH-OMDEO', c: 5,
    name: 'Construction of Multi-Purpose Evacuation Center, Barangay Buenavista', budget: 33_000_000, bid: 0.97, ntp: '2025-07-14', days: 270,
    complete: { offset: 21 }, images: [{ at: 'ntp+40' }, { at: 'ntp+180' }, { at: 'done', final: true }], finance: { pct: 95 }, pub: true, fund: 'GAA 2025 – Local Program' },
  { key: 'mam-flood', code: '26OM0315', type: 'flood_control', muni: 'Mamburao', brgy: 'Payompon', agency: 'DPWH-OMDEO', c: 6,
    name: 'Construction of Flood Control Dike along Mamburao River, Payompon Section', budget: 78_000_000, bid: 0.976, ntp: '2026-04-20', days: 360,
    delta: 0.7, images: [{ ago: 150 }, { ago: 60 }, { ago: 11 }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Flood Management Program' },
  { key: 'mag-road', code: '26OM0138', type: 'road', muni: 'Magsaysay', brgy: 'Lourdes', agency: 'DPWH-SJFO', c: 1,
    name: 'Concreting of Lourdes–Nicolas Barangay Road', budget: 19_900_000, bid: 0.955, ntp: '2026-04-13', days: 230,
    reported100: true, images: [{ ago: 150 }, { ago: 20 }], finance: { ratio: 0.9 }, pub: true, fund: 'GAA 2026 – Local Program' },
  { key: 'sc-bridge', code: '26OM0219', type: 'bridge', muni: 'Santa Cruz', brgy: 'Dayap', agency: 'DPWH-OMDEO', c: 1,
    name: 'Retrofitting of Dayap Bridge', budget: 27_400_000, bid: 0.969, ntp: '2026-07-06', days: 240,
    delta: 2, images: [{ ago: 100 }, { ago: 5 }], finance: { ratio: 0.88 }, pub: false, fund: 'GAA 2026 – Regular Infrastructure' },
];

// ------------------------------------------------------------- build SQL
const sub = (table, col, val) => ({ raw: `(select id from public.${table} where ${col} = ${q(val)})` });
const brgy = (muni, name) => ({
  raw: `(select b.id from public.barangays b join public.municipalities m on m.id = b.municipality_id where m.name = ${q(muni)} and b.name = ${q(name)})`,
});

const projectRows = PROJECTS.map((p) => {
  const [bLat, bLng] = barangayCoords.get(`${p.muni}|${p.brgy}`);
  const [lat, lng] = offsetMeters(bLat, bLng, 120, 180);
  const ntp = toDate(p.ntp);
  const target = addDays(ntp, p.days);
  const actual = p.complete ? addDays(target, p.complete.offset) : null;
  // Week 1: status is entered manually (automatic detection comes in a later week)
  const status = actual && actual <= TODAY ? 'completed' : ntp > TODAY ? 'not_started' : 'ongoing';
  return {
    id: uuid(`project:${p.code}`),
    project_code: p.code,
    name: p.name,
    description: `${p.name}, Barangay ${p.brgy}, ${p.muni}, Occidental Mindoro. Sample project for demonstration.`,
    project_type: p.type,
    agency_id: sub('agencies', 'code', p.agency),
    contractor_id: CONTRACTORS[p.c].id,
    contract_ref_no: `CA-${p.code}`,
    municipality_id: sub('municipalities', 'name', p.muni),
    barangay_id: brgy(p.muni, p.brgy),
    latitude: lat,
    longitude: lng,
    approved_budget: p.budget,
    contract_amount: Math.round(p.budget * p.bid),
    notice_to_proceed: iso(ntp),
    duration_days: p.days,
    target_completion_date: iso(target),
    actual_completion_date: status === 'completed' ? iso(actual) : null,
    fund_source: p.fund,
    status,
    created_by: { raw: `(select id from public.profiles where email = ${q(p.agency === 'DPWH-SJFO' ? 'personnel.south@dpwh360.local' : 'personnel@dpwh360.local')})` },
  };
});

let sql = `-- =============================================================================
-- IPMATS / DPWH 360° — WEEK 1 seed (GENERATED by database/seed/generate-seed.mjs)
-- Statuses evaluated for ${iso(TODAY)}. Projects, contractors and people are FICTIONAL.
-- Demo accounts (password: ${DEMO_PASSWORD}) — change or delete before real use:
${USERS.map((u) => `--   ${u.email.padEnd(32)} ${u.requested ? `pending request (${u.requested})` : u.role}`).join('\n')}
-- Existing account ${OWNER_EMAIL} is made System Administrator.
-- =============================================================================

begin;

`;
sql += insert('municipalities', muniRows, '(name) do nothing');
sql += `insert into public.barangays (municipality_id, name, latitude, longitude)
select m.id, v.name, v.lat, v.lng from (values
${barangayRows.map((b) => `  (${q(b.muni)}, ${q(b.name)}, ${b.latitude}, ${b.longitude})`).join(',\n')}
) as v(muni, name, lat, lng)
join public.municipalities m on m.name = v.muni
on conflict (municipality_id, name) do nothing;

`;
sql += insert('agencies', AGENCIES, '(code) do nothing');

sql += '-- Demo accounts (profiles are created by the on_auth_user_created trigger)\n';
for (const u of USERS) {
  const meta = { full_name: u.full_name, ...(u.requested ? { requested_role: u.requested, position: u.position } : {}) };
  sql += `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)}, extensions.crypt(${q(DEMO_PASSWORD)}, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, ${q(meta)}, now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(uuid(`identity:${u.email}`))}, ${q(u.id)}, ${q(u.id)}, ${q({ sub: u.id, email: u.email, email_verified: true })}, 'email', now(), now(), now())
on conflict do nothing;
${u.requested
    ? `update public.profiles set agency_id = (select id from public.agencies where code = ${q(u.agency)}) where id = ${q(u.id)};`
    : `update public.profiles set role = ${q(u.role)}, full_name = ${q(u.full_name)}, position = ${q(u.position)},
  agency_id = ${u.agency ? `(select id from public.agencies where code = ${q(u.agency)})` : 'null'} where id = ${q(u.id)};`}

`;
}
sql += `-- The project owner's existing login becomes System Administrator
insert into public.profiles (id, email, full_name, role, position, agency_id)
select u.id, u.email, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Manuel Cedric Goco'), 'admin', 'Project Leader', (select id from public.agencies where code = 'DPWH-OMDEO')
from auth.users u where u.email = ${q(OWNER_EMAIL)}
on conflict (id) do update set role = 'admin', approval_status = 'approved';

`;
sql += insert('contractors', CONTRACTORS.map((c) => ({ ...c, created_by: { raw: `(select id from public.profiles where email = 'admin@dpwh360.local')` } })), '(id) do nothing');
sql += insert('projects', projectRows, '(id) do nothing');
sql += 'commit;\n';

writeFileSync(join(here, 'seed.sql'), sql);
console.log(`seed.sql written (${(sql.length / 1024).toFixed(0)} KB) for ${iso(TODAY)}: ${projectRows.length} projects, ${CONTRACTORS.length} contractors, ${USERS.length} demo accounts`);
for (const r of projectRows) console.log(`  ${r.project_code}  ${r.status.padEnd(11)} PHP ${r.contract_amount.toLocaleString()}  ${r.duration_days} days`);
