# IPMATS — DPWH 360° Infrastructure Project Monitoring and Transparency System

**Current build: Week 3.** This repository grows **week by week** until it matches the full DPWH 360° system.

| Week | Dates | Objectives |
|---|---|---|
| 1 | November 5–12, 2026 | **Objective 1:** A centralized platform with secure user login and registration for managing infrastructure project information, including contractors, budgets, agencies and project duration. |
| 2 | November 13–17, 2026 | **Objective 3:** Phase-by-phase tracking of project progress and accomplishments. **Objective 4:** A financial monitoring module for tracking project budgets, expenses and fund utilization. |
| 3 | November 18–30, 2026 | **Objective 2:** 360° panoramic imaging of actual construction site conditions. **Objective 5:** Automated flagging of project delays and potential discrepancies. |

### Week 1 modules

| Module | What it does |
|---|---|
| Login | Email + password (Supabase Auth). A 10-second DPWH / Occidental Mindoro entry screen is shown, then the dashboard for the user's role opens. |
| Register | New users request a **DPWH Personnel** or **Auditor** account. They get no access until the System Administrator approves the request. |
| Dashboard | Different heading and shortcuts per role, with totals for projects, approved budget, contract amount, contractors and offices. |
| Project Management | Register, edit, view and list projects: implementing office/agency, contractor, location, **approved budget (ABC)**, **contract amount** and **duration** (Notice to Proceed + calendar days = target completion). Admin can delete. |
| Contractors | Add, edit and view contractors (PCAB licence, contact details, assigned projects). Admin can delete a contractor that has no projects. |
| Offices & Agencies | Add, edit and view implementing offices (admin edits; staff view). Admin can delete an office that has no projects and no user accounts. |
| User Management | Admin approves or declines access requests, manages accounts and roles, **suspends** an account (with a reason) or lifts the suspension, and deletes accounts that have no records. |
| My account | Profile photo, name/position and password change. |

### Week 2 modules

| Module | What it does |
|---|---|
| Phases & progress (project tab) | Construction phases with weight, planned and actual dates and accomplishment. **Overall completion = Σ(weight × accomplishment) ÷ Σ(weight)**, compared with where the schedule says the project should be today (slippage). DPWH Personnel set up the phase plan (a template per project type is filled in) and submit progress updates; every update is kept in the history. |
| Progress Monitoring | Every project's overall completion, linking to its phases. |
| Finance (project tab) | Approved budget, contract amount + variation orders, obligations, disbursements, remaining balance and fund utilization, physical vs financial progress, and every financial record. Personnel and Admin add records; Admin can delete a wrong entry. |
| Financial Monitoring | Budget, contract amount, disbursed and remaining balance of every project with totals, filters and sorting. |
| Server-side checks | Before anything is saved: weights total 100%, dates inside NTP → target completion, report dates in order and not in the future, lower accomplishment needs remarks, completion only at 100%, disbursements within the contract amount, variation orders within 10% of the original contract, no duplicate reference numbers. |

### Public portal (added on request)

| Feature | What it does |
|---|---|
| Landing page (`/`) | Overview of the system for everyone (what it does, how it works, flags, roles, coverage) with **Sign in** / **Register**. Signed-in users get a button to their dashboard or portal. |
| Public portal (`/portal`) | **Sign-in required.** Visitors are sent to the login page. It has its own rounded sidebar (Projects, Project Map, Dashboard, My account), like the staff workspace. Registered accounts (any role) see the totals, then every project with location, contractor, work completed and money paid; search and filters. |
| Public project page (`/projects/:id`) | Sign-in required. Project details, progress by phase, progress reports, and where the money went (disbursements, variation orders, expenses). Read-only. |
| Public accounts | On the Register page choose **Public**. The account is approved automatically (view-only) and opens the portal after sign-in; it has My account (photo, name, password). DPWH Personnel / Auditor requests still need admin approval. |
| Anonymous access | None. The database gives the anonymous role no project data (migration 006), and the API reads it with the service key only after the sign-in check. |
| What stays hidden | Contract and financial reference numbers, who submitted reports or records, contractor contact details, every user profile. Enforced in the database (migration 005: column-level grants for the anonymous role), not only in the screens. |

