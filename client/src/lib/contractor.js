/**
 * Contractor accounts (migrations 028, 029): what a contractor company's representative sees and may do in /app.
 * A contractor reaches only its own company's projects and, on them, submits progress reports and uploads 360°
 * photos. Hiding screens here is a convenience only: RLS (private.contractor_company()) and the API
 * (PROJECT_VIEWERS / PROJECT_REPORTERS + requireOwnProject) are what enforce it.
 */
import { CONTRACTOR_ROLE, STAFF_ROLES } from './constants.js';

export const isContractor = (role) => role === CONTRACTOR_ROLE;

/** Roles the System Administrator can grant on User Management (PACC manages its own accounts). */
export const ASSIGNABLE_ROLES = [...STAFF_ROLES, CONTRACTOR_ROLE];

/** The contractor sidebar (icons are added by AppLayout). */
export const CONTRACTOR_NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/projects', label: 'My projects' },
  { to: '/app/account', label: 'My account' },
];

/** The project page tabs a contractor may open (all of them, mostly read only); `''` is the Overview. */
const CONTRACTOR_PROJECT_TABS = ['', 'progress', 'images', 'finance', 'flags', 'documents'];

/**
 * May this role open this /app path? Staff are left to the role lists on each route (always true here).
 * A contractor may open only its dashboard, the project list, a project's tabs and My account; every other
 * /app page (including ones added later) sends it back to its dashboard.
 */
export function canOpenWorkspacePath(role, pathname) {
  if (!isContractor(role)) return true;
  const path = String(pathname || '').replace(/\/+$/, '') || '/';
  if (path !== '/app' && !path.startsWith('/app/')) return true;
  if (path === '/app' || path === '/app/projects' || path === '/app/account') return true;
  const m = path.match(/^\/app\/projects\/([^/]+)(?:\/([^/]+))?$/);
  if (!m || m[1] === 'new') return false;
  return CONTRACTOR_PROJECT_TABS.includes(m[2] ?? '');
}

/**
 * What a role may do on a project page.
 * - canEdit: project edit, phase plan, finance records, documents upload, a photo's final mark (DPWH Personnel, 027).
 * - canDelete: project, photo and finance deletes (System Administrator).
 * - canReport: progress reports and 360° photo uploads (DPWH Personnel and contractors).
 * - canConfirmCompletion: the actual completion date and the final as-built photo (DPWH Personnel only; the API
 *   answers a contractor 403 "Only DPWH Personnel can confirm a project's completion.").
 * - showPacc: the PACC case status chip (staff only; contractors never see PACC data).
 */
export function projectPermissions(role) {
  const staff = STAFF_ROLES.includes(role);
  const personnel = role === 'dpwh_personnel';
  return {
    canEdit: personnel,
    canDelete: role === 'admin',
    canReport: personnel || isContractor(role),
    canConfirmCompletion: personnel,
    showPacc: staff,
    isStaff: staff,
    isContractor: isContractor(role),
  };
}

/** "Juan Dela Cruz (Contractor)" on progress reports and photos when the server says a contractor did it. */
export function byLabel(name, role) {
  const who = name || '—';
  return isContractor(role) ? `${who} (Contractor)` : who;
}

const SIGN_UP_ROLES = ['dpwh_personnel', 'auditor', CONTRACTOR_ROLE];
const orNull = (v) => {
  const t = v == null ? '' : String(v).trim();
  return t === '' ? null : t;
};

/**
 * The sign-up metadata public.handle_new_user() reads (017, contractor keys from 029). A contractor request
 * carries the company and the typed PCAB licence and no DPWH office; a staff request is unchanged. The trigger
 * never grants a role: every request waits for the System Administrator.
 */
export function signUpMetadata(form) {
  const role = SIGN_UP_ROLES.includes(form.requested_role) ? form.requested_role : null;
  const base = { full_name: form.full_name, requested_role: role };
  if (isContractor(role)) {
    return {
      ...base,
      requested_contractor_id: orNull(form.contractor_id),
      requested_contractor_license: orNull(form.contractor_license),
      agency_id: null,
      position: orNull(form.position),
    };
  }
  return { ...base, agency_id: orNull(form.agency_id), position: orNull(form.position) };
}

/** Role, company, office and position for POST /users, PATCH /users/:id and POST /users/:id/approve. */
export function userAccountPayload(form) {
  const out = { role: form.role, agency_id: form.agency_id || null, position: form.position || null };
  if (isContractor(form.role)) out.contractor_id = form.contractor_id || null;
  return out;
}

/** The approve dialog's note on the licence typed at sign-up (`requested_contractor_license_matches`). */
export function licenceCheck(matches) {
  if (matches === true) return { tone: 'success', text: 'Matches the PCAB licence on file for this company.' };
  if (matches === false) return { tone: 'warning', text: 'Does not match the PCAB licence on file for this company. Check with the company before approving.' };
  return { tone: 'info', text: 'Nothing to compare: the licence was not typed or the company has none on file.' };
}

/** A project with no 360° photo in this many days counts as "no recent photo" on the contractor dashboard. */
export const RECENT_PHOTO_DAYS = 30;

const daysBetween = (fromIso, toIso) => (new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86_400_000;

/** Headline numbers of the contractor dashboard (from GET /projects rows). */
export function contractorDashboardSummary(rows, todayIso) {
  const open = rows.filter((r) => r.status !== 'completed');
  return {
    total: rows.length,
    behind: rows.filter((r) => Number(r.overall_progress || 0) < Number(r.planned_progress || 0)).length,
    flagged: rows.filter((r) => r.current_flag === 'yellow' || r.current_flag === 'red').length,
    noRecentPhoto: open.filter((r) => !r.latest_inspection_date || daysBetween(String(r.latest_inspection_date).slice(0, 10), todayIso) > RECENT_PHOTO_DAYS).length,
  };
}

/** Shown when a contractor sees no projects (none assigned yet, or RLS returns nothing). */
export const CONTRACTOR_NO_PROJECTS = 'No projects of your company are shown. If you expected to see projects here, contact the DPWH District Engineering Office.';

/**
 * The contractor dashboard's empty state. A company marked inactive sees no projects at all (RLS,
 * private.contractor_company()), so that case says why.
 */
export function contractorEmptyMessage(company) {
  if (company && company.is_active === false) {
    return `${company.name} is marked inactive in the system, so its projects are not shown. If you expected to see projects here, contact the DPWH District Engineering Office.`;
  }
  return CONTRACTOR_NO_PROJECTS;
}
