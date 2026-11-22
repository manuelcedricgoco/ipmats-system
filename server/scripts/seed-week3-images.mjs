/**
 * WEEK 3 — Upload sample 360° panoramas through the IPMATS API (one-time demo data).
 *
 *   1. Start the API with the service key in server/.env:   npm run dev
 *   2. In another terminal (server folder):                 npm run seed:images
 *
 * It signs in as personnel@dpwh360.local, generates placeholder panoramas labelled
 * "SAMPLE – NOT A REAL PHOTO" with GPS + capture date in the EXIF, and uploads them
 * to POST /api/projects/:id/images — the same validation and automatic flagging as a
 * real upload. Some photos are made on purpose to trigger Week 3 flags:
 *   26OM0141  taken ~900 m from the site      → GPS mismatch (Yellow)
 *   26OM0219  latest photo is 45 days old      → outdated photo (Yellow)
 *   26OM0130  same file as a 26OM0207 photo    → reused photo (Red)
 *   26OM0138  camera date 15 days before visit → date mismatch (Yellow)
 *   26OM0122  no photo at all                  → no 360° image (Yellow)
 * Completed projects get a FINAL as-built photo on their completion date.
 * Run it once. Running it again uploads a second set (and the duplicates are flagged as reused).
 */
import { makePanorama } from './panorama.mjs';

const API = (process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api`).replace(/\/$/, '');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const EMAIL = process.env.SEED_EMAIL || 'personnel@dpwh360.local';
const PASSWORD = process.env.SEED_PASSWORD || 'Dpwh360!Demo2026';
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Run from the server folder with: npm run seed:images (reads server/.env)');

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const addDays = (s, n) => iso(new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 86400000));
const offset = (lat, lng, northM, eastM) => [lat + northM / 111320, lng + eastM / (111320 * Math.cos((lat * Math.PI) / 180))];

// --- sign in as DPWH personnel
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());
if (!auth.access_token) throw new Error(`Sign-in failed for ${EMAIL}: ${auth.error_description || auth.msg || 'unknown error'}`);
const H = { Authorization: `Bearer ${auth.access_token}` };

const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
if (!health) throw new Error(`The API is not running at ${API}. Start it first: npm run dev`);
if (!health.writes) throw new Error('The API is read-only: put SUPABASE_SERVICE_ROLE_KEY in server/.env and restart it.');

const list = await fetch(`${API}/projects?pageSize=100`, { headers: H }).then((r) => r.json());
const byCode = Object.fromEntries(list.data.map((p) => [p.project_code, p]));

/** Plan: [code, inspection date, options] */
const plan = [];
const recent = (code, days = 6, o = {}) => plan.push([code, daysAgo(days), o]);
for (const code of ['25OM0101', '25OM0214', '25OM0405']) {
  const p = byCode[code];
  if (!p?.actual_completion_date) continue;
  plan.push([code, addDays(p.actual_completion_date, -60), {}]);
  plan.push([code, p.actual_completion_date, { final: true }]);
}
for (const code of ['25OM0319', '26OM0115', '26OM0211', '26OM0308', '26OM0315', '26OM0331']) recent(code, 8);
recent('26OM0207', 10);
recent('26OM0141', 5, { northM: 900 }); // GPS mismatch
plan.push(['26OM0219', daysAgo(45), {}]); // outdated
recent('26OM0138', 4, { cameraDaysEarlier: 15 }); // date mismatch
recent('26OM0130', 3, { reuseFrom: '26OM0207' }); // reused photo

const made = {}; // code -> last buffer (for the reuse scenario)
let ok = 0;
for (const [code, date, o] of plan) {
  const p = byCode[code];
  if (!p) {
    console.log(`skip ${code}: not found`);
    continue;
  }
  // The project list has no coordinates, so read them from the project's own record.
  // (Bug fix: using the list gave NaN, and every sample photo was written with GPS 0, 0.)
  const detail = await fetch(`${API}/projects/${p.id}`, { headers: H }).then((r) => r.json());
  const siteLat = Number(detail?.data?.latitude);
  const siteLng = Number(detail?.data?.longitude);
  if (!Number.isFinite(siteLat) || !Number.isFinite(siteLng)) throw new Error(`No coordinates for ${code}; the photo was not uploaded.`);
  const [lat, lng] = offset(siteLat, siteLng, o.northM ?? 25, 15);
  const camera = o.cameraDaysEarlier ? addDays(date, -o.cameraDaysEarlier) : date;
  const buffer =
    o.reuseFrom && made[o.reuseFrom]
      ? made[o.reuseFrom]
      : await makePanorama({
          title: p.name.length > 34 ? `${p.name.slice(0, 33)}…` : p.name,
          subtitle: `${code} · ${p.municipality_name}`,
          tag: `${o.final ? 'FINAL AS-BUILT' : 'Inspection'} · ${date}`,
          progress: o.final ? 100 : Number(p.overall_progress),
          seed: code.charCodeAt(5) + date.length + ok,
          latitude: lat,
          longitude: lng,
          capturedAt: `${camera} 10:00:00`,
        });
  made[code] = buffer;
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'image/jpeg' }), `${code}_${date}.jpg`);
  fd.append('inspection_date', date);
  fd.append('is_final', o.final ? 'true' : 'false');
  fd.append('caption', o.final ? 'Final as-built 360° image (sample)' : 'Site inspection 360° image (sample)');
  const res = await fetch(`${API}/projects/${p.id}/images`, { method: 'POST', headers: H, body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`✗ ${code} ${date}: ${body.error?.message || res.status}`);
    continue;
  }
  ok += 1;
  const w = body.data.validation.warnings;
  console.log(`✓ ${code} ${date}${o.final ? ' (final)' : ''} → flag ${body.data.evaluation?.flag ?? '?'}${w.length ? `  · ${w.join(' ')}` : ''}`);
}
console.log(`\nUploaded ${ok} of ${plan.length} sample panoramas. Open the map or the Flags page to see the result.`);
