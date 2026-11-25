# Roles and permissions

Who can use the system, what each person may do, and where those rules are enforced. For the tables mentioned
here see [database.md](database.md); for what each feature does see [features.md](features.md).

## Roles

The database has three roles (enum `user_role`). Two more kinds of user have no role at all.

| Who | Role value | What it is for |
|---|---|---|
| **System Administrator** | `admin` | Runs the system: approves access requests and manages accounts, offices and the automatic flag rules. Can also do everything DPWH personnel and auditors do |
| **DPWH Personnel** | `dpwh_personnel` | Keeps the project records up to date: registers projects and contractors, sets up phases, reports progress, records payments, uploads 360° photos and documents, and reports on the corrective actions assigned to them |
| **Auditor** | `auditor` | Checks the work: reviews automatic flags (confirm or override), records audit findings, decides which photos the public may see, and reads the activity log. Read-only for project data |
| Public visitor | none (no account) | Browses the public portal. Needs no account |
| Applicant (pending or declined) | none (`role` is empty) | Has registered and is waiting for approval, or was declined. Sees only what a public visitor sees |

There is no "public" user role any more: migration 017 removed it, because the portal needs no account.

## Permission matrix

**V** = view · **C** = create · **E** = edit · **D** = delete · **—** = no access.
"Staff" columns assume an active, approved account. Rules are taken from the API routes (`server/src/routes/`),
which are the real enforcement point for every write.

| Feature or record | Admin | DPWH Personnel | Auditor | Public visitor / applicant |
|---|---|---|---|---|
| Public portal (dashboard, projects, map, public 360° photos) | V | V | V | V |
| Projects | V C E D | V C E | V | V (public fields only) |
| Project status: set Suspended / Terminated | E | E | — | — |
| Construction phases (plan) | V C E D¹ | V C E D¹ | V | — |
| Progress reports | V C | V C | V | — (only the overall %) |
| Financial records | V C D | V C | V | — (only the contract amount) |
| 360° photos: upload, caption, mark final | V C E | V C E | V | — |
| 360° photos: show to / hide from public | E | — | E | V (approved photos only) |
| 360° photos: delete | D | — | — | — |
| Project documents | V C D | V C D² | V | — |
| Automatic flags and flag history | V | V | V | — |
| Flag review (confirm / override) | C | — | C | — |
| Re-check all flags now | C | — | — | — |
| Audit findings | V C E | V | V C E | — |
| Corrective action on a finding | E | E³ | E | — |
| Finding "show to public" switch | E | — | E | — (not shown anywhere publicly) |
| Project map (staff, with flags) | V | V | V | — |
| Dashboards and charts | V | V | V | — |
| Reports (PDF, Excel, CSV) | V | V | V | — |
| Contractors | V C E D⁴ | V C E (incl. suspend) | V | — (only names, on projects) |
| Offices and agencies | V C E D⁵ | V | V | V (lists only) |
| User accounts and access requests | V C E D (approve, decline, suspend) | — | — | — |
| Own account (name, position, photo after approval, password) | V E | V E | V E | E (applicants only) |
| Activity logs | V | — | V | — |
| Flag rules (System Settings) | V E | V⁶ | V⁶ | — |

1. Phases can be removed by saving a new plan, but not a phase that already has reported work.
2. Personnel may delete only documents they uploaded. Admins may delete any.
3. Only the person the finding is assigned to. A finding the auditor has closed cannot be changed.
4. A contractor still assigned to a project cannot be deleted; suspend it instead.
5. An office used by any project or user account cannot be deleted.
6. The API lets every staff role read the rules, but the System Settings page is shown to admins only.

Other limits enforced by the API:
- An admin cannot change their own role, or deactivate, suspend, decline or delete their own account.
- The last active admin cannot be suspended or deleted.
- An account with any records (projects, reports, photos, findings, log entries…) cannot be deleted; it must be
  suspended instead, so the history stays intact.

## Registration and approval

**Who can register:** anyone can open the Register page, but it only asks for staff access, as **DPWH Personnel**
or **Auditor**. Nobody can register as an admin. Browsing the portal needs no account.

**What happens on sign-up** (database trigger `handle_new_user`):
- The account is created with **no role**.
- The requested role, office and position are saved on the profile.
- `approval_status` becomes `pending`. If no valid staff role was requested, it becomes `rejected` instead.

