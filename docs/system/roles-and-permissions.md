# Roles and permissions

Who can use the system, what each person may do, and where those rules are enforced. For the tables mentioned
here see [database.md](database.md); for what each feature does see [features.md](features.md).

## Roles

The database has five roles (enum `user_role`). Two more kinds of user have no role at all.

| Who | Role value | What it is for |
|---|---|---|
| **System Administrator** | `admin` | Runs the system: approves access requests and manages accounts, offices and the automatic flag rules. Can also do everything auditors do. Views all project data but does **not** create or edit it (migration 027): only DPWH Personnel do. Deletes wrong records (projects, 360° photos, financial records, documents) and approves or declines DPWH Personnel's requests to delete a project. Sees whether a project has an open PACC case (status only). Cannot see or manage PACC accounts, and cannot read citizen reports, PACC cases or the PACC activity log |
| **DPWH Personnel** | `dpwh_personnel` | Keeps the project records up to date: registers and edits projects, registers contractors, sets up phases, reports progress, records payments, uploads 360° photos and documents, and reports on the corrective actions assigned to them. The only role that creates or edits project data (027). Deletes a project only with the System Administrator's approval |
| **Auditor** | `auditor` | Checks the work: reviews automatic flags (confirm or override), records audit findings, verifies a Completed project's completion (030, with PACC), accepts or returns finance receipts (031, the only role that does), and reads the activity log. Photos are public as soon as they are uploaded, so nobody approves them. Read-only for project data |
| **PACC** | `pacc` | Presidential Anti-Corruption Commission (migration 023). Receives projects with an auditor-confirmed Red flag and anonymous citizen reports, investigates, and records cases. Verifies a Completed project's completion (030, with the Auditor). Read-only for project data. Uses the PACC portal (`/pacc`), not the staff workspace. Manages its own accounts |
| **Contractor** | `contractor` | A contractor company's representative (migrations 028, 029). The account is linked to **one** company (`profiles.contractor_id`, required); a company can have several accounts. Sees **only its own company's projects**, and on them submits progress reports and uploads 360° photos, with the same checks as DPWH Personnel, and uploads receipts for disbursements and expenses (031). Views the project's phases, finance (what DPWH obligated and disbursed), flags with their reasons and auditor decisions, findings and documents, read only. Never sees PACC data, other companies' projects or any staff page. Not staff¹⁵ |
| Public visitor | none (no account) | Browses the public portal, reports a problem on a project to PACC (anonymously, with photo proof) and checks a report's status with its tracking code. Needs no account |
| Applicant (pending or declined) | none (`role` is empty) | Has registered and is waiting for approval, or was declined. Sees only what a public visitor sees |

There is no "public" user role any more: migration 017 removed it, because the portal needs no account.

`pacc` is not a staff role: it is not in the database's `is_staff()` or the API's `STAFF` list, so a PACC account
cannot open `/app` or call any staff route. Neither is `contractor` (029): a contractor account reaches only the
project routes listed under `PROJECT_VIEWERS` (and writes progress and photos through `PROJECT_REPORTERS`), and RLS
lets it read only its own company's projects (`private.contractor_company()`). The other way round, the System Administrator **cannot see or manage
PACC accounts**: User Management does not list them, and the API refuses to create an account with the PACC role or
to approve, decline, edit, suspend, reactivate or delete a PACC account ("PACC accounts are managed by PACC.").

## Permission matrix

**V** = view · **C** = create · **E** = edit · **D** = delete · **—** = no access.
"Staff", PACC and Contractor columns assume an active, approved account (for Contractor, also an active company). Rules are taken from the API routes (`server/src/routes/`),
which are the real enforcement point for every write.

