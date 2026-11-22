/**
 * Sample project + site photo + mock documents (npm run seed:sample).
 *
 * Adds, through the real API (so every check and the activity log run as usual):
 *   1. "Concreting of road with box culvert near OMSU Mamburao (Sample)" — a demo project beside
 *      Occidental Mindoro State University, Mamburao campus (Brgy. Tayamaan), with phases, a progress
 *      report and financial records;
 *   2. the team's own photo of the site (a regular photo, shown flat), approved for the public — no drawn
 *      placeholders; the Google Maps buttons show the place, and real 360° photos can be added and linked later;
 *   3. mock PDF documents (contract, program of work, progress report, inspection report with the
 *      photo, disbursement voucher), plus a contract and a progress report for every demo project
 *      that has no document yet — all stamped "SAMPLE – FOR DEMONSTRATION ONLY";
 *   4. one audit finding assigned to personnel@dpwh360.local, so "Findings assigned to you" can be shown.
 *
 * Run it from the server folder, with the API running and the service-role key in server/.env:
 *     npm run seed:sample
 * Running it again skips what is already there.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { contractAgreement, disbursementVoucher, inspectionReport, programOfWork, progressReport } from './mockDocuments.mjs';

// Show a short, readable message instead of a stack trace when a step fails.
process.on('uncaughtException', (err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});

const API = (process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`).replace(/\/$/, '');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const PASSWORD = process.env.SEED_PASSWORD || 'Dpwh360!Demo2026';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Run from the server folder with: npm run seed:sample (reads server/.env)');

const PHOTO = fileURLToPath(new URL('./assets/omsu-road-sample.jpg', import.meta.url));
const NAME = 'Concreting of Road with Box Culvert near OMSU Mamburao Campus (Sample)';
// Occidental Mindoro State University – Mamburao campus (OpenStreetMap): 13.23235, 120.58915.
// The sample road is about 120 m south-east of the campus, in Barangay Tayamaan.
const SITE = { latitude: 13.2316, longitude: 120.5899 };

/**
 * fetch with retries: a dropped connection (ECONNRESET, timeout) is tried again up to 4 times,
 * and a clear message says which step and which server could not be reached.
 */
const errCode = (e) => e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.code || e?.name || 'network error';

async function request(url, opts, step) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
    } catch (err) {
      last = err;
      const code = errCode(err);
      console.log(`  … ${step}: connection problem (${code}), trying again (${attempt}/4)`);
      await wait(1500 * attempt);
    }
  }
  const host = new URL(url).host;
  const code = errCode(last);
  throw new Error(
    `Could not reach ${host} while ${step} (${code}).\n` +
      (host.includes('supabase.co') || step.startsWith('signing in')
        ? '  → Check the internet connection, then try again. If it keeps failing, turn off the VPN / antivirus web shield for a moment, or try another network (e.g. phone hotspot).'
        : '  → Is the API running? Start it in another terminal with: npm run dev'),
  );
}

const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date(Date.now() + 8 * 3600 * 1000));
const addDays = (s, n) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000));
const offset = (lat, lng, northM, eastM) => [lat + northM / 111320, lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180))];

async function signIn(email) {
  const auth = await request(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) },
    `signing in as ${email}`,
  ).then((r) => r.json());
  if (!auth.access_token) throw new Error(`Sign-in failed for ${email}: ${auth.error_description || auth.msg || 'unknown error'}`);
  return { Authorization: `Bearer ${auth.access_token}` };
}

async function call(headers, method, path, body) {
  const isForm = body instanceof FormData;
  const res = await request(
    `${API}${path}`,
    { method, headers: { ...headers, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined },
    `${method} ${path}`,
  );
  const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = (json.error?.details || []).map((d) => d.message).join(' ');
    throw new Error(`${method} ${path}: ${json.error?.message || res.status}${details ? ` — ${details}` : ''}`);
  }
  return json;
}

const pdfForm = (buffer, filename, fields) => {
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/pdf' }), filename);
  for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') fd.append(k, String(v));
  return fd;
};

