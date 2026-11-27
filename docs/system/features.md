# Features

Every feature of IPMATS (InfraWatch PH), page by page. Each entry says what it is called in the app, why it exists,
who uses it, what it does, and what it touches. API routes are relative to `/api`.

- Exact rights per role: [roles-and-permissions.md](roles-and-permissions.md)
- Tables and columns: [database.md](database.md)
- Step-by-step flows: [workflows.md](workflows.md)

The app has three parts:
- **Public portal** (`/`, `/projects`, `/map`, `/report-status`): open to everyone, no account. Top navigation bar.
- **Staff workspace** (`/app/...`): for signed-in, approved Admins, DPWH Personnel and Auditors. Left sidebar.
- **PACC portal** (`/pacc/...`): for signed-in PACC accounts only (Presidential Anti-Corruption Commission). Left
  sidebar, the same look as the staff workspace. See [PACC portal](#pacc-portal) below.

---

## Public portal

The portal exists for transparency: anyone can see where DPWH projects in Occidental Mindoro are, who builds them,
what they cost and how far along they are, without signing in. It shows only public fields. A project's flag is
shown only after an auditor has confirmed or overridden it ("Under review" before that). The automatic flag and its
reasons, audit findings, finances, phases, progress reports and logs are never sent to it (enforced by the database, see
[roles-and-permissions](roles-and-permissions.md#3-row-level-security-the-real-enforcement-point-for-reads)).

Accounts waiting for approval, or declined, see the same portal with a status banner at the top.

Anyone can also report a problem on a project to PACC, anonymously and with photo proof
([Magsumbong](#magsumbong--report-a-problem)), and later check the report's status with a tracking code
([Check a report](#check-a-report)). Reports, their counts and their contents are never shown on the portal.

### Dashboard (public landing page)
- **In the UI:** "Dashboard" in the top bar; page at `/`.
- **Why:** gives a visitor the whole picture on one page.
- **Who:** everyone.
- **What it does:**
  - **Search box:** a name or municipality search that opens the Projects page with the results.
  - **Four counters:** Total projects, On-going, Completed and Delayed.
  - **Project map:** see [Project map](#project-map-public) below.
  - **Project cards:** see [Projects](#projects-public) below. Clicking a card opens the project drawer on the map.
- **Touches:**
  - Page: `pages/public/PortalHome.jsx`.
  - API: `GET /public/stats`, `/public/map`, `/public/projects`, `/public/projects/:id`.
  - Data: view `v_public_projects`, table `site_images` (public rows).

### Projects (public)
- **In the UI:** "Projects"; page at `/projects`.
- **Why:** lets a visitor find a specific project.
- **Who:** everyone.
- **What it does:** a grid of project cards with paging. You can search by name, Project ID, municipality,
  barangay or contractor, and filter by status or municipality. The filters are kept in the address, so a filtered
  list can be shared. Clicking a card opens the Project map with that project selected.
- **Touches:** `pages/public/PublicProjectsPage.jsx`, `components/public/ProjectCardGrid.jsx`;
  `GET /public/projects`; `v_public_projects`.

### Project map (public)
- **In the UI:** "Project Map"; page at `/map` (also embedded on the Dashboard).
- **Why:** shows where the money is being spent, on a map of the province.
- **Who:** everyone.
- **What it does:**
  - **Map:** an OpenStreetMap map with one pin per project, coloured by the **auditor-reviewed flag** (Green,
    Yellow, Red), or gray "Under review" while no auditor has reviewed the current flag, and a colour legend. The
    flag comes from `projects.public_flag` (migration 021); the unreviewed automatic flag never reaches the portal.
    The project cards and the drawer show the same flag next to the status.
  - **Project drawer:** clicking a pin opens a drawer over the map (a bottom sheet on phones). The map stays
    usable, the selected pin is highlighted, and the map centres on it. The drawer shows:
    - Project ID and type, and the title.
    - The 360° viewer, or a slim "No 360° photo published yet" line.
    - Status and physical progress, with start and target dates.
    - Contract cost.
    - Location, office and contractor.
    - **PACC case status**, only when PACC switched "show status to public" on for the project's open case:
      "Under PACC investigation" or "Case filed", next to the status and flag. Nothing else about the case is
      shown (no respondents, charges or report counts), and resolved or dismissed cases show nothing. It appears
      in the drawer only, never on project cards or map pins.
    - A **"Magsumbong / Report a problem"** button (see below).
  - **Closing and sharing:** close with the X, the Escape key, or a click on the map. The open project is kept in
    the address (`?project=<id>`), so it can be linked to. A **recenter** button moves the map back to the project.
  - **Staff link:** signed-in, approved staff also get **View full project**, which opens the staff project page.
- **Touches:**
  - Pages and components: `pages/public/PublicMapPage.jsx`, `components/public/PublicProjectMap.jsx`,
    `ProjectDrawer.jsx`, `components/map/ProjectMap.jsx`, `components/viewer360/PanoramaViewer.jsx`.
  - API: `GET /public/map`, `GET /public/projects/:id`.
  - Data: `v_public_projects` (including `pacc_public_status`, migration 024), `site_images` (every photo; public
    as soon as it is uploaded); files in the `panoramas` bucket through expiring signed links.

### 360° viewer
- **In the UI:** the photo panel in the project drawer (and in the staff pages).
- **Why:** Objective 2 — lets people see the actual site condition, not just a pin.
- **Who:** everyone. Every uploaded photo is public (no approval step).
- **What it does:** shows an equirectangular (2:1) panorama in an interactive viewer (drag to look around, zoom,
  full screen). When a project has several public photos, buttons with the inspection dates switch between them.
- **Touches:** `components/viewer360/PanoramaViewer.jsx` (Pannellum).

### Magsumbong / Report a problem
- **In the UI:** the **"Magsumbong / Report a problem"** button at the bottom of the project drawer (on the
  Dashboard map and the Project Map; a project card opens the map with the drawer, so it works from the Projects
  page too). It opens a dialog.
- **Why:** an independent, anonymous channel for the public to tell PACC about a project that looks wrong.
- **Who:** everyone, with or without an account. The report is anonymous even for a signed-in visitor: the
  browser sends it without the sign-in token (`anonymous: true` in `lib/api.js`), and the API route does not look
  at sign-in at all.
- **What it does:**
  - **Form:** the kind of problem (site doesn't match the photos, substandard materials, overpricing or ghost
    project, work not being done, other), a description (20–2000 characters, with a live counter) and **1 to 3
    proof photos** (JPEG, PNG or WebP, up to 10 MB each, with previews). The browser checks these first; the
    server checks again and its message is the one shown.
  - **Notice:** "No name, account or location is saved. Photo details such as GPS are removed." and that false
    reports may be dismissed.
  - **On the server:** the photos pass the format check, then are re-encoded (orientation applied, first frame
    only, at most 2560 px wide, JPEG) so all EXIF/XMP/IPTC metadata such as GPS, date and camera is dropped. Files
    get random names in the private `citizen-reports` bucket. The report keeps the project, category,
    description, status, the submission **date only** (Asia/Manila, no time) and a keyed hash of the tracking code.
    No IP, user agent, account or session is stored or logged, and nothing goes to the activity log.
  - **Tracking code:** after sending, the dialog shows a 10-character code (`XXXXX-XXXXX`) with a Copy button
    and "Save this code; it is shown only once." Only the Done button closes this screen (Esc, a click outside and
    the corner X do nothing, so the code is not lost by accident), and the "Check a report" link opens in a new tab.
    Closing the dialog discards the code; the browser does not keep it.
  - **Limits:** 3 reports per day per connection and 1 per project per day per connection (HTTP 429 "Too many
    reports from this connection today. Please try again tomorrow."). See
    [roles-and-permissions → rate limits](roles-and-permissions.md#permission-matrix).
  - **Where it goes:** only to PACC ([PACC inbox](#pacc-inbox)). A report never changes the project's
    Green/Yellow/Red flag.
- **Touches:**
  - Components: `components/public/ProjectDrawer.jsx`, `components/public/ReportProblemModal.jsx`, `lib/pacc.js`.
  - API: `POST /public/projects/:id/reports` (multipart: `category`, `description`, `proof` × 1–3).
  - Server code: `routes/publicReports.js`, `controllers/citizenReportsController.js`,
    `services/citizenReports.js`, `middleware/anonymousLimits.js`.
  - Data: `citizen_reports`, `citizen_report_files`, bucket `citizen-reports`.
- **Known limits:** hosting providers (Render, Vercel, Supabase) keep their own request logs with IPs and exact
  times, and Supabase Storage records an exact `created_at` per proof photo. Each photo's record
  (`citizen_report_files.storage_path`) points to its Storage object, so someone with both database access (for
  example the Supabase project owner) and the hosting request logs could match an upload time to a logged request
  and link an IP to a report. IPMATS's own API and the Admin role in the app cannot. IPMATS cannot control the
  providers' logs.

### Check a report
- **In the UI:** "Check a report" link in the portal footer; page at `/report-status`.
- **Why:** a reporter can follow up without identifying themselves.
- **Who:** anyone with a tracking code.
- **What it does:** the visitor types the code (upper or lower case, with or without the dash; the box formats it
  as `XXXXX-XXXXX` and drops characters that cannot be in a code). The page then shows only the status —
  **Received** (PACC has not looked at it yet), **Under review** (PACC opened it or attached it to a case) or
  **Closed** — and the date it was sent. Like the report itself, the check is sent without the sign-in token.
  At most 20 checks per hour per connection, failed ones included (HTTP 429 "Too many checks. Please try again
  later.").
- **Touches:** `pages/public/CheckReportPage.jsx`, `lib/pacc.js` (`formatTrackingCodeInput`);
  `POST /public/reports/status` with the JSON body `{ "code": "…" }` (the code is never in the URL, because hosting
  providers log request paths next to the IP; the answer is never cached); `citizen_reports` (looked up by the
  code's hash).

### Sign in, Register and Awaiting approval
- **In the UI:** "Sign in" (top right), the Register page (`/register`), the Awaiting approval page
  (`/account-pending`).
- **Why:** staff need accounts. Objective 1 asks for secure login and registration.
- **Who:** DPWH personnel and auditors register. Anyone with an account signs in.
- **What it does:**
  - **Register:** asks for name, email, password, the role requested (DPWH Personnel or Auditor), office,
    position, and an optional photo. It creates a request, not a staff account (see
    [registration and approval](roles-and-permissions.md#registration-and-approval)).
    - The photo is kept on the device (IndexedDB) and uploaded at the first sign-in **after the account is
      approved**. Pending and declined accounts cannot upload a profile photo.
  - **Sign in:** shows a 5-second entry screen, then opens the staff dashboard. Accounts without a role go to the
    public portal instead. Suspended accounts see a suspension message.
  - **Awaiting approval:** shows the status of the request, or the reason it was declined.
- **Touches:**
  - Pages: `pages/auth/LoginPage.jsx`, `RegisterPage.jsx`, `AccountPendingPage.jsx`, `context/AuthContext.jsx`.
  - Supabase Auth (sign-up, sign-in), and `GET /me`, `POST /me/avatar`, `GET /reference` (office list).
  - Data: `profiles` (created by the `handle_new_user` trigger), `agencies`, bucket `avatars`.

---

## Staff portal

Sidebar items appear only for the roles that can use them. "All staff" = Admin, DPWH Personnel and Auditor.

### Dashboard
- **In the UI:** "Dashboard" (`/app`).
- **Why:** each role starts the day with what matters to them.
- **Who:** all staff. The heading and shortcut buttons differ per role.
- **What it does:**
  - **Shortcuts per role:**
    - Admin: access requests, flags, map, reports.
    - Personnel: submit progress, map, record disbursements, register a project.
    - Auditor: review flagged projects, map, audit reports, fund utilization.
  - **Counters:** registered projects, average completion, disbursed amount, remaining balance.
  - **Lists:** recently updated projects.
  - **Charts:** flags, status, planned vs actual progress, flags per municipality, contract vs disbursed.
  - **Personnel only:** "Findings assigned to you", where they can report on their corrective actions.
- **Touches:**
  - Pages: `pages/shared/DashboardPage.jsx`, `DashboardCharts.jsx`, `components/audit/AssignedFindings.jsx`.
  - API: `GET /projects/stats`, `/projects`, `/dashboard/performance`, `/dashboard/financial`, `/findings/assigned`.
  - Data: `v_project_summary`, `audit_findings`.

### Project Management
- **In the UI:** "Project Management" (`/app/projects`), "Register project", and the project page with six tabs.
- **Why:** Objective 1 — one central record of every project: office, contractor, budget, duration and location.
- **Who:** all staff view. Only DPWH Personnel register and edit (migration 027). The Admin deletes directly;
  Personnel delete only with an approved [deletion request](#deletion-requests).
- **What it does:**
  - **List:** search by name, Project ID or contractor. Filter by municipality, barangay, office, contractor,
    status and type. Sort, and page through the results.
  - **Register / Edit form:** name, type, office, contractor, contract reference, municipality and barangay,
    location, approved budget (ABC), contract amount, Notice to Proceed, duration, fund source and status.
    - Location is picked on a map: search a place, click, or drag the pin. Points outside Occidental Mindoro are
      refused, in the browser and again by the API.
    - Once a project has 360° photos, nobody can move its location, the System Administrator included (027):
      "The project location cannot be changed once 360° photos are on file." To fix a wrong location, the Admin
      deletes the photos, then Personnel edit the location and upload the photos again. Every location change is
      recorded in the activity log with the old and new coordinates. Saving the form with the same coordinates does
      not count as a move.
    - The **Project ID is created by the database** (e.g. `26OM0332`) and cannot be changed. A dialog shows it
      after saving.
    - The target completion date is computed as NTP + duration.
    - The contract amount cannot exceed the approved budget.
    - The status is **automatic** (Not started, On-going, Delayed, Completed). When registering a project, staff
      may choose Automatic, Not started or On-going as the starting status; the next evaluation (a progress
      report, a photo, or the daily check) recalculates it from the Notice to Proceed and progress. Completed is
      never chosen by hand: it is set once every phase is at 100%, with a completion date and a final as-built
      photo. The Suspended and Terminated statuses were removed (no project used them); editing a project
      cannot set a status.
  - **Project page tabs:** Overview, Phases & progress, Finance, 360° images, Flag & audit, Documents (described
    below). Auditors see a "Read-only" label. The editing buttons of every tab (phases, progress, adding finance
    records, photo upload and mark final, document upload) are shown to Personnel only; the Admin keeps the
    delete buttons.
  - **PACC case status (staff):** while the project has a non-closed PACC case, the project header and the list
    rows show a chip, "Under PACC investigation" or "Case filed" (`pacc_case_status`, 027), whether or not PACC
    shows the status on the public portal. Only the status, never the case contents.
  - **Delete:** deleting a project also deletes all of its records (PACC cases and citizen reports survive).
    - Admin: "Delete project", with a confirmation.
    - Personnel: "Request deletion" with a reason → while pending, "Cancel deletion request" → once approved,
      "Delete project (approved until <date>)", usable once within 7 days. A line under the header says where the
      request stands (waiting, approved until, expired, or declined with the Admin's note; after an expiry or a
      decline they can ask again). The Admin sees a pending request there too, with a link to review it.
    - The delete, request and approve dialogs warn when there is an open PACC case: "This project is under PACC
      investigation. Deleting it removes records PACC may need." (or "A PACC case has been filed on this project.
      …"). It is a warning, not a block; PACC's activity log gets an entry naming who deleted the project.
- **Touches:**
  - Pages and components: `pages/dpwh/ProjectsPage.jsx`, `ProjectFormPage.jsx`, `project/ProjectLayout.jsx`,
    `project/OverviewTab.jsx`, `components/map/LocationPicker.jsx`, `components/projects/PaccCaseChip.jsx`,
    `components/projects/DeleteProjectControls.jsx`, `lib/deletionRequests.js`.
  - API: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `GET /reference`,
    `GET /projects/:id/deletion-request`, `POST /projects/:id/deletion-requests`,
    `POST /deletion-requests/:requestId/cancel`.
  - Data: `projects`, `project_pacc_status` (029; was `projects.pacc_case_status`), `v_project_summary`, `project_deletion_requests`,
    `municipalities`, `barangays`, `agencies`, `contractors`.
  - The place search uses the public OpenStreetMap Nominatim service.

### Progress Monitoring
- **In the UI:** "Progress Monitoring" (`/app/progress`) and the project tab "Phases & progress".
- **Why:** Objective 3 — track progress phase by phase instead of a single number someone types in.
- **Who:** all staff view. Personnel set up phases and submit progress (027: not the Admin).
- **What it does:**
  - **Progress Monitoring list:** every project's completion bar, with a status filter and sorting.
  - **Set up phases:** a template for the project type is filled in, with dates spread over the contract.
    The weights must total 100 %.
  - **Submit progress update:** enter each phase's accomplishment. The new overall percentage is shown before
    saving. Lowering a figure needs a written reason.
  - **Tab contents:** planned vs actual, slippage and the report history (with each report's phase snapshot).
  - How the percentage is computed: [workflows → progress reporting](workflows.md#progress-reporting).
- **Touches:**
  - Pages: `pages/dpwh/ProgressPage.jsx`, `project/ProgressTab.jsx`.
  - API: `GET/PUT /projects/:id/phases`, `GET/POST /projects/:id/progress`, `GET /projects`.
  - Data: `project_phases`, `progress_updates`, `projects.overall_progress`.

### Financial Monitoring
- **In the UI:** "Financial Monitoring" (`/app/finance`) and the project tab "Finance".
- **Why:** Objective 4 — follow budgets, payments and fund use, and spot payments running ahead of the work.
- **Who:** all staff view. Personnel add records (027: not the Admin). Admin deletes a wrong record.
- **What it does:**
  - **Totals:** approved budget, contract amount (with variation orders), disbursed, remaining balance, and an
    overall utilization bar.
  - **Project table:** one row per project, with filters by municipality, office and status, and sorting
    (including "paid ahead of work").
  - **Project Finance tab:** summary cards, a utilization breakdown, physical vs financial progress, the list of
    records, and the form to add a variation order, obligation, disbursement or expense.
    - A record can be tied to a construction phase; the tab shows the totals per phase.
    - The API refuses records that break the rules, for example disbursements above the contract amount, or
      variation orders above 10 % of the original contract.
- **Touches:**
  - Pages: `pages/dpwh/FinancePage.jsx`, `project/FinanceTab.jsx`.
  - API: `GET /finance/overview`, `GET/POST /projects/:id/finance`, `DELETE /projects/:id/finance/:recordId`.
  - Data: `financial_records`, `v_project_summary`.

### 360° images (project tab)
- **In the UI:** project tab "360° images".
- **Why:** Objective 2 — field evidence of the real site condition, with checks that the photo is genuine.
- **Who:**
  - All staff view.
  - Personnel upload, caption and mark a photo as final (027: not the Admin).
  - Admin deletes.
- **What it does:**
  - **Upload:** JPEG, PNG or WebP, up to 30 MB, with an inspection date. The server:
    - checks the file's first bytes and refuses anything that is not really a JPEG, PNG or WebP image, whatever
      type the browser claims; a damaged or incomplete file is refused with a message (400);
    - reads the GPS location and capture time stored in the file;
    - uses coordinates or a capture time typed by the uploader only when the file has none, and records that
      they were typed (the project then gets a Yellow `GPS_MANUAL` or `IMAGE_DATE_MANUAL` reason);
    - measures the distance from the project site;
    - refuses a capture time in the future;
    - warns when the photo is far from the site or its date;
    - compares the file's fingerprint (SHA-256) with every other photo to detect an identical copy (Red
      `IMAGE_REUSED`);
    - computes a perceptual hash (dHash) to detect a re-saved or re-compressed copy of an earlier photo from
      another project or an earlier inspection (Yellow `IMAGE_NEAR_DUPLICATE`; only the later copy is flagged);
    - stores a smaller copy if the file is large.
  - **Limits:** each person can make at most 20 file-carrying requests per 10 minutes (360° photo and document
    uploads, profile photos, flag reviews, and creating or editing audit findings).
  - **Public at once:** a photo uploaded by DPWH personnel appears on the public portal right away. Nobody
    approves or hides photos (migration 022); an Admin can delete a wrong upload.
  - **Final photo:** a photo marked **final** (as-built) is one of the requirements for a project to count as completed.
  - **Offline:** with no connection, a photo is kept on the device (IndexedDB). The top bar shows waiting uploads
    (Personnel only), and they are sent automatically when the connection returns. Each photo is listed and sent
    only for the account that queued it; another account signed in on the same browser never sends it.
- **Touches:**
  - Pages and components: `project/ImagesTab.jsx`, `components/common/OfflineUploads.jsx`, `lib/offlineUploads.js`.
  - API: `GET/POST /projects/:id/images`, `PATCH /projects/:id/images/:imageId`,
    `DELETE /projects/:id/images/:imageId`. Photos are public as soon as they are uploaded (no approval route).
  - Data: `site_images`, bucket `panoramas`.

### Documents (project tab)
- **In the UI:** project tab "Documents".
- **Why:** keeps supporting papers (contract, program of work, reports, variation orders, payment documents,
  as-built plans) with the project.
- **Who:** all staff view and download. Personnel upload (027: not the Admin). The uploader or an Admin deletes.
- **What it does:** upload PDF, image, Word or Excel files up to 25 MB, with a title, type, date and optional
  phase. Download through an expiring link.
- **Touches:** `project/DocumentsTab.jsx`; `GET/POST /projects/:id/documents`,
  `DELETE /projects/:id/documents/:documentId`; `project_documents`, bucket `project-documents`.

### Project Map (staff)
- **In the UI:** "Project Map" (`/app/map`).
- **Why:** Objective 5 on a map — see at a glance where the problem projects are.
- **Who:** all staff.
- **What it does:** an OpenStreetMap map with pins coloured by **flag** (Green, Yellow, Red, or grey when not yet
  evaluated). Filters: municipality, barangay, office, contractor, status and flag. Clicking a pin opens a side
  panel with the latest 360° photo, the project details, its progress and the flag reasons.
- **Touches:** `pages/shared/MapPage.jsx`, `components/map/ProjectMap.jsx`, `ProjectPanel.jsx`;
  `GET /map/projects`, `GET /map/projects/:id`; `v_project_summary`, `site_images`.

### Flags & Audit
- **In the UI:** "Flags & Audit" (`/app/audit`), with two tabs: "Flag review queue" and "Audit findings". Each
  project also has a "Flag & audit" tab.
- **Why:** Objective 5 — the system flags delays and possible discrepancies automatically. An auditor then
  confirms or corrects each flag, with reasons and evidence.
- **Who:** all staff view. Auditor and Admin review flags and record findings. Admin can re-check every project.
  Personnel see the page read-only ("Flagged projects").
- **What it does:**
  - **Automatic flags:** every project is evaluated after each change and once a day. The result is Green, Yellow
    or Red, with the reasons found: schedule, photos, payments and completion requirements (see
    [workflows → flag raising](workflows.md#flag-raising-and-audit-resolution)).
  - **Flag review queue:** counters (Red, Yellow, Green, awaiting review), filters by flag, review status and
    municipality, worst projects first.
  - **Review:** confirm the flag, or override it with another colour. A reason is always required. An override
    also needs an evidence file (PDF or photo). The auditor's decision is sticky: editing the project can never
    lower a reviewed flag. If the automatic flag changes later, the flag becomes the worse of the new automatic
    flag and the auditor's decision, and goes back to "pending" for another review.
  - **Audit findings:** severity, description, recommendation and due date, and an optional assignment of the
    corrective action to a DPWH personnel account. The assigned person reports progress on their dashboard; the
    auditor closes the finding.
  - **Project "Flag & audit" tab:** the current flag and why, the decision history, the findings, and the
    project's audit report (PDF).
- **Touches:**
  - Pages and components: `pages/auditor/AuditPage.jsx`, `project/FlagsTab.jsx`,
    `components/audit/ReviewFlagModal.jsx`, `FindingModal.jsx`, `CorrectiveActionModal.jsx`.
  - API: `GET /flags`, `POST /flags/recheck`, `GET /projects/:id/flags`, `POST /projects/:id/flags/review`,
    `GET /findings`, `GET/POST /projects/:id/findings`, `PATCH /findings/:findingId`, `…/action`, `…/public`,
    `GET /findings/assigned`, `GET /audit/assignees`.
  - Data: `projects` (flag columns), `flag_history`, `flag_reviews`, `audit_findings`, `system_settings`, bucket
    `audit-evidence`.

### Reports
- **In the UI:** "Reports" (`/app/reports`).
- **Why:** auditors and offices need documents they can file, print and share.
- **Who:** all staff.
- **What it does:** three downloads:
  1. **Flagged projects report:** PDF or Excel. Yellow and Red projects by default, with filters. Includes the
     reasons, auditor decisions and findings.
  2. **One project's audit report:** PDF.
  3. **Financial summary:** Excel, with totals.

  The PDFs have a letterhead, page numbers and a signature block. Each person can download at most 30 reports
  per 10 minutes.
- **Touches:**
  - Pages: `pages/auditor/ReportsPage.jsx`.
  - API: `GET /reports/flagged.pdf`, `/reports/flagged.xlsx`, `/reports/projects/:id/audit.pdf`,
    `/reports/financial.xlsx`.
  - Server code: `services/report.js`, `pdfLayout.js`, `utils/xlsx.js`.
  - Data: `v_project_summary`, `audit_findings`, `flag_reviews`, `flag_history`, `project_phases`,
    `financial_records`.
- The CSV versions (`/reports/flagged.csv`, `/reports/financial.csv`) still exist in the API, but the page has no
  button for them.

### Contractors
- **In the UI:** "Contractors" (`/app/contractors`).
- **Why:** Objective 1 — a list of contractors with their PCAB licence and the projects they hold.
- **Who:** all staff view. Personnel and Admin add, edit, suspend and reactivate. Admin deletes.
- **What it does:**
  - **List:** licence, contact details, number of projects and total contract amount. Expand a row to see the
    contractor's projects.
  - **Actions column:** Edit, Delete. A contractor used by a project cannot be deleted; edit it and untick
    "Active" instead (there is no separate Suspend button any more).
  - **Effect of "Active" off:** an inactive contractor is no longer offered in the project form. Only the form
    hides it; the API does not block it.
- **Touches:** `pages/dpwh/ContractorsPage.jsx`, `components/common/RowActions.jsx`;
  `GET/POST /contractors`, `GET/PATCH/DELETE /contractors/:id`; `contractors`, `v_project_summary`.

### Offices & Agencies
- **In the UI:** "Offices & Agencies" (`/app/agencies`).
- **Why:** every project has an implementing office, and every staff member belongs to one.
- **Who:** all staff view. Only the Admin adds, edits or deletes.
- **What it does:** lists the offices with code, type (District Engineering Office, Field Office, Other) and
  address. An office used by a project or a user account cannot be deleted. The page has no Suspend button
  any more; an office already marked inactive still shows "Inactive" and is not offered for new projects.
- **Touches:** `pages/dpwh/AgenciesPage.jsx`; `GET /reference`, `POST /agencies`, `PATCH/DELETE /agencies/:id`;
  `agencies`.

### User Management
- **In the UI:** "User Management" (`/app/users`). The sidebar badge shows the number of waiting access requests.
- **Why:** only approved people may work on the records.
- **Who:** Admin only.
- **What it does:**
  - **Requests:** approve an access request (choosing the role, office and position) or decline it with a note.
  - **Accounts:** create an account directly, or edit its name, role, office and position.
  - **Suspend:** with a reason; it blocks sign-in and every API call. Lift the suspension later.
  - **Delete:** only accounts with no records in the system.
  - **Find accounts:** search, and filter by role, status and approval.
  - **PACC accounts are not here:** the list does not show them, and the API refuses to create an account with the PACC
    role, or to approve, decline, edit, suspend, reactivate or delete a PACC account ("PACC accounts are managed by
    PACC."). PACC manages its own
    accounts (see [PACC Members](#pacc-members)).
- **Touches:** `pages/admin/UsersPage.jsx`; `GET/POST /users`, `PATCH/DELETE /users/:userId`,
  `POST /users/:userId/approve|reject|suspend|unsuspend`; `profiles`, Supabase Auth users.

### Deletion requests
- **In the UI:** "Deletion requests" (`/app/deletion-requests`). The sidebar badge shows the number of pending
  requests.
- **Why:** only DPWH Personnel encode project data, but deleting a whole project is checked by the System
  Administrator first (migration 027).
- **Who:** Admin only. DPWH Personnel ask from the project page (see [Project Management](#project-management)).
- **What it does:**
  - **List:** "Waiting for a decision" (default) or "All requests", newest first, paged. Each row shows the
    project (code and name, linked while it exists), the PACC case-status chip, who asked and when, the reason, the
    status (Waiting for approval, Approved, Declined, Cancelled, Project deleted, Expired) and the decision.
  - **Approve:** optional note (at most 500 characters); the requester may then delete the project **once**, within
    **7 days**. The dialog warns when the project has an open PACC case.
  - **Decline:** optional note, shown to the requester on the project page; they can ask again.
  - Only pending requests can be decided. Every step is in the activity log (`project.deletion_request`,
    `.deletion_cancel`, `.deletion_approve`, `.deletion_decline`, then `project.delete`).
- **Touches:** `pages/admin/DeletionRequestsPage.jsx`, `lib/deletionRequests.js`; `GET /deletion-requests?status=pending|all`,
  `POST /deletion-requests/:requestId/approve|decline`; `project_deletion_requests`.

### Activity Logs
- **In the UI:** "Activity Logs" (`/app/activity`).
- **Why:** accountability — a permanent record of who changed what, and when.
- **Who:** Admin and Auditor.
- **What it does:** lists every logged action, newest first, including the automatic daily flag check, logged as
  "System". You can search by summary or person, and filter by area, role and date range. Nobody can edit or
  delete an entry: the database refuses it. PACC actions are never written here; they go to the
  [PACC activity log](#pacc-activity-log), which only PACC can read.
- **Touches:** `pages/admin/ActivityLogPage.jsx`; `GET /activity`; `activity_logs` (written by
  `server/src/services/activityLog.js` from every change endpoint).

### System Settings
- **In the UI:** "System Settings" (`/app/settings`), page title "Automatic flag rules".
- **Why:** the flag thresholds must be adjustable without changing code.
- **Who:** Admin.
- **What it does:** edit the thresholds:
  - slippage for Yellow and Red;
  - maximum photo age;
  - GPS distance for Yellow and Red;
  - payment-ahead gap for Yellow and Red;
  - late-completion tolerance;
  - photo date tolerance.

  Saving re-checks every project at once and reports how many flags changed. This page holds only the flag rules.
- **Touches:** `pages/admin/SettingsPage.jsx`; `GET/PUT /settings/flag-rules`; `system_settings`,
  then every project's flag.

### My account
- **In the UI:** account menu (top right) → "My account" (`/app/account`).
- **Why:** people keep their own details current.
- **Who:** all staff.
- **What it does:** change the profile photo, full name and position, and the password (the current password is
  asked for first). The email can only be changed by an admin.
- **Touches:** `pages/shared/AccountPage.jsx`; `GET/PATCH /me`, `POST/DELETE /me/avatar`, Supabase Auth;
  `profiles`, bucket `avatars`.

### Background jobs
- **Daily flag check:** runs inside the API at 01:15 Asia/Manila time (`DAILY_FLAG_CHECK_CRON`) and once at
  start-up. It re-evaluates every project, so delays show up even when nobody submits anything. It can also be
  run by hand with `npm run flags:recheck`. Code: `server/src/jobs/dailyFlagCheck.js`.
- **Photo hash backfill (one-off):** `node --env-file=.env scripts/backfill-phash.mjs` (from `server/`) computes
  the perceptual hash of photos uploaded before migration 020. Photos without a hash are skipped by the
  near-duplicate check until it has run. Code: `server/scripts/backfill-phash.mjs`.

---

## PACC portal

The PACC (Presidential Anti-Corruption Commission) portal receives projects with serious problems and anonymous
citizen reports, and records PACC's cases. The name is kept as the course instructor recommended; the real PACC was
abolished in 2022, so this is a modelled role.

- **Who:** active, approved `pacc` accounts only. They sign in on the normal sign-in page and land on `/pacc`.
  Opening `/app` sends them to `/pacc`, and staff opening `/pacc` are sent to `/app`.
- **What PACC can read:** citizen reports and their proof, cases, case documents and the PACC activity log — and
  nobody else can, not the Admin, Auditors or DPWH Personnel, not even directly through Supabase with their own
  login (RLS `is_pacc()` plus `requireRole('pacc')` on `/api/pacc`). PACC can also read the project records it needs
  to investigate (as an Auditor can) but cannot change any DPWH data.
- **First account:** created once with `server/scripts/bootstrap-pacc.mjs` (see the root README). After that PACC
  adds its own members.

### PACC inbox
- **In the UI:** "Inbox" (`/pacc`).
- **Why:** shows what needs PACC's attention.
- **What it does:** lists the projects **referred** to PACC, with the reason: **Auditor-confirmed Red** (the flag an
  auditor confirmed or overrode to is Red), **Citizen reports (10+)** (10 or more open reports) or **Open case**.
  Each row shows the open report count, the last report date (a date, never a time) and the case status. Referral
  is computed live: when PACC closes reports, the count drops at once. A row opens the investigation page.
- **Touches:** `pages/pacc/PaccInboxPage.jsx`; `GET /pacc/inbox`; `citizen_reports`, `pacc_cases`, `projects`.

### Investigation page
- **In the UI:** a project from the inbox (`/pacc/projects/:id`).
- **What it does:** project facts, the flag and its reasons, auditor decisions and findings, the citizen
  reports with their proof photos (expiring signed links), and, read-only, the construction phases, the 50 most
  recent progress reports, the financial records with a summary, the 360° photos (each opens full size in a new
  tab) and the supporting documents. Opening it marks new reports "Under review". PACC can
  close one report, or all open reports of the project, with an outcome (valid, invalid, duplicate), and open a
  case on the project, attaching open reports to it.
- **Touches:** `pages/pacc/PaccProjectPage.jsx`, `components/pacc/OpenCaseModal.jsx`, `components/pacc/ProjectRecords.jsx`; `GET /pacc/projects/:id`,
  `POST /pacc/reports/:reportId/close`, `POST /pacc/projects/:id/reports/close-all`, `POST /pacc/projects/:id/cases`;
  buckets `citizen-reports`, `panoramas` and `project-documents` (signed links).

### Cases
- **In the UI:** "Cases" (`/pacc/cases`) and a case page (`/pacc/cases/:caseId`).
- **What it does:**
  - A case belongs to one project; a project has at most one case that is not closed. It records the
    **respondents** (a contractor from the contractor list and/or officials named as free text; the case keeps the
    contractor's name, so it still shows, marked "removed from contractor list", if an Admin later deletes the
    contractor; migration 026), the **charges**,
    the **status**, **notes** (append-only) and **documents** (PDF, JPEG, PNG or WebP, in the private
    `pacc-case-documents` bucket).
  - **Status:** Under investigation → Case filed → Resolved or Dismissed; Under investigation → Dismissed. Closing
    is final (open a new case instead). Closing a case closes its attached reports in the same database
    transaction (migration 025).
  - **Show status to public** (off by default): while on, and the case is Under investigation or Case filed, the
    public project drawer shows "Under PACC investigation" or "Case filed" (`projects.pacc_public_status`, kept by a
    database trigger). Nothing else about the case is public.
  - **DPWH staff always see the status:** Admin, Personnel and Auditor see "Under PACC investigation" or "Case
    filed" on the staff project page and list while the case is open, whatever the switch says
    (`v_project_summary.pacc_case_status`, migration 027; stored in `project_pacc_status` since 029). The switch controls only the public portal; the case page says so.
- **Touches:** `pages/pacc/PaccCasesPage.jsx`, `PaccCasePage.jsx`; `GET /pacc/cases`, `GET/PATCH /pacc/cases/:caseId`,
  `POST /pacc/cases/:caseId/notes`, `POST /pacc/cases/:caseId/documents`; `pacc_cases`, `pacc_case_notes`,
  `pacc_case_documents`, `projects.pacc_public_status`.

### PACC Members
- **In the UI:** "Members" (`/pacc/members`).
- **Why:** PACC manages its own accounts; the System Administrator cannot.
- **What it does:** any PACC member can add a member (email, name, position and a temporary password), suspend
  one with a reason, lift a suspension, or remove a member with no case records. Nobody can act on their own
  account, and the last active PACC account cannot be suspended or removed.
- **Touches:** `pages/pacc/PaccMembersPage.jsx`; `GET/POST /pacc/members`,
  `POST /pacc/members/:userId/suspend|unsuspend`, `DELETE /pacc/members/:userId`; `profiles`, Supabase Auth users.

### PACC activity log
- **In the UI:** "Activity log" (`/pacc/activity`).
- **What it does:** every PACC action (reports closed, cases opened and changed, notes, documents, members), newest
  first, with a search box and a date range. Append-only, and readable only by PACC; it is separate from the staff Activity Logs.
- **Touches:** `pages/pacc/PaccActivityPage.jsx`; `GET /pacc/activity`; `pacc_activity`.

### My account (PACC)
- **In the UI:** "My account" (`/pacc/account`): the same page as the staff one.

---

## Not yet implemented

These pieces exist in the code but are unfinished, unused or out of date. They are listed so nobody mistakes
them for working features.

| What | State |
|---|---|
| **Publishing audit findings to the public** | Auditors and Admins can switch a finding to "Shown to public" (Flag & audit tab), and the value is saved in `audit_findings.is_public`. But the public portal never shows findings: the public API does not read them, and the anonymous role has no access to `audit_findings`. The switch has no visible effect for the public |
| **Report CSV downloads** | `GET /reports/flagged.csv` and `/reports/financial.csv` work, but the Reports page offers only PDF and Excel |
| **Old sample-data scripts** | `server/scripts/seed-sample-project.mjs` and `remove-placeholders.mjs` refer to the virtual-tour tables and columns (`tour_links`, `view_label`) that no longer exist. They are not listed in `server/package.json` and would fail if run |
| **Status rule for "Completed" in `validationRules.js`** | `checkStatusChange()` is still in the file but no controller calls it; completion is decided by the automatic evaluation instead |
