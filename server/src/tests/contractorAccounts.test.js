// Contractor accounts (migrations 028, 029): a contractor company's representatives read their own
// company's projects and report progress / upload 360° photos on them; nothing else.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { requireAuth } from '../middleware/auth.js';
import {
  COMPLETION_BY_PERSONNEL_MESSAGE,
  CONTRACTOR_COMPANY_MESSAGE,
  CONTRACTOR_PROJECT_MESSAGE,
  assertContractorDoesNotComplete,
  assertContractorOwnsProject,
  contractorSafeValidation,
  licenceMatches,
  withoutPaccFields,
} from '../services/contractorAccess.js';
import { fillMissingNames } from '../services/profileNames.js';
import { userApprove, userCreate, userUpdate } from '../routes/schemas.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
const COMPANY = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
let api;
let errorHandler;
let role;
let users;
let routers;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  api = (await import('../routes/index.js')).default;
  errorHandler = (await import('../middleware/errorHandler.js')).errorHandler;
  role = await import('../middleware/role.js');
  users = await import('../controllers/usersController.js');
  routers = {
    progress: (await import('../routes/progress.js')).default,
    images: (await import('../routes/images.js')).default,
  };
});

const contractor = (over = {}) => ({
  id: 'c1',
  email: 'rep@alpha.ph',
  role: 'contractor',
  profile: { approval_status: 'approved', full_name: 'Rep A', contractor_id: COMPANY, is_active: true, ...over },
});

// ---------------------------------------------------------------------------
// Every API route, called as an approved contractor account
// ---------------------------------------------------------------------------

/** Every route of the API router as [method, path] with real values for the parameters. */
function allRoutes(router, prefix = '') {
  const out = [];
  for (const layer of router.stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push([method, prefix + layer.route.path]);
    } else if (layer.handle?.stack) {
      const mount = layer.regexp.fast_slash ? '' : layer.regexp.source.replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
      out.push(...allRoutes(layer.handle, prefix + mount));
    }
  }
  return out;
}
const concrete = (path) => path.replace(/:agencyId/g, '1').replace(/:\w+/g, ID);

/** The API with the sign-in replaced by `user`; reads as that user fail (no database here). */
function appAs(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    req.db = new Proxy({}, { get: () => { throw new Error('no database in tests'); } });
    next();
  });
  app.use('/api', api);
  app.use(errorHandler);
  return app;
}

/** What a contractor account may reach (anything else: 403 before any handler runs). */
const CONTRACTOR_ROUTES = new Set([
  'get /health',
  'get /reference',
  'get /reference/contractors',
  'get /me',
  'patch /me',
  'post /me/avatar',
  'delete /me/avatar',
  'get /projects/',
  'get /projects/:id',
  'get /projects/:id/phases',
  'get /projects/:id/progress',
  'post /projects/:id/progress',
  'get /projects/:id/finance',
  'get /projects/:id/images',
  'post /projects/:id/images',
  'get /projects/:id/documents',
  'get /projects/:id/flags',
  'get /projects/:id/findings',
  'get /projects/:id/completion-verification',
]);