// ---------------------------------------------------------------------------------------------
console.log(`Sample project seed → API ${API}`);
const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health) throw new Error(`The API is not running at ${API}. Start it first: npm run dev`);
if (!health.writes) throw new Error('The API is read-only: put SUPABASE_SERVICE_ROLE_KEY in server/.env and restart it.');

const P = await signIn(process.env.SEED_EMAIL || 'personnel@dpwh360.local');
const A = await signIn(process.env.SEED_AUDITOR || 'auditor@dpwh360.local');
const me = (await call(P, 'GET', '/me')).data;

// 1. The project -----------------------------------------------------------------------------
const ref = (await call(P, 'GET', '/reference')).data;
const { agencies, contractors } = ref;
const mamburao = ref.municipalities.find((m) => m.name === 'Mamburao');
const tayamaan = ref.barangays.find((b) => b.municipality_id === mamburao.id && b.name === 'Tayamaan');
const deo = agencies.find((a) => /District Engineering Office$/.test(a.name)) || agencies[0];
const contractor = contractors.find((c) => c.name === 'West Mindoro Highway Contractors') || contractors.find((c) => c.is_active);

let project = (await call(P, 'GET', `/projects?search=${encodeURIComponent('OMSU Mamburao')}&pageSize=5`)).data.find((p) => p.name === NAME);
const ntp = '2026-08-17';
if (project) {
  console.log(`• Project already there: ${project.project_code}`);
} else {
  project = (
    await call(P, 'POST', '/projects', {
      name: NAME,
      description:
        'Concreting of the access road beside Occidental Mindoro State University – Mamburao campus, with a reinforced-concrete box culvert and side drainage. Sample project for demonstration; the site photo was supplied by the team.',
      project_type: 'road',
      agency_id: deo.id,
      contractor_id: contractor?.id ?? null,
      contract_ref_no: 'CA-26OM-SAMPLE-OMSU',
      municipality_id: mamburao.id,
      barangay_id: tayamaan?.id ?? null,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      approved_budget: 9800000,
      contract_amount: 9520000,
      notice_to_proceed: ntp,
      duration_days: 120,
      fund_source: 'GAA 2026 – Local Program (sample)',
    })
  ).data;
  console.log(`✓ Project registered: ${project.project_code}`);
}
const pid = project.id;

// Phases ----------------------------------------------------------------------------------------
let phases = (await call(P, 'GET', `/projects/${pid}/phases`)).data.phases;
if (!phases.length) {
  const plan = [
    ['Mobilization and site preparation', 5, 0, 11],
    ['Excavation and reinforced-concrete box culvert', 30, 12, 54],
    ['Sub-base and formworks', 15, 55, 69],
    ['Portland cement concrete pavement (PCCP)', 40, 70, 105],
    ['Drainage tie-in, finishing and demobilization', 10, 106, 119],
  ];
  phases = (
    await call(P, 'PUT', `/projects/${pid}/phases`, {
      phases: plan.map(([name, weight, s, e], i) => ({ sequence_no: i + 1, name, weight, planned_start: addDays(ntp, s), planned_end: addDays(ntp, e) })),
    })
  ).data.phases;
  console.log(`✓ ${phases.length} construction phases`);
} else console.log('• Phases already there');

// Progress report -------------------------------------------------------------------------------
const reportDate = addDays(today, -2);
const reports = (await call(P, 'GET', `/projects/${pid}/progress`)).data;
if (!reports.length) {
  const acc = [100, 85, 100, 70, 0];
  await call(P, 'POST', `/projects/${pid}/progress`, {
    report_date: reportDate,
    remarks: 'PCCP slab poured on most of the road; box culvert walls done, top slab and backfill still open beside the walkway. Caution tape and barriers in place (sample).',
    phases: phases.map((ph, i) => ({
      phase_id: ph.id,
      accomplishment: acc[i],
      actual_start: acc[i] > 0 ? (ph.planned_start < reportDate ? ph.planned_start : reportDate) : null,
      actual_end: acc[i] >= 100 ? (ph.planned_end < reportDate ? ph.planned_end : reportDate) : null,
    })),
  });
  console.log('✓ Progress report');
} else console.log('• Progress report already there');