**Entry splash:** 5 seconds in total, counted from the click on **Sign in** (the sign-in happens while it plays), with staged animations and a fade into the system. If signing in takes longer, it waits for it. A wrong password closes it and shows the error.

### Week 3 modules

| Module | What it does |
|---|---|
| Automatic status and flags | After every change and daily at 01:15 (Asia/Manila), each project is evaluated: status **Not started / Ongoing / Delayed / Completed** is set automatically (personnel may still set Suspended or Terminated), and a **Green / Yellow / Red** flag is given with its reasons. Completed needs every phase at 100%, an actual completion date **and** a final 360° photo. Thresholds are in `system_settings` (fixed defaults; see below). |
| 360° images (project tab) | Upload 360° photos; the server reads the photo's GPS and capture time (EXIF), checks the distance from the site, the capture date against the inspection date and the Notice to Proceed, and whether the same file was used before. Pannellum viewer with a compare mode. |
| Project Map | OpenStreetMap with flag-coloured markers and filters (municipality, contractor, status, flag). Clicking a marker opens the project details with its latest 360° photo. |
| Flags & Audit (auditor panel) | Review queue (worst first). Auditors confirm or override each flag with a reason and optional evidence, and record findings with corrective actions. Decisions and history cannot be edited or deleted. |
| Flag & audit (project tab) | Flag, reasons, auditor decisions, findings, history; audit report PDF. |
| Reports | Audit report of flagged projects (PDF / CSV), one project's audit report (PDF), financial summary (CSV). |
| Dashboards | Staff: Chart.js charts of flags, status, furthest behind schedule, flags per municipality, contract vs disbursed. Public (signed-in): flag status (only auditor-reviewed flags; others "Under review"), status, completion ranges, completion per municipality. The public map and project pages also show 360° photos. |

### System improvements (after Week 3)

