/**
 * Create the first PACC account (one time).
 *
 *   From the server folder, with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env:
 *     node --env-file=.env scripts/bootstrap-pacc.mjs --email <email> --name "<full name>" --redirect https://<site>/set-password
 *
 * What it does:
 *   - creates the Auth user (random password that is never shown) or finds the existing one;
 *   - makes the profile an approved, active PACC account;
 *   - prints a one-time recovery link. Open it to choose a password.
 *
 * It refuses when an active PACC account already exists, unless you pass --force (recovery when
 * PACC has no usable account left). It never turns an admin, DPWH personnel or auditor account into PACC.
 * The redirect URL must be allowed in Supabase: Authentication -> URL Configuration -> Redirect URLs.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const STAFF_ROLES = ['admin', 'dpwh_personnel', 'auditor'];

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      redirect: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
} catch (err) {
  fail(`${err.message}\nUsage: node --env-file=.env scripts/bootstrap-pacc.mjs --email <email> --name "<full name>" --redirect <https://site/set-password> [--force]`);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
if (missing.length) fail(`missing environment variables: ${missing.join(', ')} (run with --env-file=.env from the server folder).`);

const email = (args.email || '').trim().toLowerCase();
const fullName = (args.name || '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('give a valid email with --email.');
if (!fullName) fail('give the full name with --name.');
let redirectTo;
try {
  const u = new URL(args.redirect || '');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  redirectTo = u.toString();
} catch {
  fail('--redirect must be an http(s) URL, for example https://your-site/set-password.');
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

async function findUserByEmail(target) {
  for (let page = 1; ; page += 1) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }), 'Listing users');
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
}

try {
  if (!args.force) {
    const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'pacc').eq('is_active', true);
    if (error) throw new Error(`Checking for PACC accounts: ${error.message}`);
    if (count > 0) fail('an active PACC account already exists. Add more members from the PACC Members page, or pass --force to create another one anyway.');
  }

  let user = await findUserByEmail(email);
  let created = false;
  if (user) {
    const profile = must(await db.from('profiles').select('role').eq('id', user.id).maybeSingle(), 'Reading the existing profile');
    if (profile?.role && STAFF_ROLES.includes(profile.role)) {
      fail(`${email} already belongs to a staff account (${profile.role}). Use a different email: a staff account is never converted to PACC.`);
    }
  } else {
    const made = must(
      await db.auth.admin.createUser({ email, password: randomBytes(32).toString('base64url'), email_confirm: true, user_metadata: { full_name: fullName } }),
      'Creating the account',
    );
    user = made.user;
    created = true;
  }

  // The sign-up trigger creates the profile without a role; make it an approved, active PACC account.
  const now = new Date().toISOString();
  must(
    await db
      .from('profiles')
      .update({ full_name: fullName, role: 'pacc', approval_status: 'approved', is_active: true, suspended_at: null, reviewed_by: null, reviewed_at: now, review_note: 'Created by the PACC bootstrap script' })
      .eq('id', user.id)
      .select('id')
      .single(),
    'Setting up the PACC profile',
  );

  const link = must(await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } }), 'Creating the set-password link');
  const url = link?.properties?.action_link;
  if (!url) throw new Error('Supabase returned no set-password link.');

  console.log(`${created ? 'Created' : 'Promoted'} the PACC account for ${email}.`);
  console.log('Open this one-time link to choose a password (do not share it or paste it into chat):\n');
  console.log(url);
} catch (err) {
  fail(err.message);
}