// Financial records -----------------------------------------------------------------------------
const fin = (await call(P, 'GET', `/projects/${pid}/finance`)).data;
const finRecords = fin.records;
if (!finRecords.length) {
  const culvert = phases[1]?.id;
  const recs = [
    { record_type: 'obligation', amount: 9520000, record_date: ntp, reference_no: 'ORS-2026-08-0417', description: 'Obligation of the full contract amount (sample)' },
    { record_type: 'disbursement', amount: 1428000, record_date: addDays(ntp, 7), reference_no: 'DV-2026-08-0921', description: '15% advance payment (sample)' },
    { record_type: 'disbursement', amount: 2856000, record_date: addDays(ntp, 60), reference_no: 'DV-2026-10-1188', description: 'Progress billing no. 1 – box culvert and sub-base (sample)', phase_id: culvert },
    { record_type: 'expense', amount: 38500, record_date: addDays(ntp, 3), reference_no: 'EX-2026-08-0102', description: 'Project billboard and safety signs (sample)', phase_id: phases[0]?.id },
  ];
  for (const r of recs) await call(P, 'POST', `/projects/${pid}/finance`, r);
  console.log(`✓ ${recs.length} financial records`);
} else console.log('• Financial records already there');

// 2. Site photo ---------------------------------------------------------------------------------------
// Only the team's real photo is uploaded (no drawn placeholders). Add more real photos of the site — e.g. a
// 360° photo outside and one inside the box culvert — and link them with markers to build the virtual tour.
let images = (await call(P, 'GET', `/projects/${pid}/images`)).data;
if (!images.length) {
  const inspection = addDays(today, -1);
  const fd = new FormData();
  fd.append('file', new Blob([readFileSync(PHOTO)], { type: 'image/jpeg' }), 'omsu-road.jpg');
  fd.append('inspection_date', inspection);
  fd.append('view_label', 'Concrete slab and box culvert');
  fd.append('caption', 'New PCCP slab with the open box culvert beside the walkway (photo supplied by the team)');
  fd.append('phase_id', phases[1]?.id || '');
  // The team's photo has no GPS in it: the uploader enters the site coordinates (shown as "entered").
  fd.append('latitude', String(SITE.latitude));
  fd.append('longitude', String(SITE.longitude));
  const res = await call(P, 'POST', `/projects/${pid}/images`, fd);
  const w = res.data.validation.warnings;
  console.log(`✓ Site photo uploaded${w.length ? ` · ${w.join(' ')}` : ''}`);
  images = (await call(P, 'GET', `/projects/${pid}/images`)).data;
} else console.log('• Site photo already there');
for (const img of images.filter((i) => !i.is_public)) await call(A, 'PATCH', `/projects/${pid}/images/${img.id}/public`, { is_public: true });
if (images.some((i) => !i.is_public)) console.log('✓ Photo approved for the public portal (as the Auditor)');