| Area | What changed |
|---|---|
| Password fields | Eye button to show / hide the password on Login, Register, My account and Create account (the browser's own reveal icon is hidden so only one appears). |
| Project ID | Generated by the **database** on registration (same format, e.g. `26OM0332`: year + `OM` + sequence). A locked counter row prevents two simultaneous registrations from getting the same ID; IDs are uppercase, unique regardless of letter case, and cannot be changed after registration. The new ID is shown in a dialog right after saving. |
| Project location | Register / Edit Project has an OpenStreetMap picker: search a place, click the map, drag the pin, or use the device's GPS. Only points inside the **Occidental Mindoro boundary** (OpenStreetMap relation 1506320, includes Lubang and coastal waters) are accepted — checked in the browser and again by the API; the database keeps a range check as a last safety net. |
| Responsive layout | Every page checked at 320, 375, 768, 1024 and 1440 px for all four roles; no page scrolls sideways. Directory tables (contractors, offices, users) become cards on phones; comparison tables (finance, findings, progress) scroll sideways with the first column pinned. |
| PDF reports | Redesigned: portal letterhead with the DPWH 360° logo, report reference, summary cards, numbered sections, bordered tables that repeat their header on each page, signature block, page numbers. |
| Excel / CSV | **Excel (.xlsx)** downloads look like a normal Excel sheet — headers in row 1 (A1), Excel gridlines and default row height — plus automatic column widths, a coloured header row, alternating row colours, coloured flags, peso / percent / date formats, wrapped long text (taller rows only where needed), frozen header, filters and SUM totals. Report details are on a second sheet, "Report info". The Reports page offers PDF and Excel (the CSV endpoints still exist in the API but are no longer shown, because CSV cannot hold widths or colours). |
| Look and navigation | Full-height sidebar with rounded right corners for every role (Admin, Auditor, DPWH Personnel and now the Public portal), animated active item, a drawer that slides in and out on phones, flat top bar, page / card / button / table transitions, landing page with scroll animations. |

### Gaps closed against the concept document

| Concept document | What the system now has |
|---|---|
| §4.6, §6, §7.1 Activity and Audit Logs | **Activity Logs** page (Admin, Auditor): every change — who, what, when — filter by area, role, date or text. Entries cannot be edited or deleted. |
| §7.1, §14 Admin manages system configuration | **System Settings** page (Admin): change the automatic flag thresholds; every project is re-checked at once. |
| §4.2, §7.3, §14 Override needs reason **and** evidence | Overriding a flag now requires a supporting file (also enforced by the database). |
| §7.2, workflow step 3 Supporting documents | **Documents** tab on every project: contracts, programs of work, reports, VOs, payment documents, plans (PDF / image / Word / Excel, 25 MB). |
| §5 Map filters and coordinates | Map filters by **barangay** and **implementing office / DEO**; the side panel shows the coordinates. |
| §7.4, §14 Public sees approved information only | New 360° photos and all findings stay hidden from the public until an Auditor / Admin clicks **Show to public**. Published findings appear on the public project page. |
| §4.3 Financial allocation per phase | A financial record can name its phase; the Finance tab shows **allocation by phase**. |
| §4.6, §7.3 Assign findings, monitor corrective actions | A finding can be **assigned to DPWH personnel**, who see it on their dashboard and report progress (In progress / Resolved); the Auditor closes it. |
| §10 Weak internet, image storage | **Offline upload queue**: with no signal a 360° photo is kept on the device and sent automatically when back online. Large panoramas are **compressed** on the server (checks use the original). |
| §12 Eight specific objectives | The landing page lists the document's eight objectives. |

Flag rules (defaults): Red = target date passed, more than 15 points behind schedule, terminated, reused photo, photo > 2 km from the site, photo taken before the NTP, contract above ABC, paid > 25 points ahead of the work. Yellow = 5–15 points behind, suspended, completed late, no / outdated (> 30 days) / undated photo, photo > 500 m from the site or > 7 days from its inspection date, paid > 10 points ahead, finished but missing a completion requirement. Otherwise Green.

| Layer | Tech |
|---|---|
| Frontend (`client/`) | React 18, Vite, Tailwind CSS, Headless UI, react-day-picker, Leaflet + OpenStreetMap, Pannellum (360°), Chart.js |
| Backend (`server/`) | Node.js, Express, zod validation, helmet, rate limiting, exifr (photo GPS/time), PDFKit (reports, Public Sans font), ExcelJS (Excel exports), node-cron (daily flag check) |
| Database (`database/`) | Supabase PostgreSQL, Auth, Storage, Row Level Security |

Supabase project: **IPMATS** (`indtgynilfigtqaljblc`). Migrations `001`–`011` and the Week 1 + Week 2 sample data are **already applied**. Week 3 sample 360° photos are uploaded with one command (below).

---

## Setup (Windows PowerShell)

Run each command on its own line (PowerShell 5 does not support `&&`).

```powershell
cd ipmats-system
```

```powershell
npm run install:all
```

```powershell
Copy-Item server\.env.example server\.env
```

```powershell
Copy-Item client\.env.example client\.env
```

Open `server\.env` and paste the **service-role (secret) key** of the IPMATS project into `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → IPMATS → Project Settings → API Keys). Never put this key in `client\.env` or commit it. Without it the API is **read-only**: lists and details work, but saving, deleting and User Management return "read-only mode".

Start the API (terminal 1):

```powershell
npm run dev:server
```

Start the web app (terminal 2):

```powershell
npm run dev:client
```

Open <http://localhost:5173>.

**Week 3 sample 360° photos (once):** with the API running, in a second terminal in the `server` folder:

```powershell
npm run seed:images
```

It uploads placeholder panoramas labelled "SAMPLE – NOT A REAL PHOTO" (with GPS and date in the file) through the real upload API, so the photo checks and automatic flags run. To re-check every project's flag on demand: `npm run flags:recheck` (in `server`).

### Demo accounts (password `Dpwh360!Demo2026`)

| Email | Role | Use it to show |
|---|---|---|
| admin@dpwh360.local | System Administrator | User Management, approvals, offices, delete project |
| personnel@dpwh360.local | DPWH Personnel (North DEO) | Register and edit projects and contractors |
| personnel.south@dpwh360.local | DPWH Personnel (South) | Same as above, other office |
| auditor@dpwh360.local | Auditor | Review / override flags, record findings, download audit reports |
| applicant@dpwh360.local | Pending sign-up | "Awaiting approval" page; approve it as admin |
| public@dpwh360.local | Public | Public portal while signed in, My account |

Change or delete these accounts before real use.

## Docker

The system runs as two containers: the **API** (`server/Dockerfile`, Node.js 22) and the **web app** (`client/Dockerfile`, built with Vite and served by nginx, which also forwards `/api` to the API). `docker-compose.yml` starts both.

### Run locally with Docker (PowerShell)

Install **Docker Desktop**, make sure it is running, then:

```powershell
Copy-Item .env.example .env
```

Edit `.env`: set `DOCKERHUB_USER` to your Docker Hub username, and paste the two public Supabase values from `client\.env`. `server\.env` must already be filled in (service-role key included).

```powershell
docker compose up --build
```

Open <http://localhost:8080>. Stop with `Ctrl+C`, or run `docker compose down`.

### Push the images to Docker Hub

Create a free account at hub.docker.com and create two public repositories: `ipmats-api` and `ipmats-web`. Then:

```powershell
docker login
```

```powershell
docker compose build
```

```powershell
docker compose push
```

This uploads `<your-username>/ipmats-api:week2` and `<your-username>/ipmats-web:week2`. Anyone can then run the system with the same `docker compose` file pointing at those images, or with `docker run` directly.

### Security of the images

- No secrets are stored in an image. `.dockerignore` excludes every `.env` file, and the service-role key reaches the API only at run time (`env_file: server/.env`).
- The API runs as the unprivileged `node` user and has a health check (`/api/health`).
- The only values baked into the web image are the **public** Supabase URL and publishable key, which the browser needs anyway.
- Never type `server/.env` values into a build argument, and never push an image built from a folder that still has secrets in it.

### Tests

```powershell
npm test
```

Server: 86 tests (Week 1: schemas, auth and role guards, avatars; Week 2: completion formula and every server-side check; Week 3: every flag rule, photo GPS / timestamp validation with real EXIF data, sign-in on every new endpoint; improvements: Occidental Mindoro boundary, Project ID never accepted from clients, PDF reports, Excel and CSV exports). Delete / suspend: sign-in on every new route, invalid ids, the 5–500 character suspension reason (`deleteSuspend.test.js`). Client: 14 tests.

---

## Folder structure

```
ipmats-system/
├── database/
│   ├── migrations/  001_week1_core_schema.sql      tables: municipalities, barangays, agencies, profiles, contractors, projects
│   │                002_week1_access_control.sql   roles, Row Level Security, grants, v_project_summary view
│   │                003_week1_profile_photos.sql   private avatars bucket
│   │                004_week2_phases_finance.sql   project_phases, progress_updates, financial_records, summary view totals
│   │                005_public_portal.sql          public view of safe columns, v_public_projects
│   │                006_public_requires_login.sql  removes anonymous access to project data
│   │                007_week3_images_flags_audit.sql  site_images, flag_history, flag_reviews, audit_findings, flag thresholds
│   │                008_project_code_generation.sql  Project ID generated by the database (locked counter), unique, unchangeable
│   │                009_location_bounds.sql        database range check matching the Occidental Mindoro boundary
│   │                010_gap_fixes.sql              activity_logs, project_documents, public approval, finding assignment, per-phase finance
│   │                011_user_suspension.sql        profiles.suspended_at / suspended_by / suspension_reason (Suspend / Lift suspension)
│   │                012_agency_status.sql          agencies.is_active (Suspend / Reactivate an office)
│   │                013_data_provenance.sql        (reversed by 014) data-provenance columns, no longer in use
│   │                014_revert_data_provenance.sql drops the 013 columns and restores the project views
│   └── seed/        generate-seed.mjs → seed.sql   (11 municipalities, 124 barangays, 3 offices, 7 contractors, 16 projects)
│                    week2-seed.mjs → seed_week2.sql (phases, monthly progress reports, obligations, disbursements, VOs)
│                    public_demo_user.sql (public@dpwh360.local)
├── server/src/
│   ├── config/      env.js, supabase.js            Supabase connection (user client + service client)
│   ├── middleware/  auth.js, role.js, validate.js, upload.js, errorHandler.js
│   ├── routes/      projects, contractors, agencies, admin (users, /me), progress, finance, schemas.js
│   ├── controllers/ projects, contractors, reference, users, phases, finance, public; Week 3: images, flags, findings, map, dashboard, reports; gap fixes: documents, system (activity logs, settings)
│   ├── services/    avatars, completion, validationRules; Week 3: flagDetection, projectEvaluation, imageValidation, report (PDF), storage; gap fixes: activityLog
│   │                pdfLayout.js (shared PDF letterhead, sections, tables, footer)
│   ├── utils/       geo.js (Occidental Mindoro boundary check), csv.js, xlsx.js (formatted Excel)
│   ├── data/        occidental-mindoro.json (province boundary, © OpenStreetMap contributors, ODbL)
│   ├── assets/      dpwh-logo.png and Public Sans fonts (OFL) for the PDF reports
│   ├── jobs/        dailyFlagCheck.js (Week 3)
│   └── tests/
└── client/src/
    ├── pages/landing/ LandingPage (system overview at /, before Sign in / Register)
    ├── pages/public/ PortalHome, PublicProjectPage, PublicMapPage, PublicDashboardPage (Week 3)
    ├── components/layout/ WorkspaceShell (rounded animated sidebar + top bar for staff and portal), AppLayout, PublicLayout
    ├── pages/auditor/ AuditPage (auditor panel), ReportsPage (Week 3)
    ├── pages/shared/ MapPage, DashboardCharts (Week 3)
    ├── components/   map (Leaflet, LocationPicker for Register / Edit Project), viewer360 (Pannellum), charts (Chart.js), audit (review / finding forms)
    ├── lib/geo.js    Occidental Mindoro boundary + place search (same rule as the API); data/occidental-mindoro.json
    ├── pages/auth/   LoginPage, RegisterPage, AccountPendingPage
    ├── pages/dpwh/   ProjectsPage, ProjectFormPage, ContractorsPage, AgenciesPage, ProgressPage, FinancePage
    ├── pages/dpwh/project/  ProjectLayout (tabs), OverviewTab, ProgressTab, FinanceTab, ImagesTab + FlagsTab (Week 3)
    ├── pages/admin/  UsersPage, ActivityLogPage, SettingsPage (gap fixes)
    ├── pages/shared/ DashboardPage, AccountPage
    ├── context/      AuthContext (session, role), ToastContext
    └── routes/       ProtectedRoute (role-based pages)
```

### Delete and suspend (User Management)

All endpoints need sign-in as **System Administrator** and the service-role key on the server (`requireAuth`, `requireRole('admin')`, `requireWriteAccess`); ids are checked before the database is touched (400). Every action is written to the activity log.

| Endpoint | What it does |
|---|---|
| `DELETE /api/contractors/:contractorId` | Deletes a contractor → 204. **409** if any project uses it ("assigned to N project(s) (codes…). Reassign them or mark the contractor inactive instead.") — the database would otherwise silently remove it from those projects. Log: `contractor.delete`. |
| `DELETE /api/agencies/:agencyId` | Deletes an office → 204. **409** if projects use it or user accounts belong to it. Log: `agency.delete`. |
| `DELETE /api/users/:userId` | Deletes the Supabase Auth user (the profile goes with it) and the profile photo → 204. Refused for your own account and the last active Admin; **409** if the account has any records (activity log, projects, progress, finances, photos, documents, findings, flag reviews / history, contractors) — suspend it instead. Log: `user.delete`. |
| `POST /api/users/:userId/suspend` `{ reason }` | Reason 5–500 characters. Bans the Auth user (cannot sign in), sets `is_active = false`, `suspended_at`, `suspended_by`, `suspension_reason`. Refused for yourself and the last active Admin. Log: `user.suspend`. |
| `POST /api/users/:userId/unsuspend` | Lifts the ban, sets `is_active = true` and clears the suspension columns. Log: `user.unsuspend`. |

A suspended person cannot sign in (Supabase Auth refuses a banned user; the Login page shows *"Your account has been suspended by the System Administrator…"*). A session that is already open is refused by the API (403 "This account has been suspended…"); the web app then signs out and shows the same message on the Login page. `GET /api/users?status=suspended` lists suspended accounts ("Suspended only" chip). The **Account active** switch was removed from the Edit account dialog; suspension is done only with the Suspend / Lift suspension buttons.

## How security works (Week 1)

1. The browser has only the **publishable key**. It signs in with Supabase Auth and sends the JWT to the API.
2. `middleware/auth.js` verifies the JWT and loads the user's role from `profiles`.
3. `middleware/role.js` (`requireRole`) blocks roles that may not use an endpoint:

| Action | Admin | DPWH Personnel | Auditor | Pending sign-up |
|---|---|---|---|---|
| View projects, contractors, offices | ✓ | ✓ | ✓ | — |
| Register / edit project, contractor | ✓ | ✓ | — | — |
| Delete project | ✓ | — | — | — |
| Add / edit office | ✓ | — | — | — |
| Delete contractor (no projects) / office (no projects, no accounts) | ✓ | — | — | — |
| Approve sign-ups, manage users | ✓ | — | — | — |
| Suspend / lift suspension, delete user (no records) | ✓ | — | — | — |
| View phases, progress history, finances (Week 2) | ✓ | ✓ | ✓ | — |
| Set up phases, submit progress, add financial record (Week 2) | ✓ | ✓ | — | — |
| Delete a financial record (Week 2) | ✓ | — | — | — |
| View map, flags, findings, dashboards, reports (Week 3) | ✓ | ✓ | ✓ | — |
| Upload 360° photos, mark final (Week 3) | ✓ | ✓ | — | — |
| Confirm / override flags, record findings (Week 3) | ✓ | — | ✓ | — |
| Delete a 360° photo, re-check all flags now (Week 3) | ✓ | — | — | — |
| Upload supporting documents (delete: own uploads) | ✓ | ✓ | — | — |
| Show photos / findings to the public | ✓ | — | ✓ | — |
| Assign a finding to DPWH personnel | ✓ | — | ✓ | — |
| Update the corrective action of a finding assigned to you | — | ✓ | — | — |
| Read the activity log | ✓ | — | ✓ | — |
| Change the automatic flag rules | ✓ | — | — | — |

4. `middleware/validate.js` + `routes/schemas.js` (zod) reject bad input (e.g. contract amount above the approved budget, coordinates outside Occidental Mindoro — the API checks the exact province boundary in `utils/geo.js`). Week 2 adds `services/validationRules.js`, which checks progress and financial records against the project's current data before saving.
5. **Reads** run as the user, so **Row Level Security** in the database also enforces access. **Writes** use the service-role key, which never leaves the server.
6. Sign-up never grants a role: the database trigger `handle_new_user` stores the *requested* role and sets the account to `pending` until an admin approves it.

## Supabase settings

- Authentication → Sign In / Providers: keep **Allow new users to sign up** and **Confirm email** on.
- Authentication → URL Configuration: Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/login`.
- Without custom SMTP, Supabase sends only a few emails per hour. Use custom SMTP for the demo if you will register several new accounts.
