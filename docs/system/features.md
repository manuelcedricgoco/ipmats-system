# Features

Every feature of IPMATS (DPWH 360°), page by page. Each entry says what it is called in the app, why it exists,
who uses it, what it does, and what it touches. API routes are relative to `/api`.

- Exact rights per role: [roles-and-permissions.md](roles-and-permissions.md)
- Tables and columns: [database.md](database.md)
- Step-by-step flows: [workflows.md](workflows.md)

The app has two parts:
- **Public portal** (`/`, `/projects`, `/map`): open to everyone, no account. Top navigation bar.
- **Staff workspace** (`/app/...`): for signed-in, approved Admins, DPWH Personnel and Auditors. Left sidebar.

---

## Public portal

The portal exists for transparency: anyone can see where DPWH projects in Occidental Mindoro are, who builds them,
what they cost and how far along they are, without signing in. It shows only public fields. Flags, audit findings,
finances, phases, progress reports and logs are never sent to it (enforced by the database, see
[roles-and-permissions](roles-and-permissions.md#3-row-level-security-the-real-enforcement-point-for-reads)).

Accounts waiting for approval, or declined, see the same portal with a status banner at the top.

### Dashboard (public landing page)
- **In the UI:** "Dashboard" in the top bar; page at `/`.
- **Why:** gives a visitor the whole picture on one page.
- **Who:** everyone.
- **What it does:**
  - **Search box:** a name or municipality search that opens the Projects page with the results.
  - **Four counters:** Total projects, Ongoing, Completed, and "Delayed or stalled" (delayed plus suspended projects).
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
  - **Map:** an OpenStreetMap map with one pin per project, coloured by project status (not by flag), and a
    colour legend.
  - **Project drawer:** clicking a pin opens a drawer over the map (a bottom sheet on phones). The map stays
    usable, the selected pin is highlighted, and the map centres on it. The drawer shows:
    - Project ID and type, and the title.
    - The 360° viewer, or a slim "No 360° photo published yet" line.
    - Status and physical progress, with start and target dates.
    - Contract cost.
    - Location, office and contractor.
  - **Closing and sharing:** close with the X, the Escape key, or a click on the map. The open project is kept in
    the address (`?project=<id>`), so it can be linked to. A **recenter** button moves the map back to the project.
  - **Staff link:** signed-in, approved staff also get **View full project**, which opens the staff project page.
- **Touches:**
  - Pages and components: `pages/public/PublicMapPage.jsx`, `components/public/PublicProjectMap.jsx`,
    `ProjectDrawer.jsx`, `components/map/ProjectMap.jsx`, `components/viewer360/PanoramaViewer.jsx`.
  - API: `GET /public/map`, `GET /public/projects/:id`.
  - Data: `v_public_projects`, `site_images` (only rows approved for the public); files in the `panoramas` bucket
    through expiring signed links.

### 360° viewer
- **In the UI:** the photo panel in the project drawer (and in the staff pages).
- **Why:** Objective 2 — lets people see the actual site condition, not just a pin.
- **Who:** everyone, for photos approved for the public. Staff see all photos.
- **What it does:** shows an equirectangular (2:1) panorama in an interactive viewer (drag to look around, zoom,
  full screen). When a project has several public photos, buttons with the inspection dates switch between them.
- **Touches:** `components/viewer360/PanoramaViewer.jsx` (Pannellum).

### Sign in, Register and Awaiting approval
- **In the UI:** "Sign in" (top right), the Register page (`/register`), the Awaiting approval page
  (`/account-pending`).
- **Why:** staff need accounts. Objective 1 asks for secure login and registration.
- **Who:** DPWH personnel and auditors register. Anyone with an account signs in.
- **What it does:**
  - **Register:** asks for name, email, password, the role requested (DPWH Personnel or Auditor), office,
    position, and an optional photo. It creates a request, not a staff account (see
    [registration and approval](roles-and-permissions.md#registration-and-approval)).
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
- **Who:** all staff view. Personnel and Admin register and edit. Admin deletes.
- **What it does:**
  - **List:** search by name, Project ID or contractor. Filter by municipality, barangay, office, contractor,
    status and type. Sort, and page through the results.
  - **Register / Edit form:** name, type, office, contractor, contract reference, municipality and barangay,
    location, approved budget (ABC), contract amount, Notice to Proceed, duration, fund source and status.
    - Location is picked on a map: search a place, click, or drag the pin. Points outside Occidental Mindoro are
      refused, in the browser and again by the API.
    - The **Project ID is created by the database** (e.g. `26OM0332`) and cannot be changed. A dialog shows it
      after saving.
    - The target completion date is computed as NTP + duration.
    - The contract amount cannot exceed the approved budget.
    - The status is **automatic**. Staff can only set Suspended or Terminated, or put it back to automatic.
  - **Project page tabs:** Overview, Phases & progress, Finance, 360° images, Flag & audit, Documents (described
    below). Non-editors see a "Read-only" label.
  - **Delete:** an Admin can delete a project, which also deletes all of its records.
- **Touches:**
  - Pages and components: `pages/dpwh/ProjectsPage.jsx`, `ProjectFormPage.jsx`, `project/ProjectLayout.jsx`,
    `project/OverviewTab.jsx`, `components/map/LocationPicker.jsx`.
  - API: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `GET /reference`.
  - Data: `projects`, `v_project_summary`, `municipalities`, `barangays`, `agencies`, `contractors`.
  - The place search uses the public OpenStreetMap Nominatim service.

### Progress Monitoring
- **In the UI:** "Progress Monitoring" (`/app/progress`) and the project tab "Phases & progress".
- **Why:** Objective 3 — track progress phase by phase instead of a single number someone types in.
- **Who:** all staff view. Personnel and Admin set up phases and submit progress.
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
- **Who:** all staff view. Personnel and Admin add records. Admin deletes a wrong record.
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
  - Personnel and Admin upload, caption and mark a photo as final.
  - Auditor and Admin choose which photos the public sees.
  - Admin deletes.
- **What it does:**
  - **Upload:** JPEG, PNG or WebP, up to 30 MB, with an inspection date. The server:
    - reads the GPS location and capture time stored in the file;
    - measures the distance from the project site;
    - refuses a capture time in the future;
    - warns when the photo is far from the site or its date;
    - compares the file's fingerprint (SHA-256) with every other photo to detect reuse;
    - stores a smaller copy if the file is large.
  - **Public approval:** new photos start hidden from the public until an Auditor or Admin clicks
    **Show to public**.
  - **Final photo:** a photo marked **final** (as-built) is one of the requirements for a project to count as completed.
  - **Offline:** with no connection, a photo is kept on the device (IndexedDB). The top bar shows waiting uploads,
    and they are sent automatically when the connection returns.
- **Touches:**
  - Pages and components: `project/ImagesTab.jsx`, `components/common/OfflineUploads.jsx`, `lib/offlineUploads.js`.
  - API: `GET/POST /projects/:id/images`, `PATCH /projects/:id/images/:imageId`, `PATCH …/public`,
    `DELETE /projects/:id/images/:imageId`.
  - Data: `site_images`, bucket `panoramas`.

### Documents (project tab)
- **In the UI:** project tab "Documents".
- **Why:** keeps supporting papers (contract, program of work, reports, variation orders, payment documents,
  as-built plans) with the project.
- **Who:** all staff view and download. Personnel and Admin upload. The uploader or an Admin deletes.
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
    also needs an evidence file (PDF or photo).
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

  The PDFs have a letterhead, page numbers and a signature block.
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
  - **Actions column:** Edit, Suspend / Reactivate, Delete. A contractor used by a project cannot be deleted.
  - **Effect of suspending:** a suspended contractor is no longer offered in the project form. Only the form
    hides it; the API does not block it.
- **Touches:** `pages/dpwh/ContractorsPage.jsx`, `components/common/RowActions.jsx`;
  `GET/POST /contractors`, `GET/PATCH/DELETE /contractors/:id`; `contractors`, `v_project_summary`.

### Offices & Agencies
- **In the UI:** "Offices & Agencies" (`/app/agencies`).
- **Why:** every project has an implementing office, and every staff member belongs to one.
- **Who:** all staff view. Only the Admin adds, edits, suspends or deletes.
- **What it does:** lists the offices with code, type (District Engineering Office, Field Office, Other) and
  address. A suspended office is no longer offered for new projects. An office used by a project or a user
  account cannot be deleted.
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
- **Touches:** `pages/admin/UsersPage.jsx`; `GET/POST /users`, `PATCH/DELETE /users/:userId`,
  `POST /users/:userId/approve|reject|suspend|unsuspend`; `profiles`, Supabase Auth users.

### Activity Logs
- **In the UI:** "Activity Logs" (`/app/activity`).
- **Why:** accountability — a permanent record of who changed what, and when.
- **Who:** Admin and Auditor.
- **What it does:** lists every logged action, newest first, including the automatic daily flag check, logged as
  "System". You can search by summary or person, and filter by area, role and date range. Nobody can edit or
  delete an entry: the database refuses it.
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