describe('a contractor account reaches only its own project pages', () => {
  it('every staff, admin and PACC route answers 403; the contractor routes get past the role check', async () => {
    const app = appAs(contractor());
    const routes = allRoutes(api);
    assert.ok(routes.length > 60, `found ${routes.length} routes`);
    const reached = [];
    for (const [method, path] of routes) {
      const key = `${method} ${path}`;
      const res = await request(app)[method](`/api${concrete(path)}`).send({});
      if (path.startsWith('/public')) continue; // the public portal is open to everyone
      if (CONTRACTOR_ROUTES.has(key)) {
        assert.notEqual(res.status, 403, `${key} should get past the role check (got ${res.status} ${res.body?.error?.message})`);
        reached.push(key);
      } else {
        assert.equal(res.status, 403, `${key} must be refused to a contractor (got ${res.status})`);
      }
    }
    assert.deepEqual(new Set(reached), CONTRACTOR_ROUTES, 'every contractor route exists');
  });

  it('a pending contractor request reaches no project page', async () => {
    const app = appAs({ id: 'c2', role: null, profile: { approval_status: 'pending', requested_role: 'contractor' } });
    for (const key of CONTRACTOR_ROUTES) {
      const [method, path] = key.split(' ');
      if (!path.startsWith('/projects')) continue;
      const res = await request(app)[method](`/api${concrete(path)}`).send({});
      assert.equal(res.status, 403, key);
      assert.match(res.body.error.message, /waiting for approval/);
    }
  });

  it('staff keep every project page; PACC stays out of them', async () => {
    for (const r of ['admin', 'dpwh_personnel', 'auditor', 'pacc']) {
      const app = appAs({ id: `${r}-id`, role: r, profile: { approval_status: 'approved' } });
      for (const key of CONTRACTOR_ROUTES) {
        const [method, path] = key.split(' ');
        if (!path.startsWith('/projects') || method !== 'get') continue;
        const res = await request(app)[method](`/api${concrete(path)}`);
        if (r === 'pacc') assert.equal(res.status, 403, `${r} ${key}`);
        else assert.notEqual(res.status, 403, `${r} ${key}`);
      }
    }
  });

  it('only DPWH Personnel and contractors submit progress and upload photos; image edits stay Personnel only', async () => {
    for (const r of ['dpwh_personnel', 'contractor', 'admin', 'auditor', 'pacc']) {
      const app = appAs(r === 'contractor' ? contractor() : { id: `${r}-id`, role: r, profile: { approval_status: 'approved' } });
      for (const path of [`/api/projects/${ID}/progress`, `/api/projects/${ID}/images`]) {
        const res = await request(app).post(path).send({});
        if (['dpwh_personnel', 'contractor'].includes(r)) assert.equal(res.status, 503, `${r} ${path} reaches the write check`);
        else assert.equal(res.status, 403, `${r} ${path}`);
      }
      const edit = await request(app).patch(`/api/projects/${ID}/images/${ID}`).send({ caption: 'x' });
      assert.equal(edit.status, r === 'dpwh_personnel' ? 503 : 403, `${r} PATCH image`);
    }
  });

  it('the write routes check the company before any upload is read', () => {
    const stack = (router, path) => router.stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack.map((s) => s.handle);
    for (const [router, path, next] of [
      [routers.progress, '/projects/:id/progress', 'uploadProgressPhotos'],
      [routers.images, '/projects/:id/images', 'uploadPanorama'],
    ]) {
      const handlers = stack(router, path);
      const own = handlers.indexOf(role.requireOwnProject);
      assert.ok(own > handlers.indexOf(requireAuth), `${path}: requireOwnProject after sign-in`);
      assert.ok(own > handlers.indexOf(role.requireWriteAccess), `${path}: after requireWriteAccess`);
      // 030: then the verified-completion lock, then the upload (the company is checked first)
      assert.equal(handlers[own + 1], role.requireUnlockedProject, `${path}: the lock right after the company check`);
      const upload = next === 'uploadPanorama' ? 'multerMiddleware' : 'uploadProgressPhotos';
      assert.equal(handlers[own + 2].name, upload, `${path}: before the upload`);
    }
  });
});

describe('role lists', () => {
  it('STAFF is unchanged; contractors are project viewers and reporters only', () => {
    assert.deepEqual(role.STAFF, ['admin', 'dpwh_personnel', 'auditor']);
    assert.equal(role.ROLES.CONTRACTOR, 'contractor');
    assert.deepEqual(role.PROJECT_VIEWERS, ['admin', 'dpwh_personnel', 'auditor', 'contractor']);
    assert.deepEqual(role.PROJECT_REPORTERS, ['dpwh_personnel', 'contractor']);
  });
});

