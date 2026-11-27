# Roles and permissions

Who can use the system, what each person may do, and where those rules are enforced. For the tables mentioned
here see [database.md](database.md); for what each feature does see [features.md](features.md).

## Roles

The database has four roles (enum `user_role`). Two more kinds of user have no role at all.

| Who | Role value | What it is for |
|---|---|---|
| **System Administrator** | `admin` | Runs the system: approves access requests and manages accounts, offices and the automatic flag rules. Can also do everything DPWH personnel and auditors do. Cannot see or manage PACC accounts, and cannot read citizen reports, PACC cases or the PACC activity log |
| **DPWH Personnel** | `dpwh_personnel` | Keeps the project records up to date: registers projects and contractors, sets up phases, reports progress, records payments, uploads 360° photos and documents, and reports on the corrective actions assigned to them |
| **Auditor** | `auditor` | Checks the work: reviews automatic flags (confirm or override), records audit findings, decides which photos the public may see, and reads the activity log. Read-only for project data |
| **PACC** | `pacc` | Presidential Anti-Corruption Commission (migration 023). Receives projects with an auditor-confirmed Red flag and anonymous citizen reports, investigates, and records cases. Read-only for project data. Uses the PACC portal (`/pacc`), not the staff workspace. Manages its own accounts |
| Public visitor | none (no account) | Browses the public portal, reports a problem on a project to PACC (anonymously, with photo proof) and checks a report's status with its tracking code. Needs no account |
| Applicant (pending or declined) | none (`role` is empty) | Has registered and is waiting for approval, or was declined. Sees only what a public visitor sees |

There is no "public" user role any more: migration 017 removed it, because the portal needs no account.

`pacc` is not a staff role: it is not in the database's `is_staff()` or the API's `STAFF` list, so a PACC account
cannot open `/app` or call any staff route. The other way round, the System Administrator **cannot see or manage
PACC accounts**: User Management does not list them, and the API refuses to create an account with the PACC role or
to approve, decline, edit, suspend, reactivate or delete a PACC account ("PACC accounts are managed by PACC.").

## Permission matrix

**V** = view · **C** = create · **E** = edit · **D** = delete · **—** = no access.
"Staff" and PACC columns assume an active, approved account. Rules are taken from the API routes (`server/src/routes/`),
which are the real enforcement point for every write.

| Feature or record | Admin | DPWH Personnel | Auditor | PACC | Public visitor / applicant |
|---|---|---|---|---|---|
| Public portal (dashboard, projects, map, public 360° photos) | V | V | V | V | V |
| Projects | V C E D | V C E⁷ | V | V⁸ | V (public fields only) |
| Project status: set Suspended / Terminated | E | E | — | — | — |
| Construction phases (plan) | V C E D¹ | V C E D¹ | V | V⁸ | — |
| Progress reports | V C | V C | V | V⁸ | — (only the overall %) |
| Financial records | V C D | V C | V | V⁸ | — (only the contract amount) |
| 360° photos: upload, caption, mark final | V C E | V C E | V | V⁸ | — |
| 360° photos on the public portal | V | V | V | V | V (every photo, as soon as it is uploaded; no approval step) |
| 360° photos: delete | D | — | — | — | — |
| Project documents | V C D | V C D² | V | V⁸ | — |
| Automatic flags and flag history | V | V | V | V | — (only the flag an auditor confirmed or overrode; "Under review" before that) |
| Flag review (confirm / override) | C | — | C | — (reads the decisions) | — |
| Re-check all flags now | C | — | — | — | — |
| Audit findings | V C E | V | V C E | V | — |
| Corrective action on a finding | E | E³ | E | — | — |
| Finding "show to public" switch | E | — | E | — | — (not shown anywhere publicly) |
| Project map (staff, with flags) | V | V | V | — | — |
| Dashboards and charts | V | V | V | — | — |
| Reports (PDF, Excel, CSV) | V | V | V | — | — |
| Contractors | V C E D⁴ | V C E (incl. suspend) | V | V (to name a respondent) | — (only names, on projects) |
| Offices and agencies | V C E D⁵ | V | V | V (lists only) | V (lists only) |
| User accounts and access requests | V C E D (approve, decline, suspend), except PACC accounts⁹ | — | — | — | — |
| Own account (name, position, photo after approval, password) | V E | V E | V E | V E | E (applicants only) |
| Activity logs | V | — | V | V⁸ (entries tied to a project only) | — |
| Flag rules (System Settings) | V E | V⁶ | V⁶ | — | — |
| Citizen reports: send, anonymously, with 1–3 proof photos ("Magsumbong") | C¹⁰ | C¹⁰ | C¹⁰ | C¹⁰ | C |
| Citizen report status by tracking code (Received / Under review / Closed, and the date) | V¹⁰ | V¹⁰ | V¹⁰ | V¹⁰ | V |
| Citizen reports and their proof photos: read, close with an outcome | — | — | — | V E | — |
| PACC cases (respondents, charges, status, notes, documents) | — | — | — | V C E¹¹ | — |
| PACC case status on the public project drawer | V | V | V | V E (the "show status to public" switch) | V (only "Under PACC investigation" or "Case filed", when switched on) |
| PACC activity log | — | — | — | V | — |
| PACC accounts (PACC Members page) | — | — | — | V C E D¹² | — |