| Feature or record | Admin | DPWH Personnel | Auditor | PACC | Contractor | Public visitor / applicant |
|---|---|---|---|---|---|---|
| Public portal (dashboard, projects, map, public 360° photos) | V | V | V | V | V | V |
| Projects | V D | V C E⁷ D¹³ | V | V⁸ | V¹⁵ | V (public fields only) |
| Project starting status at registration (Automatic, Not started, On-going) | — | C | — | — | — | — |
| Project deletion requests: ask with a reason, cancel while pending | — | C E¹³ | — | — | — | — |
| Project deletion requests: list, approve or decline | V E¹³ | V (the project's latest request, on the project page) | V (the project's latest request, API only) | — | — | — |
| PACC case status on the staff project page and project list (status only) | V¹⁴ | V¹⁴ | V¹⁴ | V (the case itself) | —¹⁵ | — |
| Construction phases (plan), with their sub-activities (030) | V | V C E D¹ ¹⁶ | V | V⁸ | V¹⁵ | — |
| Progress reports (description and 1–5 reference photos required, 030) | V | V C¹⁶ | V | V⁸ | V C¹⁵ ¹⁶ | — (only the overall %) |
| Progress report reference photos (030) | V | V C | V | V⁸ | V C¹⁵ | — |
| Completion verification: verify or "Not yet" (030) | V | V | V C¹⁶ | V C¹⁶ | V¹⁵ ¹⁶ | — (only the label "Completed – awaiting verification" / "Completed – verified") |
| Financial records | V D | V C | V | V⁸ | V¹⁵ | — (only the contract amount; since 031 also the liquidation summary¹⁷) |
| Finance receipts of disbursements and expenses (031) | V D¹⁷ | V C D¹⁷ | V | V (RLS)¹⁷ | V C D¹⁵ ¹⁷ | V (accepted receipts only)¹⁷ |
| Finance receipts: accept, or return with a reason (031) | — | — | C¹⁷ | — | — | — |
| 360° photos: upload, caption, mark final | V | V C E¹⁶ | V | V⁸ | V C¹⁵ (upload only) ¹⁶ | — |
| 360° photos on the public portal | V | V | V | V | V | V (every photo, as soon as it is uploaded; no approval step) |
| 360° photos: delete | D¹⁶ | — | — | — | — | — |
| Project documents | V D² | V C D² | V | V⁸ | V¹⁵ | — |
| Automatic flags and flag history | V | V | V | V | V¹⁵ | — (only the flag an auditor confirmed or overrode; "Under review" before that) |
| Flag review (confirm / override) | C | — | C | — (reads the decisions) | — (reads the decisions¹⁵) | — |
| Re-check all flags now | C | — | — | — | — | — |
| Audit findings | V C E | V | V C E | V | V¹⁵ | — |
| Corrective action on a finding | E | E³ | E | — | — | — |
| Finding "show to public" switch | E | — | E | — | — | — (not shown anywhere publicly) |
| Project map (staff, with flags) | V | V | V | — | — | — |
| Dashboards and charts | V | V | V | — | — | — |
| Reports (PDF, Excel, CSV) | V | V | V | — | — | — |
| Contractors | V C E D⁴ | V C E (incl. suspend) | V | V (to name a respondent) | —¹⁵ | — (only names, on projects) |
| Offices and agencies | V C E D⁵ | V | V | V (lists only) | V (lists only) | V (lists only) |
| User accounts and access requests | V C E D (approve, decline, suspend), except PACC accounts⁹ | — | — | — | — | — |
| Own account (name, position, photo after approval, password) | V E | V E | V E | V E | V E | E (applicants only) |
| Activity logs | V | — | V | V⁸ (entries tied to a project only) | — | — |
| Flag rules (System Settings) | V E | V⁶ | V⁶ | — | — | — |
| Citizen reports: send, anonymously, with 1–3 proof photos ("Magsumbong") | C¹⁰ | C¹⁰ | C¹⁰ | C¹⁰ | C¹⁰ | C |
| Citizen report status by tracking code (Received / Under review / Closed, and the date) | V¹⁰ | V¹⁰ | V¹⁰ | V¹⁰ | V¹⁰ | V |
| Citizen reports and their proof photos: read, close with an outcome | — | — | — | V E | — | — |
| PACC cases (respondents, charges, status, notes, documents) | — | — | — | V C E¹¹ | — | — |
| PACC case status on the public project drawer | V | V | V | V E (the "show status to public" switch) | V | V (only "Under PACC investigation" or "Case filed", when switched on) |
| PACC activity log | — | — | — | V | — | — |
| PACC accounts (PACC Members page) | — | — | — | V C E D¹² | — | — |