// ---------------------------------------------------------------------------
// Own company's projects only
// ---------------------------------------------------------------------------
describe('assertContractorOwnsProject', () => {
  const own = { contractor_id: COMPANY, contractor: { is_active: true } };
  const refused = (fn) => assert.throws(fn, (e) => e.status === 403 && e.message === CONTRACTOR_PROJECT_MESSAGE);

  it('the message is exact', () => {
    assert.equal(CONTRACTOR_PROJECT_MESSAGE, "You can only update your company's projects.");
  });
  it("lets a contractor write to its own active company's project", () => {
    assert.doesNotThrow(() => assertContractorOwnsProject(own, contractor()));
  });
  it("refuses another company's project, a project without a contractor, and a missing project", () => {
    refused(() => assertContractorOwnsProject({ contractor_id: OTHER, contractor: { is_active: true } }, contractor()));
    refused(() => assertContractorOwnsProject({ contractor_id: null, contractor: null }, contractor()));
    refused(() => assertContractorOwnsProject(null, contractor()));
  });
  it('refuses when the company is inactive, or the account has no company', () => {
    refused(() => assertContractorOwnsProject({ contractor_id: COMPANY, contractor: { is_active: false } }, contractor()));
    refused(() => assertContractorOwnsProject({ contractor_id: COMPANY }, contractor()));
    refused(() => assertContractorOwnsProject(own, contractor({ contractor_id: null })));
  });
  it('does not apply to other roles', () => {
    for (const r of ['dpwh_personnel', 'admin']) assert.doesNotThrow(() => assertContractorOwnsProject(null, { role: r, profile: {} }));
  });
});

describe('requireOwnProject', () => {
  const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err ?? null)));
  it('loads nothing for DPWH Personnel', async () => {
    let loaded = false;
    const mw = role.makeRequireOwnProject(async () => { loaded = true; });
    assert.equal(await run(mw, { user: { role: 'dpwh_personnel' }, params: { id: ID } }), null);
    assert.equal(loaded, false);
  });
  it("passes a contractor on its own company's project and refuses another's", async () => {
    const mw = (project) => role.makeRequireOwnProject(async (id) => (assert.equal(id, ID), project));
    assert.equal(await run(mw({ contractor_id: COMPANY, contractor: { is_active: true } }), { user: contractor(), params: { id: ID } }), null);
    const err = await run(mw({ contractor_id: OTHER, contractor: { is_active: true } }), { user: contractor(), params: { id: ID } });
    assert.equal(err.status, 403);
    assert.equal(err.message, CONTRACTOR_PROJECT_MESSAGE);
    assert.equal((await run(mw(null), { user: contractor(), params: { id: ID } })).status, 403);
  });
  it('passes on a lookup failure as an error', async () => {
    const mw = role.makeRequireOwnProject(async () => { throw new Error('db down'); });
    assert.equal((await run(mw, { user: contractor(), params: { id: ID } })).message, 'db down');
  });
});

// ---------------------------------------------------------------------------
// Completion stays with DPWH Personnel
// ---------------------------------------------------------------------------
describe('contractors do not complete a project', () => {
  const refused = (body, field) =>
    assert.throws(() => assertContractorDoesNotComplete(body, contractor()), (e) => e.status === 403 && e.message === COMPLETION_BY_PERSONNEL_MESSAGE && e.details[0].field === field);
  it('the message is exact', () => {
    assert.equal(COMPLETION_BY_PERSONNEL_MESSAGE, "Only DPWH Personnel can confirm a project's completion.");
  });
  it('a contractor report with an actual completion date, or a final as-built upload, is refused', () => {
    refused({ report_date: '2026-11-27', actual_completion_date: '2026-11-26', phases: [] }, 'actual_completion_date');
    refused({ inspection_date: '2026-11-27', is_final: true }, 'is_final');
  });
  it('an ordinary contractor report or upload passes', () => {
    for (const body of [{ report_date: '2026-11-27', phases: [] }, { actual_completion_date: null }, { inspection_date: '2026-11-27', is_final: false }]) {
      assert.doesNotThrow(() => assertContractorDoesNotComplete(body, contractor()));
    }
  });
  it('DPWH Personnel still record completion', () => {
    assert.doesNotThrow(() => assertContractorDoesNotComplete({ actual_completion_date: '2026-11-26', is_final: true }, { role: 'dpwh_personnel' }));
  });
  it('both write routes check it after validation, right before the controller', () => {
    for (const [router, path] of [[() => routers.progress, '/projects/:id/progress'], [() => routers.images, '/projects/:id/images']]) {
      const handlers = router().stack.find((l) => l.route?.path === path && l.route.methods.post).route.stack.map((x) => x.handle);
      assert.equal(handlers.at(-2), role.refuseContractorCompletion, path);
    }
  });
  it('the middleware passes the error on', () => {
    let err;
    role.refuseContractorCompletion({ user: contractor(), body: { is_final: true } }, {}, (e) => { err = e; });
    assert.equal(err.status, 403);
    role.refuseContractorCompletion({ user: { role: 'dpwh_personnel' }, body: { is_final: true } }, {}, (e) => { err = e; });
    assert.equal(err, undefined);
  });
});