1. Phases can be removed by saving a new plan, but not a phase that already has reported work.
2. Personnel may delete only documents they uploaded. Admins may delete any.
3. Only the person the finding is assigned to. A finding the auditor has closed cannot be changed.
4. A contractor still assigned to a project cannot be deleted; suspend it instead.
5. An office used by any project or user account cannot be deleted.
6. The API lets every staff role read the rules, but the System Settings page is shown to admins only.
7. Personnel cannot change a project's location once 360° photos have been uploaded for it. Only a System Administrator can, and the move is recorded in the activity log.
8. PACC reads project data only, never writes it. The PACC investigation page shows the project summary, the flag and its history, auditor decisions and findings. RLS also lets a PACC account read phases, progress, finance, 360° photo records, documents and the activity-log entries tied to a project, as an Auditor can (migration 024). PACC cannot use `/app` or any staff route.
9. PACC accounts are not listed in User Management, and the API refuses every action on them (see [Roles](#roles)).
10. Anyone can report, signed in or not, and the report stays anonymous: the browser sends it without the sign-in token, and the API route does not read a session. Nothing links a report to an account, so a staff member who sends one has no more access to it than any visitor.
11. Closing a case (Resolved or Dismissed) is final and closes its attached reports. Notes are append-only and can be added to a closed case.
12. Add (with a temporary password), suspend, reactivate and remove PACC accounts. Nobody can act on their own account, the last active PACC account cannot be suspended or removed, and an account with case records cannot be removed (suspend it instead).

Other limits enforced by the API:
- An admin cannot change their own role, or deactivate, suspend, decline or delete their own account.
- The last active admin cannot be suspended or deleted.
- An account with any records (projects, reports, photos, findings, log entries…) cannot be deleted; it must be
  suspended instead, so the history stays intact.
- A profile photo can only be uploaded by an approved account (`requireApproved` on `POST /me/avatar`).
- An auditor's flag decision cannot be lowered by the automatic evaluation. When the automatic flag changes, the
  shown flag becomes the worse of the new automatic flag and the auditor's decision (`projects.reviewed_flag`),
  and goes back to "pending" for another review. Personnel therefore cannot clear a reviewed flag by editing the
  project, for example by setting it to Suspended and back.
- Uploaded photos are checked by their actual bytes: only real JPEG, PNG or WebP files reach the image decoder.
- **Rate limits** (HTTP 429 "Too many requests, please slow down."):

  | Limit | Applies to | Counted per |
  |---|---|---|
  | 600 requests per minute | every `/api` request, before sign-in is checked | IP address |
  | 300 requests per minute | every `/api` request | signed-in account (IP address if not signed in) |
  | 20 per 10 minutes | requests that can carry a file: 360° photo and document uploads, profile photos, flag reviews, and creating or editing audit findings | signed-in account |
  | 30 per 10 minutes | report downloads (`/reports/*`) | signed-in account |
  | 3 per day | anonymous citizen reports (`POST /public/projects/:id/reports`); failed attempts don't count | connection: an anonymous key, not the account† |
  | 1 per project per day | the same citizen reports, per project; failed attempts don't count | connection and project† |
  | 20 per hour | report status checks (`GET /public/reports/:code`); failed checks count too | connection† |

  The IP address is only correct when `TRUST_PROXY` matches the number of proxies in front of the API (see the
  root README, "Upgrading to this version").

  † The citizen-report limits have their own messages: "Too many reports from this connection today. Please try
  again tomorrow." and "Too many checks. Please try again later." They are counted per **anonymous key**: an HMAC
  of the IP address under a random secret that exists only in the server's memory and changes every day (Asia/Manila).
  The key ignores sign-in, so a signed-in visitor is counted like anyone else. The IP and the key are never stored or
  logged; the counters reset at every restart or deploy (`middleware/anonymousLimits.js`).

## Registration and approval

**Who can register:** anyone can open the Register page, but it only asks for staff access, as **DPWH Personnel**
or **Auditor**. Nobody can register as an admin or as PACC. Browsing the portal, and reporting a problem, needs no
account.

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
| | Upload a profile photo (a photo chosen at sign-up stays on the device until approval) |

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

PACC accounts are suspended and reactivated the same way, but only by another PACC member (PACC Members page); the
System Administrator cannot. A suspended PACC account is told to ask another PACC member to lift the suspension.

## How access is enforced

There are three layers. Only the last two actually protect data.

### 1. Frontend route guards (convenience only)
`client/src/routes/ProtectedRoute.jsx` and `App.jsx`:
- `/app/**`: signed-in staff (admin, DPWH personnel, auditor). Others go to `/login`, or to `/` if they have no role.
- `/app/projects/new` and `/app/projects/:id/edit`: admin and DPWH personnel.
- `/app/activity`: admin and auditor.
- `/app/users` and `/app/settings`: admin.
- `/pacc/**`: PACC accounts only. A PACC account opening `/app` is sent to `/pacc`, and staff opening `/pacc` are
  sent to `/app`.
- `/report-status` (Check a report) is public, like the rest of the portal.
- The sidebar shows only the items for the user's role, and buttons such as Edit, Delete or Review are hidden from
  roles that may not use them.

These only decide what is shown. Anyone can change the code running in their own browser, so they are not security.

### 2. API checks (the real enforcement point for every write)
`server/src/middleware/auth.js` and `role.js`, applied in each route file:
- `authenticate` checks the sign-in token with Supabase Auth on every request and loads the profile. An
  inactive account gets 403.
- `requireAuth` refuses requests without a valid sign-in (401).
- `requireRole(...)` refuses accounts that are not approved, or whose role is not in the list (403).
- `requireApproved` refuses accounts that are not approved (403); used where any approved account may act, such
  as uploading a profile photo.
- `requireWriteAccess` refuses writes when the server has no service-role key (503).
- Every `/api/pacc` route uses `requireRole('pacc')`. The Admin is **not** added to these guards.
- The two anonymous citizen-report routes (`POST /public/projects/:id/reports`, `GET /public/reports/:code`) are
  mounted before sign-in is checked, so they never read a session, and they write nothing to any log.
- Rate limiters (`middleware/rateLimits.js`) refuse too many requests (429); see the table under
  "Other limits enforced by the API" above.
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
| Citizen reports and their proof (`citizen_reports`, `citizen_report_files`) | RLS (`is_pacc()`: PACC only; anon has no grant) and the API role check (`requireRole('pacc')`) | Sending: API only (format check, metadata stripped, rate limits). Closing: API role check (PACC) |
| PACC cases, notes and documents (`pacc_cases`, `pacc_case_notes`, `pacc_case_documents`) | RLS (`is_pacc()`: PACC only) and the API role check (`requireRole('pacc')`) | API role check (PACC) + controller rules; notes append-only; closed cases final |
| PACC activity log (`pacc_activity`) | RLS (`is_pacc()`: PACC only) and the API role check (`requireRole('pacc')`) | API only; append-only trigger in the database |
| Buckets `citizen-reports` and `pacc-case-documents` | API only (private, no storage policies); signed links are made only by `/api/pacc` routes | API only |
| PACC case status on the portal (`projects.pacc_public_status`) | anon column grant on that one column, through `v_public_projects` | Database trigger on `pacc_cases` only (never written directly) |
| Citizen report status by tracking code | API only: looked up by the code's keyed hash (rate-limited) | — |
| PACC accounts | API role check (PACC; refused to the Admin) | API role check (PACC) + controller rules (not own account, not the last active one) |
| Project ID | — | Database trigger (assigned on insert, cannot be changed) |
| Lookup lists (municipalities, barangays, offices) | Open to everyone by design | API role check (admin, for offices) |