1. Phases can be removed by saving a new plan, but not a phase that already has reported work.
2. Personnel may delete only documents they uploaded. Admins may delete any.
3. Only the person the finding is assigned to. A finding the auditor has closed cannot be changed.
4. A contractor still assigned to a project cannot be deleted; suspend it instead.
5. An office used by any project or user account cannot be deleted.
6. The API lets every staff role read the rules, but the System Settings page is shown to admins only.
7. Nobody can change a project's location once 360° photos have been uploaded for it, the System Administrator included (027; before, the Admin could). The API answers 403 "The project location cannot be changed once 360° photos are on file." To fix a wrong location, the System Administrator deletes the project's 360° photos, then DPWH Personnel edit the location (and upload the photos again). A location change is recorded in the activity log with the old and new coordinates.
8. PACC reads project data only, never writes it. The PACC investigation page (`GET /pacc/projects/:id`) shows the project summary, the flag and its history, auditor decisions and findings, and, read-only, the construction phases, the 50 most recent progress reports, the financial records with a summary, the 360° photos (opened full size in a new tab) and the supporting documents (one-hour links). It reads them as the PACC account, through the "… pacc read" RLS policies of migration 024; only the file links are signed by the server. RLS also lets a PACC account read the activity-log entries tied to a project, as an Auditor can. PACC cannot use `/app` or any staff route.
9. PACC accounts are not listed in User Management, and the API refuses every action on them (see [Roles](#roles)).
10. Anyone can report, signed in or not, and the report stays anonymous: the browser sends it without the sign-in token, and the API route does not read a session. Nothing links a report to an account, so a staff member who sends one has no more access to it than any visitor.
11. Closing a case (Resolved or Dismissed) is final and closes its attached reports. Notes are append-only and can be added to a closed case.
12. Add (with a temporary password), suspend, reactivate and remove PACC accounts. Nobody can act on their own account, the last active PACC account cannot be suspended or removed, and an account with case records cannot be removed (suspend it instead).
13. Project deletion by approval (027). DPWH Personnel ask with a reason (10–500 characters); a project has at most one open request (pending, or approved and unused), otherwise 409 "This project already has an open deletion request." The requester can cancel a pending request. The System Administrator approves or declines a pending request, with an optional note (at most 500 characters). An approval is valid for **7 days**, can be used **once**, and only by the **requesting** Personnel account; an expired one is shown as expired and a new request can then be made. Any other Personnel delete (no request, someone else's approval, pending, declined, expired or used) gets 403 "Ask a System Administrator to approve deleting this project first." The Admin deletes directly, and any open request on the project is then closed. Every step (request, cancel, approve, decline, delete) is in the activity log.
14. The staff-visible PACC case status (027; since 029 in the table `project_pacc_status`, shown as `v_project_summary.pacc_case_status`): "Under PACC investigation" or "Case filed" while the project has a non-closed PACC case, **whether or not** PACC shows it on the public portal; nothing about the case itself (respondents, charges, reports, notes). It is a chip on the staff project page and project list, and a warning in the delete, request-deletion and approve dialogs ("This project is under PACC investigation. Deleting it removes records PACC may need."). Deleting stays allowed; when a non-closed case exists, the API first writes one `pacc_activity` entry (actor "System") naming who deleted the project (name and role), and the case survives. The public still sees only what PACC's "show status to public" switch allows (`pacc_public_status`). Accepted risk: investigated personnel learn of an open case as soon as it is opened.
15. Contractor accounts (029), **own company's projects only**: the projects whose `contractor_id` is the account's company. Another company's project is not listed, and its pages come back empty or not found (404), through RLS (`private.contractor_company()`); and the API answers 403 "You can only update your company's projects." to a progress report or photo upload on it. Allowed API routes (`PROJECT_VIEWERS`): `GET /projects`, `/projects/:id`, `/projects/:id/phases`, `/progress`, `/images`, `/finance`, `/documents`, `/flags`, `/findings`, `/completion-verification` (030); writes (`PROJECT_REPORTERS`, with `requireOwnProject`): `POST /projects/:id/progress`, `POST /projects/:id/images` and, since 031, `POST /projects/:id/finance/:recordId/receipts` (receipts of disbursements and expenses; deleting its own receipts that are not accepted, `DELETE /finance/receipts/:receiptId`, footnote 17), the same validations as DPWH Personnel except that **completion stays with DPWH Personnel**: a contractor's progress report cannot carry an actual completion date and its upload cannot be marked final as-built (403 "Only DPWH Personnel can confirm a project's completion."); changing a photo's caption or final mark later is Personnel only too. Every other route answers 403: project create / edit / delete, phase plan, finance records, documents upload, flag review, findings and corrective actions, map, dashboards, reports, contractors, offices, users, settings, activity logs and deletion requests. A contractor never sees the PACC case status: it is in `project_pacc_status`, which RLS lets only staff and PACC read, so `v_project_summary.pacc_case_status` is empty for a contractor even when queried directly with its own token, and the API also removes every `pacc_*` field from the project rows it sends to a contractor. Names of the staff on records (who reported, uploaded, reviewed) are added by the API, since a contractor reads only its own profile. A photo's validation details sent to a contractor leave out the ids of other projects holding the same or a near-identical photo (`reused_in_projects`, `near_duplicate_in_projects`); the warnings still say such a photo was found. When the account is pending, suspended or deactivated, or its company is inactive, the contractor sees **nothing** (not even read-only: RLS returns no rows, the API answers empty lists or 404) and writes are refused. Every contractor action is in the activity log with role `contractor`. Progress rules (030): a contractor's report has the same description and reference photos as Personnel's and sets sub-activity values, but a contractor cannot define sub-activities (the phase plan is Personnel only) and cannot verify a completion; it reads the completion-verification state and history of its own projects (`GET /projects/:id/completion-verification`, RLS "verifications: contractor read"), where a PACC decision never names the PACC member (stored as `PACC`, with no account; the member is recorded in the PACC activity log only); that answer never carries a field about a PACC case (`pacc_case_open`, `awaiting_pacc_case`, `message` are stripped, `stateForViewer`), and the card shows a contractor only "Both sides verified; the verification is being finalised." while the project waits for a case to close.
16. Progress rules (030). **Sub-activities**: DPWH Personnel define them per phase in the phase plan (name, weight; the weights of a phase add up to 100, else 400 "Sub-activity weights in a phase must add up to 100."); a phase with sub-activities takes its % from them and cannot be set directly. **Reports**: every new progress report needs a description (10–2000 characters) and 1–5 reference photos (JPEG / PNG / WebP, at most 10 MB each, actual bytes checked; else 400 "Attach 1 to 5 reference photos."), stored in the private `progress-photos` bucket and shown to staff, PACC and the project's contractor through one-hour signed links. **99 % until verified**: when the completion rule is met (all phases 100 %, actual completion date, final as-built photo) the project becomes Completed, but its overall progress stays at most 99 % ("Completed – awaiting verification") everywhere, the public portal and the PDF / Excel reports included. **Verification**: the Auditor (`POST /projects/:id/completion-verification`, Auditor only; not the Admin) and PACC (`POST /pacc/projects/:id/completion-verification`) each verify, in either order, or record "Not yet" with a reason (5–500 characters). Only a Completed project can be verified (409 "Only a completed project can be verified."); PACC cannot verify while the project has an open PACC case (409 "Close the PACC case before verifying completion."; "Not yet" stays allowed). A decision counts only when made after the project last became Completed (`projects.completed_at`); if the project leaves Completed, earlier decisions no longer count. When both current decisions are "verified", `projects.completion_verified_at` is set and the progress becomes 100 % ("Completed – verified"), but never while the project has an open PACC case, whoever decided last: the decision is then recorded ("Recorded. The project becomes verified once its PACC case is closed.") and the project becomes verified when PACC closes the case. The re-evaluation caused by a PACC decision or a case close names no actor in the flag history. Auditor decisions are in the activity log, PACC decisions in the PACC activity log (the only place that names the PACC member: the verification history shows "PACC"), and the moment of verification also gets a neutral activity-log line "Completion verified". A Completed project awaiting verification has 0 slippage everywhere (99 % against a plan of 100 % is not "behind schedule"). The history is append-only. **Lock**: once verified, progress reports, phase plan changes, 360° photo upload, caption, final mark and delete, and changing the actual completion date are refused with 409 "This project's completion was verified; its progress and photos can no longer change." (`requireUnlockedProject`, checked again in the controllers). Finance records and documents stay allowed.
17. Finance liquidation (031). **Receipts** are needed for disbursements and expenses only (400 "Receipts can only be added to disbursements and expenses." on an obligation or variation order; their papers go in Documents). One record can have several receipts: a file (PDF, JPEG, PNG or WebP, at most 15 MB, actual bytes checked; else 400 "Attach a PDF, JPEG, PNG or WebP file."), an amount (> 0), the receipt date (not in the future) and a short description (at most 500 characters), stored in the private `finance-receipts` bucket. **Upload** (`POST /projects/:id/finance/:recordId/receipts`): DPWH Personnel on any project, a contractor on its own active company's projects (`requireOwnProject`, before the file is read). The upload dialog reminds the uploader to cover personal information (names of private persons, TIN, home addresses), because accepted receipts are shown to the public. **Review** (`POST /finance/receipts/:receiptId/accept`, `/return` with `{ note }`): the Auditor only, not the Admin (independence, as for completion verification); everyone else gets 403 "Only the Auditor can accept or return receipts.". A return needs a reason (400 "Give a reason (5–500 characters) for returning this receipt."). Only a submitted receipt can be decided (409); an accepted receipt is final. **Delete** (`DELETE /finance/receipts/:receiptId`): the uploader while the receipt is submitted or returned, the Admin any receipt that is not accepted; an accepted receipt is never deleted on its own (409 "An accepted receipt cannot be deleted.", also refused by the database trigger); it goes only when the Admin deletes the financial record or the project. A returned receipt is replaced by uploading a new one. **Liquidation**: only accepted receipts count; a record's liquidated amount is capped at its amount (with "over-liquidated by"), the unliquidated amount is never below 0. **Reads**: staff, PACC and the project's contractor read the receipts (RLS); a signed-in page gets one-hour links. **Public**: `GET /public/projects/:id/liquidation` (no sign-in, public projects only) returns the summary and the accepted receipts (record type, amount, date, description, file type and a 10-minute link), computed by the API with the service role, without file names, storage paths, notes, the counts of receipts awaiting review or returned, or anyone's identity; anon has no access to the table. Finance is not locked by completion verification. Every upload, accept, return and delete is in the activity log (role `contractor` for contractors).

Other limits enforced by the API:
- An admin cannot change their own role, or deactivate, suspend, decline or delete their own account.
- The last active admin cannot be suspended or deleted.
- An account with any records (projects, reports, photos, findings, log entries…) cannot be deleted; it must be
  suspended instead, so the history stays intact.
- A profile photo can only be uploaded by an approved account (`requireApproved` on `POST /me/avatar`).
- A contractor account always has a company (029): creating, approving or editing an account with the Contractor
  role without one gets 400 "Choose the contractor company for this account.", and the company must exist.
  Leaving the Contractor role clears the company. A contractor company with accounts cannot be deleted (409).
- An auditor's flag decision cannot be lowered by the automatic evaluation. When the automatic flag changes, the
  shown flag becomes the worse of the new automatic flag and the auditor's decision (`projects.reviewed_flag`),
  and goes back to "pending" for another review. Personnel therefore cannot clear a reviewed flag by editing the
  project (status is automatic and cannot be set by hand).
- Uploaded photos are checked by their actual bytes: only real JPEG, PNG or WebP files reach the image decoder.
- **Rate limits** (HTTP 429 "Too many requests, please slow down."):

  | Limit | Applies to | Counted per |
  |---|---|---|
  | 600 requests per minute | every `/api` request, before sign-in is checked | IP address |
  | 300 requests per minute | every `/api` request | signed-in account (IP address if not signed in) |
  | 20 per 10 minutes | requests that can carry a file: 360° photo and document uploads, progress reports (030: they carry reference photos), finance receipts (031), profile photos, flag reviews, and creating or editing audit findings | signed-in account |
  | 30 per 10 minutes | report downloads (`/reports/*`) | signed-in account |
  | 3 per day | anonymous citizen reports (`POST /public/projects/:id/reports`); failed attempts don't count | connection: an anonymous key, not the account† |
  | 1 per project per day | the same citizen reports, per project; failed attempts don't count | connection and project† |
  | 20 per hour | report status checks (`POST /public/reports/status`, code in the body); failed checks count too | connection† |

  The IP address is only correct when `TRUST_PROXY` matches the number of proxies in front of the API (see the
  root README, "Upgrading to this version").

  † The citizen-report limits have their own messages: "Too many reports from this connection today. Please try
  again tomorrow." and "Too many checks. Please try again later." They are counted per **anonymous key**: an HMAC
  of the IP address (an IPv6 address by its /64 prefix, since one home or phone usually gets a whole /64) under a
  random secret that exists only in the server's memory and changes every day (Asia/Manila).
  The key ignores sign-in, so a signed-in visitor is counted like anyone else. The IP and the key are never stored or
  logged; the counters reset at every restart or deploy (`middleware/anonymousLimits.js`).

## Registration and approval

**Who can register:** anyone can open the Register page, but it only asks for access as **DPWH Personnel**,
**Auditor** or (029) **Contractor representative**, with the company (chosen from the list of active companies,
`GET /reference/contractors`) and its PCAB licence number. Nobody can register as an admin or as PACC. Browsing the portal, and reporting a problem, needs no
account.

**What happens on sign-up** (database trigger `handle_new_user`):
- The account is created with **no role**.
- The requested role, office and position are saved on the profile; for a contractor request also the company
  (`requested_contractor_id`) and the typed licence (`requested_contractor_license`, at most 50 characters).
- `approval_status` becomes `pending`. If no valid role was requested, it becomes `rejected` instead; so does a
  contractor request whose company does not exist (note: "The contractor company was not found. Choose your
  company again.").

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
  `approval_status` becomes `approved` and the account becomes active. Approving as Contractor uses the company
  asked for at sign-up unless the admin chooses another; User Management shows the requested company, the typed
  licence and whether it matches the company's PCAB licence (ignoring case and spaces).
- **Decline** — with an optional note. `approval_status` becomes `rejected`; the role stays empty.

An admin can also create a staff or contractor account directly (a contractor account with its company). That
account is approved at once. Contractor accounts are suspended, reactivated and deleted like staff accounts.

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
- `/app/**`: signed-in staff (admin, DPWH personnel, auditor) and contractor accounts (029). Others go to `/login`,
  or to `/` if they have no role.
- Contractor accounts (029): only `/app` (their own dashboard), `/app/projects`, the project page and its six tabs,
  and `/app/account`. Any other `/app` page, including ones added later, sends them to `/app`
  (`lib/contractor.js` `canOpenWorkspacePath`, checked by `ProtectedRoute`); the staff pages are also inside a
  staff-only route. On the project page they see "Submit progress update" and "Upload 360° image" only: no phase
  plan, finance, documents, review, findings or delete buttons, no completion date or final as-built mark, no PACC
  case chip and no audit-report PDF (`projectPermissions`).
- `/app/projects/new` and `/app/projects/:id/edit`: DPWH personnel only (027).
- `/app/activity`: admin and auditor.
- `/app/users`, `/app/deletion-requests` and `/app/settings`: admin.
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
- Contractor accounts (029): the project read routes use `requireRole(PROJECT_VIEWERS)` (staff + contractor), and
  progress reports and photo uploads use `requireRole(PROJECT_REPORTERS)` (DPWH Personnel + contractor) followed by
  `requireOwnProject`, which, for a contractor, loads the project's company and refuses (403 "You can only update
  your company's projects.") unless it is the account's company and that company is active, before any upload is
  read. `STAFF` is unchanged.
- Finance receipts (031): upload uses `requireRole(PROJECT_REPORTERS)`, `uploadLimiter`, `requireOwnProject` and only
  then the file; accept / return refuse every role but the Auditor with "Only the Auditor can accept or return
  receipts." (`assertCanReviewReceipt`); delete reaches the controller for the Admin, DPWH Personnel and contractors,
  which applies the uploader / not-accepted rule (`services/liquidation.js`). The status update and the delete are
  conditional (`status = 'submitted'`, `status <> 'accepted'`), and the database trigger refuses them too.
- Verified projects (030): `requireUnlockedProject` refuses (409) progress reports, phase plan changes and 360°
  photo upload, caption / final mark and delete once `projects.completion_verified_at` is set; on the progress and
  photo uploads it runs after `requireOwnProject` and before the files are read.
- The two anonymous citizen-report routes (`POST /public/projects/:id/reports`, `POST /public/reports/status`) are
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
| A contractor's own company's project data (029) | RLS (`contractor_company()`: own company's projects only) and the API role check (`PROJECT_VIEWERS`); the PACC case status is not readable (own table) and the API also strips it | Progress reports and photo uploads only: API role check (`PROJECT_REPORTERS`) + `requireOwnProject` (own active company) + the same controller rules as Personnel |
| Project deletion requests (`project_deletion_requests`) | RLS (`is_staff()`; anon has no grant) and the API role check | API role check (ask / cancel: Personnel; approve / decline: Admin) + controller rules; one open request per project (partial unique index) |
| PACC case status for staff (`project_pacc_status`, 029; was `projects.pacc_case_status`) | RLS (staff and PACC; no contractor policy), read through `v_project_summary`; anon has no grant | Database trigger on `pacc_cases` only (never written directly) |
| Activity logs | RLS (admin, auditor) and the API role check | API only; append-only trigger in the database |
| Flag history and reviews | RLS (staff) | API only; append-only trigger; CHECK rules (evidence required to override) |
| User list, access requests, "assign to" list | **API role check only** (these reads use the service role) | API role check (admin) |
| Profiles read directly with a token | RLS (own profile, or staff) | API only |
| A contractor account's company (`profiles.contractor_id`) | RLS (own profile) | API role check (admin); database CHECK `profiles_contractor_has_company` |
| Files in Storage | API only (private buckets, no storage policies, expiring signed links) | API only |
| Citizen reports and their proof (`citizen_reports`, `citizen_report_files`) | RLS (`is_pacc()`: PACC only; anon has no grant) and the API role check (`requireRole('pacc')`) | Sending: API only (format check, metadata stripped, rate limits). Closing: API role check (PACC) |
| PACC cases, notes and documents (`pacc_cases`, `pacc_case_notes`, `pacc_case_documents`) | RLS (`is_pacc()`: PACC only) and the API role check (`requireRole('pacc')`) | API role check (PACC) + controller rules; notes append-only; closed cases final |
| PACC activity log (`pacc_activity`) | RLS (`is_pacc()`: PACC only) and the API role check (`requireRole('pacc')`) | API only; append-only trigger in the database |
| Buckets `citizen-reports` and `pacc-case-documents` | API only (private, no storage policies); signed links are made only by `/api/pacc` routes | API only |
| PACC case status on the portal (`projects.pacc_public_status`) | anon column grant on that one column, through `v_public_projects` | Database trigger on `pacc_cases` only (never written directly) |
| Sub-activities, progress report photos and completion verifications (`phase_activities`, `progress_photos`, `completion_verifications`, 030) | RLS (staff, PACC, and the contractor of the project; anon has no grant) and the API role check; photo files through signed links only | API only. Sub-activities: Personnel (phase plan); photos: the report's author (Personnel or the own-company contractor); verifications: Auditor or PACC, append-only trigger |
| Finance receipts (`finance_receipts`, 031) and the `finance-receipts` bucket | RLS (staff, PACC, and the contractor of the project; anon has no grant) and the API role check; files through signed links only. The public gets only the liquidation summary and accepted receipts, from the API (service role, safe fields only) | API only. Upload: Personnel or the own-company contractor (`requireOwnProject`); accept / return: Auditor; delete: uploader or Admin, never an accepted one. Database trigger: disbursements / expenses of the same project only, submitted → accepted / returned only, accepted rows never changed or deleted except by cascade |
| Verified label on the portal (`projects.completion_verified_at`, 030) | anon column grant on that one column, through `v_public_projects` | API only (set when both the Auditor and PACC verified) |
| Citizen report status by tracking code | API only: looked up by the code's keyed hash (rate-limited) | — |
| PACC accounts | API role check (PACC; refused to the Admin) | API role check (PACC) + controller rules (not own account, not the last active one) |
| Project ID | — | Database trigger (assigned on insert, cannot be changed) |
| Lookup lists (municipalities, barangays, offices) | Open to everyone by design | API role check (admin, for offices) |