// ---------------------------------------------------------------------------
// No PACC data for contractors
// ---------------------------------------------------------------------------
describe('withoutPaccFields', () => {
  const row = { id: ID, name: 'Road A', pacc_case_status: 'under_investigation', overall_progress: 40 };
  it('drops pacc_case_status (and any pacc_* field) for a contractor', () => {
    assert.deepEqual(withoutPaccFields(row, contractor()), { id: ID, name: 'Road A', overall_progress: 40 });
    assert.deepEqual(withoutPaccFields({ ...row, pacc_public_status: 'case_filed' }, contractor()), { id: ID, name: 'Road A', overall_progress: 40 });
  });
  it('keeps it for staff', () => {
    for (const r of ['admin', 'dpwh_personnel', 'auditor']) assert.equal(withoutPaccFields(row, { role: r }), row);
  });
  it('the list and the project page use it', () => {
    const src = readFileSync(new URL('../controllers/projectsController.js', import.meta.url), 'utf8');
    assert.match(src, /data\.map\(\(row\) => withoutPaccFields\(row, req\.user\)\)/);
    assert.match(src, /data: withoutPaccFields\(project, req\.user\)/);
  });
});

describe('contractorSafeValidation', () => {
  const v = { distance_m: 12, reused_elsewhere: true, reused_in_projects: [OTHER], near_duplicate_in_projects: [OTHER], warnings: ['An identical file has already been uploaded.'] };
  it("drops other projects' ids for a contractor and keeps the warnings", () => {
    assert.deepEqual(contractorSafeValidation(v, contractor()), { distance_m: 12, reused_elsewhere: true, warnings: ['An identical file has already been uploaded.'] });
  });
  it('keeps everything for staff, and copes with a missing record', () => {
    assert.equal(contractorSafeValidation(v, { role: 'dpwh_personnel' }), v);
    assert.equal(contractorSafeValidation(null, contractor()), null);
  });
  it('the photo list and the upload response use it', () => {
    const src = readFileSync(new URL('../controllers/imagesController.js', import.meta.url), 'utf8');
    assert.match(src, /validation: contractorSafeValidation\(r\.validation, req\.user\)/);
    assert.match(src, /contractorSafeValidation\(insert\.data\.validation, req\.user\)/);
    assert.match(src, /contractorSafeValidation\(\{ \.\.\.v\.validation, compressed: stored\.compressed \}, req\.user\)/);
  });
});

// ---------------------------------------------------------------------------
// Names on records (a contractor reads only its own profile)
// ---------------------------------------------------------------------------
describe('fillMissingNames', () => {
  const fields = [{ id: 'submitted_by', name: 'submitted_by_name', role: 'submitted_by_role' }];
  it('fills only the names the embed could not read', async () => {
    const asked = [];
    const load = async (ids) => (asked.push(...ids), new Map([['u2', { full_name: 'Engr. Cruz', role: 'dpwh_personnel' }]]));
    const rows = [
      { submitted_by: 'u1', submitted_by_name: 'Rep A', submitted_by_role: 'contractor' },
      { submitted_by: 'u2', submitted_by_name: null, submitted_by_role: null },
      { submitted_by: null, submitted_by_name: null, submitted_by_role: null },
    ];
    const out = await fillMissingNames(rows, fields, load);
    assert.deepEqual(asked, ['u2']);
    assert.deepEqual(out.map((r) => [r.submitted_by_name, r.submitted_by_role]), [['Rep A', 'contractor'], ['Engr. Cruz', 'dpwh_personnel'], [null, null]]);
  });
  it('makes no lookup when every name is there (staff responses are unchanged)', async () => {
    const rows = [{ submitted_by: 'u1', submitted_by_name: 'Rep A' }];
    const out = await fillMissingNames(rows, fields, async () => assert.fail('no lookup expected'));
    assert.equal(out, rows);
  });
  it('fills a position too', async () => {
    const out = await fillMissingNames([{ assigned_to: 'u3', assigned_to_name: null, assigned_to_position: null }], [{ id: 'assigned_to', name: 'assigned_to_name', position: 'assigned_to_position' }], async () => new Map([['u3', { full_name: 'Ana', position: 'Engineer II' }]]));
    assert.deepEqual(out[0], { assigned_to: 'u3', assigned_to_name: 'Ana', assigned_to_position: 'Engineer II' });
  });
});

