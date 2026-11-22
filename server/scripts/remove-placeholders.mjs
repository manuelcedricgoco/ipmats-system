/**
 * Remove the drawn sample photos ("SAMPLE – NOT A REAL PHOTO" placeholders) through the real API, as the
 * System Administrator — the file, the database row and its virtual-tour markers are removed, the project's
 * flag is re-checked and each deletion is written to the activity log.
 *
 *   npm run remove:placeholders            the 2 placeholder views of the OMSU sample project only
 *   npm run remove:placeholders -- --all   also the 17 Week-3 placeholders of the other demo projects
 *
 * Real photos (like the team's photo of the OMSU road) are never touched.
 * Note: with --all, demo projects without any other photo become Yellow ("no 360° photo"), and completed
 * demo projects lose their final as-built photo, so they are no longer counted as Completed.
 */
const API = (process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`).replace(/\/$/, '');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const ALL = process.argv.includes('--all');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Run from the server folder with: npm run remove:placeholders (reads server/.env)');

process.on('uncaughtException', (err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});

// Captions the seed scripts gave their drawn placeholders
const OMSU_PLACEHOLDER = /\(sample 360° placeholder\)$/;
const WEEK3_PLACEHOLDER = /^(Site inspection|Final as-built) 360° image \(sample\)$/;

async function request(url, opts, step) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(60000) });
    } catch (err) {
      last = err;
      console.log(`  … ${step}: connection problem, trying again (${attempt}/4)`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`Could not reach ${new URL(url).host} while ${step} (${last?.cause?.code || last?.name}). Check the connection and that the API is running.`);
}

const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health) throw new Error(`The API is not running at ${API}. Start it first: npm run dev`);
if (!health.writes) throw new Error('The API is read-only: put SUPABASE_SERVICE_ROLE_KEY in server/.env and restart it.');

const auth = await request(
  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
  { method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.SEED_ADMIN || 'admin@dpwh360.local', password: process.env.SEED_PASSWORD || 'Dpwh360!Demo2026' }) },
  'signing in as the Admin',
).then((r) => r.json());
if (!auth.access_token) throw new Error(`Admin sign-in failed: ${auth.error_description || auth.msg || 'unknown error'}`);
const H = { Authorization: `Bearer ${auth.access_token}` };

const get = async (path) => {
  const res = await request(`${API}${path}`, { headers: H }, `GET ${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(`GET ${path}: ${json.error?.message || res.status}`);
  return json.data;
};

const projects = await get('/projects?pageSize=100');
let removed = 0;
for (const p of projects) {
  const images = await get(`/projects/${p.id}/images`);
  const targets = images.filter((i) => OMSU_PLACEHOLDER.test(i.caption || '') || (ALL && WEEK3_PLACEHOLDER.test(i.caption || '')));
  for (const img of targets) {
    const res = await request(`${API}/projects/${p.id}/images/${img.id}`, { method: 'DELETE', headers: H }, `deleting a photo of ${p.project_code}`);
    if (res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      console.log(`✗ ${p.project_code} ${img.view_label || img.inspection_date}: ${json.error?.message || res.status}`);
      continue;
    }
    removed += 1;
    console.log(`✓ Removed ${p.project_code} · ${img.view_label || `inspection ${img.inspection_date}`}`);
  }
}
console.log(`\nRemoved ${removed} placeholder photo(s).${ALL ? '' : ' (Add -- --all to also remove the Week-3 placeholders of the other demo projects.)'}`);