// 3. Mock documents ---------------------------------------------------------------------------------
const fresh = (await call(P, 'GET', `/projects/${pid}`)).data;
phases = (await call(P, 'GET', `/projects/${pid}/phases`)).data.phases;
const docs = (await call(P, 'GET', `/projects/${pid}/documents`)).data;
if (!docs.length) {
  const set = [
    ['Contract agreement (sample)', 'contract', ntp, null, await contractAgreement(fresh), 'contract-agreement.pdf'],
    ['Program of work (sample)', 'program_of_work', addDays(ntp, -10), null, await programOfWork(fresh, phases), 'program-of-work.pdf'],
    ['Progress report no. 1 (sample)', 'progress_report', reportDate, null, await progressReport(fresh, phases, { number: 1, reportDate, remarks: 'PCCP slab poured on most of the road; box culvert walls done, top slab and backfill still open beside the walkway. Caution tape and barriers in place.' }), 'progress-report-01.pdf'],
    [
      'Inspection report with site photo (sample)',
      'inspection_report',
      addDays(today, -1),
      phases[1]?.id,
      await inspectionReport(fresh, {
        inspectionDate: addDays(today, -1),
        photo: readFileSync(PHOTO),
        findings: [
          'The PCCP slab is finished and textured; curing is ongoing behind caution tape.',
          'The box culvert opening beside the walkway is still uncovered; a temporary cover or barrier is needed for pedestrians.',
          'Excavated material is piled along the road edge and should be cleared before the road is opened.',
        ],
      }),
      'inspection-report.pdf',
    ],
    ['Disbursement voucher – progress billing no. 1 (sample)', 'payment_document', addDays(ntp, 60), phases[1]?.id, await disbursementVoucher(fresh, { amount: 2856000, date: addDays(ntp, 60), reference: 'DV-2026-10-1188', purpose: 'Progress billing no. 1 for the box culvert and sub-base works, less the recoupment of the advance payment (sample).' }), 'disbursement-voucher.pdf'],
  ];
  for (const [title, type, docDate, phaseId, buffer, filename] of set) {
    await call(P, 'POST', `/projects/${pid}/documents`, pdfForm(buffer, filename, { title, doc_type: type, document_date: docDate, phase_id: phaseId, description: 'Mock document generated for the demo. Not an official document.' }));
  }
  console.log(`✓ ${set.length} mock documents for ${project.project_code}`);
} else console.log('• Documents already there');

// Other demo projects: a contract and a progress report each (only those with no document yet)
const all = (await call(P, 'GET', '/projects?pageSize=100')).data;
let extra = 0;
for (const row of all) {
  if (row.id === pid) continue;
  const p = (await call(P, 'GET', `/projects/${row.id}`)).data;
  if (!/Sample project for demonstration/i.test(p.description || '')) continue; // leave the team's own projects alone
  if ((await call(P, 'GET', `/projects/${p.id}/documents`)).data.length) continue;
  const ph = (await call(P, 'GET', `/projects/${p.id}/phases`)).data.phases;
  await call(P, 'POST', `/projects/${p.id}/documents`, pdfForm(await contractAgreement(p), 'contract-agreement.pdf', { title: 'Contract agreement (sample)', doc_type: 'contract', document_date: p.notice_to_proceed, description: 'Mock document generated for the demo. Not an official document.' }));
  if (ph.length) {
    await call(P, 'POST', `/projects/${p.id}/documents`, pdfForm(await progressReport(p, ph, { number: 1, reportDate: today }), 'progress-report.pdf', { title: 'Latest progress report (sample)', doc_type: 'progress_report', document_date: today, description: 'Mock document generated for the demo. Not an official document.' }));
  }
  extra += 1;
  console.log(`✓ Mock documents for ${p.project_code}`);
}
if (!extra) console.log('• Other demo projects already have documents');

// 4. One assigned audit finding ------------------------------------------------------------------
const findings = (await call(A, 'GET', `/projects/${pid}/findings`)).data;
if (!findings.length) {
  const fd = new FormData();
  const fields = {
    title: 'Open box culvert beside the walkway (sample)',
    description: 'During the inspection the box culvert opening next to the walkway and the stalls was still uncovered. Pedestrians, including students, pass beside it.',
    severity: 'high',
    recommendation: 'Put a temporary steel cover or a rigid barrier with warning signs until the top slab is cast.',
    action_status: 'open',
    due_date: addDays(today, 5),
    phase_id: phases[1]?.id,
    assigned_to: me.id,
  };
  for (const [k, v] of Object.entries(fields)) if (v) fd.append(k, String(v));
  await call(A, 'POST', `/projects/${pid}/findings`, fd);
  console.log(`✓ Audit finding assigned to ${me.email}`);
} else console.log('• Audit finding already there');

console.log(`\nDone. Open Project Management → ${project.project_code} (360° images, Documents, Overview → Google Maps buttons).`);