// ---------------------------------------------------------------------------
// User Management: contractor accounts need a company
// ---------------------------------------------------------------------------
describe('account schemas', () => {
  const base = { email: 'rep@alpha.ph', password: 'password1', full_name: 'Rep A' };
  it('the message is exact', () => {
    assert.equal(CONTRACTOR_COMPANY_MESSAGE, 'Choose the contractor company for this account.');
  });
  it('creating a contractor account requires its company', () => {
    const r = userCreate.safeParse({ ...base, role: 'contractor' });
    assert.equal(r.success, false);
    assert.deepEqual(r.error.issues.map((i) => [i.path.join('.'), i.message]), [['contractor_id', CONTRACTOR_COMPANY_MESSAGE]]);
    assert.equal(userCreate.safeParse({ ...base, role: 'contractor', contractor_id: '' }).success, false);
    assert.equal(userCreate.safeParse({ ...base, role: 'contractor', contractor_id: 'Alpha' }).success, false);
    assert.equal(userCreate.safeParse({ ...base, role: 'contractor', contractor_id: COMPANY }).success, true);
  });
  it('staff accounts need no company; PACC stays refused', () => {
    assert.equal(userCreate.safeParse({ ...base, role: 'auditor' }).success, true);
    assert.equal(userCreate.safeParse({ ...base, role: 'pacc', contractor_id: COMPANY }).success, false);
  });
  it('an edit to the contractor role cannot clear the company', () => {
    assert.equal(userUpdate.safeParse({ role: 'contractor', contractor_id: null }).success, false);
    assert.equal(userUpdate.safeParse({ role: 'contractor' }).success, true); // the controller uses the current or requested company
    assert.equal(userUpdate.safeParse({ contractor_id: COMPANY }).success, true);
    assert.equal(userUpdate.safeParse({ role: 'pacc' }).success, false);
  });
  it('approving as contractor may leave the company to the one asked for at sign-up', () => {
    assert.equal(userApprove.safeParse({ role: 'contractor' }).success, true);
    assert.equal(userApprove.safeParse({ role: 'contractor', contractor_id: OTHER }).success, true);
    assert.equal(userApprove.safeParse({ role: 'pacc' }).success, false);
  });
});

describe('resolveContractorCompany', () => {
  it('400 with the exact message when no company is given', async () => {
    for (const id of [undefined, null, '']) {
      await assert.rejects(users.resolveContractorCompany(id, async () => assert.fail('no lookup')), (e) => e.status === 400 && e.message === CONTRACTOR_COMPANY_MESSAGE && e.details[0].field === 'contractor_id');
    }
  });
  it('400 when the company does not exist; the company when it does', async () => {
    await assert.rejects(users.resolveContractorCompany(OTHER, async () => null), (e) => e.status === 400 && e.details[0].field === 'contractor_id');
    assert.deepEqual(await users.resolveContractorCompany(COMPANY, async (id) => ({ id, name: 'Alpha' })), { id: COMPANY, name: 'Alpha' });
  });
});