Whether the person must confirm their email before signing in depends on a Supabase Auth setting that this
documentation could not read (see the note at the end of [README.md](README.md)). The Register page handles both
cases.

**What "pending" means:**

| A pending (or declined) account can | It cannot |
|---|---|
| Sign in | Open any page under `/app` (it is sent back to the public portal) |
| Browse the public portal, with a banner showing the request status | Call any staff API endpoint (403 "waiting for approval") |
| Open the "Awaiting approval" page (`/account-pending`) | Read any staff table, even with the publishable key (RLS) |
| Read its own profile | Use its requested role in any way |

**Who approves:** only the System Administrator, on the **User Management** page. The admin can:
- **Approve** — grants a role (which may differ from the one requested) and may set the office and position.
  `approval_status` becomes `approved` and the account becomes active.
- **Decline** — with an optional note. `approval_status` becomes `rejected`; the role stays empty.

An admin can also create a staff account directly. That account is approved at once.

The sequence diagram is in [workflows.md](workflows.md#registration-and-approval).

## Suspension and deactivation

An admin can suspend an account with a reason (5–500 characters) and lift the suspension later. Suspending does
two things:
1. It bans the user in Supabase Auth (a 100-year ban), so they cannot sign in.
2. It sets `profiles.is_active = false`, so the API refuses every request, even with a token issued earlier.

The browser signs a suspended user out as soon as the API answers that the account is suspended.

## How access is enforced

There are three layers. Only the last two actually protect data.

### 1. Frontend route guards (convenience only)
`client/src/routes/ProtectedRoute.jsx` and `App.jsx`:
- `/app/**`: signed-in staff (admin, DPWH personnel, auditor). Others go to `/login`, or to `/` if they have no role.
- `/app/projects/new` and `/app/projects/:id/edit`: admin and DPWH personnel.
- `/app/activity`: admin and auditor.
- `/app/users` and `/app/settings`: admin.
- The sidebar shows only the items for the user's role, and buttons such as Edit, Delete or Review are hidden from
  roles that may not use them.

These only decide what is shown. Anyone can change the code running in their own browser, so they are not security.

### 2. API checks (the real enforcement point for every write)
`server/src/middleware/auth.js` and `role.js`, applied in each route file:
- `authenticate` checks the sign-in token with Supabase Auth on every request and loads the profile. An
  inactive account gets 403.
- `requireAuth` refuses requests without a valid sign-in (401).
- `requireRole(...)` refuses accounts that are not approved, or whose role is not in the list (403).
- `requireWriteAccess` refuses writes when the server has no service-role key (503).
- Each controller then applies record-level rules (uploader-only delete, assigned-person-only corrective action,
  self-protection rules, delete blocked by existing records).
- Input is validated with zod schemas (`routes/schemas.js`) and business rules (`services/validationRules.js`).

The API is the only place that can write: the browser has no write permission in the database at all.

### 3. Row Level Security (the real enforcement point for reads)
The publishable (anon) key is inside the web app, so anyone could query Supabase directly with it. RLS and
column grants decide what such a query returns, whatever the API does. See
[database.md → Row Level Security](database.md#row-level-security).

Most API reads run **as the caller**: the API uses a Supabase client carrying the user's own token
(`req.db`), so RLS applies twice. Public portal endpoints read as `anon`.

### Which layer protects each resource

| Resource | Reads protected by | Writes protected by |
|---|---|---|
| Public project data (`v_public_projects`, public photo rows) | RLS + column grants (anon) | API only (no write grants) |
| Staff project data (projects, phases, progress, finance, photos, documents, flags, findings) | RLS (`is_staff()`) and the API role check | API role check + controller rules |
| Activity logs | RLS (admin, auditor) and the API role check | API only; append-only trigger in the database |
| Flag history and reviews | RLS (staff) | API only; append-only trigger; CHECK rules (evidence required to override) |
| User list, access requests, "assign to" list | **API role check only** (these reads use the service role) | API role check (admin) |
| Profiles read directly with a token | RLS (own profile, or staff) | API only |
| Files in Storage | API only (private buckets, no storage policies, expiring signed links) | API only |
| Project ID | — | Database trigger (assigned on insert, cannot be changed) |
| Lookup lists (municipalities, barangays, offices) | Open to everyone by design | API role check (admin, for offices) |