describe('contractorPatch (editing an account)', () => {
  const resolve = async (id) => {
    if (!id) throw Object.assign(new Error(CONTRACTOR_COMPANY_MESSAGE), { status: 400 });
    return { id, name: id === COMPANY ? 'Alpha' : 'Bravo' };
  };
  it('a new contractor account uses the company given, else its current, else the requested one', async () => {
    const p1 = { role: 'contractor', contractor_id: OTHER };
    assert.equal((await users.contractorPatch(p1, { role: 'dpwh_personnel' }, resolve)).id, OTHER);
    assert.equal(p1.contractor_id, OTHER);
    const p2 = { role: 'contractor' };
    await users.contractorPatch(p2, { role: null, requested_contractor_id: COMPANY }, resolve);
    assert.equal(p2.contractor_id, COMPANY);
    await assert.rejects(users.contractorPatch({ role: 'contractor' }, { role: 'auditor' }, resolve), (e) => e.status === 400);
  });
  it('changing the company of a contractor account checks it', async () => {
    const p = { contractor_id: OTHER };
    assert.equal((await users.contractorPatch(p, { role: 'contractor', contractor_id: COMPANY }, resolve)).name, 'Bravo');
  });
  it('leaving the contractor role clears the company; other roles never get one', async () => {
    const p1 = { role: 'auditor' };
    assert.equal(await users.contractorPatch(p1, { role: 'contractor', contractor_id: COMPANY }, resolve), null);
    assert.equal(p1.contractor_id, null);
    const p2 = { full_name: 'Ana', contractor_id: COMPANY };
    await users.contractorPatch(p2, { role: 'dpwh_personnel', contractor_id: null }, resolve);
    assert.equal('contractor_id' in p2, false);
  });
  it('a name-only edit of a contractor account looks nothing up', async () => {
    const p = { full_name: 'Rep B' };
    assert.equal(await users.contractorPatch(p, { role: 'contractor', contractor_id: COMPANY }, async () => assert.fail('no lookup')), null);
    assert.deepEqual(p, { full_name: 'Rep B' });
  });
});

describe('licenceMatches', () => {
  it('ignores case and spaces', () => {
    assert.equal(licenceMatches(' 12 345 ', '12345'), true);
    assert.equal(licenceMatches('ab-12', 'AB-12'), true);
    assert.equal(licenceMatches('12346', '12345'), false);
  });
  it('null when there is nothing to compare', () => {
    assert.equal(licenceMatches(null, '12345'), null);
    assert.equal(licenceMatches('12345', null), null);
    assert.equal(licenceMatches('  ', '12345'), null);
  });
});

describe('the PACC guards stay', () => {
  it('User Management still leaves PACC accounts out', () => {
    const src = readFileSync(new URL('../controllers/usersController.js', import.meta.url), 'utf8');
    assert.match(src, /\.or\('role\.is\.null,role\.neq\.pacc'\)/);
    assert.equal(src.match(/^  assertNotPaccAccount\(target\);$/gm).length, 4); // edit, approve, decline, and loadTarget (delete, suspend, unsuspend)
  });
});

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
describe('migration 028', () => {
  const code = readFileSync(new URL('../../../database/migrations/028_contractor_role.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '').trim();
  it('only adds the enum value', () => {
    assert.equal(code, "alter type public.user_role add value if not exists 'contractor';");
  });
});

describe('migration 029', () => {
  const code = readFileSync(new URL('../../../database/migrations/029_contractor_accounts.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  it('links an account to one company, required for the contractor role', () => {
    assert.match(code, /add column if not exists contractor_id uuid\s+constraint profiles_contractor_id_fkey references public\.contractors \(id\) on delete restrict/);
    assert.match(code, /add constraint profiles_contractor_has_company\s+check \(role is distinct from 'contractor' or contractor_id is not null\)/);
    assert.match(code, /requested_contractor_id uuid\s+constraint profiles_requested_contractor_id_fkey references public\.contractors \(id\) on delete set null/);
    assert.match(code, /char_length\(requested_contractor_license\) <= 50/);
  });
  it('sign-up may request contractor; the role stays empty until approval', () => {
    assert.match(code, /requested_role in \('dpwh_personnel', 'auditor', 'contractor'\)/);
    assert.match(code, /v_req not in \('dpwh_personnel', 'auditor', 'contractor'\)/);
    assert.match(code, /select c\.id into v_contractor from public\.contractors c/);
    assert.match(code, /if v_contractor is null then\s+v_req := null;\s+v_unknown_company := true;/);
    assert.match(code, /when v_req is null and v_unknown_company then 'The contractor company was not found\. Choose your company again\.'\s+when v_req is null then 'No staff role was requested\. Browsing the public portal needs no account\.'/);
    // the inserted role is always NULL
    assert.match(code, /coalesce\(meta ->> 'full_name', ''\), 120\),\s+null,/);
  });
  it('the helper requires an approved, active account and an active company', () => {
    const fn = code.match(/create or replace function private\.contractor_company\(\)[\s\S]*?\$\$;/)[0];
    for (const part of ["p.role = 'contractor'", "p.approval_status = 'approved'", 'p.is_active', 'c.is_active', 'p.id = auth.uid()', 'security definer', "set search_path = ''", 'stable']) {
      assert.ok(fn.includes(part), part);
    }
    assert.match(code, /revoke all on function private\.contractor_company\(\) from public;/);
    assert.match(code, /grant execute on function private\.contractor_company\(\) to authenticated, service_role;/);
  });
  it('adds a contractor read policy on each project table', () => {
    const policies = [...code.matchAll(/create policy "([^"]+): contractor read" on public\.(\w+)/g)].map((m) => m[2]).sort();
    assert.deepEqual(policies, ['audit_findings', 'contractors', 'financial_records', 'flag_history', 'flag_reviews', 'progress_updates', 'project_documents', 'project_phases', 'projects', 'site_images']);
    assert.match(code, /on public\.projects\s+for select to authenticated using \(contractor_id = \(select private\.contractor_company\(\)\)\)/);
    assert.match(code, /on public\.contractors\s+for select to authenticated using \(id = \(select private\.contractor_company\(\)\)\)/);
  });
  it('changes nothing for anon or staff', () => {
    assert.doesNotMatch(code, /\bto\s+anon\b/i);
    assert.doesNotMatch(code, /function private\.is_staff/);
    assert.doesNotMatch(code, /activity_logs/);
  });
  it('moves the PACC case status out of projects, into a table only staff and PACC read', () => {
    assert.match(code, /create table if not exists public\.project_pacc_status \(\s+project_id\s+uuid primary key references public\.projects \(id\) on delete cascade,\s+case_status text not null check \(case_status in \('under_investigation', 'case_filed'\)\)/);
    assert.match(code, /revoke all on public\.project_pacc_status from anon, authenticated;/);
    assert.match(code, /grant select on public\.project_pacc_status to authenticated;/);
    assert.doesNotMatch(code, /grant[^;]*project_pacc_status[^;]*\banon\b/i);
    assert.match(code, /alter table public\.project_pacc_status enable row level security/);
    assert.match(code, /on public\.project_pacc_status\s+for select to authenticated using \(\(select private\.is_staff\(\)\) or \(select private\.is_pacc\(\)\)\)/);
    assert.doesNotMatch(code, /on public\.project_pacc_status[^;]*contractor/);
  });
  it('drops projects.pacc_case_status; the trigger writes the new table and no longer that column', () => {
    assert.match(code, /alter table public\.projects drop column if exists pacc_case_status;/);
    assert.ok(code.indexOf('drop view if exists public.v_project_summary;') < code.indexOf('drop column if exists pacc_case_status'), 'the view is dropped first');
    const fn = code.match(/create or replace function private\.sync_pacc_public_status\(\)[\s\S]*?\$\$;/)[0];
    assert.doesNotMatch(fn, /pacc_case_status/);
    assert.match(fn, /set pacc_public_status = v_public\s+where p\.id = v_project\s+and p\.pacc_public_status is distinct from v_public;/);
    assert.match(fn, /delete from public\.project_pacc_status/);
    assert.match(fn, /insert into public\.project_pacc_status[\s\S]*on conflict \(project_id\) do update[\s\S]*is distinct from excluded\.case_status/);
    assert.match(code, /insert into public\.project_pacc_status \(project_id, case_status\)\s+select c\.project_id, c\.status\s+from public\.pacc_cases c/); // backfill
  });
  it('v_project_summary takes pacc_case_status (still last) from the new table, with the live grants', () => {
    const view = code.match(/create view public\.v_project_summary with \(security_invoker = true\) as[\s\S]*?;/)[0];
    assert.match(view, /end as financial_progress,\s+ps\.case_status as pacc_case_status\s+from public\.projects p/);
    assert.match(view, /left join public\.project_pacc_status ps on ps\.project_id = p\.id;$/);
    assert.doesNotMatch(view, /p\.pacc_case_status/);
    assert.match(code, /revoke all on public\.v_project_summary from public, anon, authenticated, service_role;\s+grant select on public\.v_project_summary to authenticated;\s+grant all on public\.v_project_summary to service_role;/);
  });
});
