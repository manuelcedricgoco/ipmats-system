# IPMATS — DPWH 360° Infrastructure Project Monitoring and Transparency System

**Current build: Week 2.** This repository grows **week by week** until it matches the full DPWH 360° system.

| Week | Dates | Objectives |
|---|---|---|
| 1 | November 5–12, 2026 | **Objective 1:** A centralized platform with secure user login and registration for managing infrastructure project information, including contractors, budgets, agencies and project duration. |
| 2 | November 13–17, 2026 | **Objective 3:** Phase-by-phase tracking of project progress and accomplishments. **Objective 4:** A financial monitoring module for tracking project budgets, expenses and fund utilization. |

### Week 1 modules

| Module | What it does |
|---|---|
| Login | Email + password (Supabase Auth). A 10-second DPWH / Occidental Mindoro entry screen is shown, then the dashboard for the user's role opens. |
| Register | New users request a **DPWH Personnel** or **Auditor** account. They get no access until the System Administrator approves the request. |
| Dashboard | Different heading and shortcuts per role, with totals for projects, approved budget, contract amount, contractors and offices. |
| Project Management | Register, edit, view and list projects: implementing office/agency, contractor, location, **approved budget (ABC)**, **contract amount** and **duration** (Notice to Proceed + calendar days = target completion). Admin can delete. |
| Contractors | Add, edit and view contractors (PCAB licence, contact details, assigned projects). |
| Offices & Agencies | Add, edit and view implementing offices (admin edits; staff view). |
| User Management | Admin approves or declines access requests and manages accounts and roles. |
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
| Public portal (`/`) | **Sign-in required.** Visitors are sent to the login page. Registered accounts (any role) see the totals, then every project with location, contractor, work completed and money paid; search and filters. |
| Public project page (`/projects/:id`) | Sign-in required. Project details, progress by phase, progress reports, and where the money went (disbursements, variation orders, expenses). Read-only. |
| Public accounts | On the Register page choose **Public**. The account is approved automatically (view-only) and opens the portal after sign-in; it has My account (photo, name, password). DPWH Personnel / Auditor requests still need admin approval. |
| Anonymous access | None. The database gives the anonymous role no project data (migration 006), and the API reads it with the service key only after the sign-in check. |
| What stays hidden | Contract and financial reference numbers, who submitted reports or records, contractor contact details, every user profile. Enforced in the database (migration 005: column-level grants for the anonymous role), not only in the screens. |

**Entry splash:** 10 seconds in total, counted from the click on **Sign in** (the sign-in happens while it plays). A wrong password closes it and shows the error.

**Not yet** (later weeks): 360° images, GIS map, automatic flags, audit findings, reports.

| Layer | Tech |
|---|---|
| Frontend (`client/`) | React 18, Vite, Tailwind CSS, Headless UI, react-day-picker |
| Backend (`server/`) | Node.js, Express, zod validation, helmet, rate limiting |
| Database (`database/`) | Supabase PostgreSQL, Auth, Storage, Row Level Security |

Supabase project: **IPMATS** (`indtgynilfigtqaljblc`). Migrations `001`–`006` and the Week 1 + Week 2 sample data are **already applied**.

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

### Demo accounts (password `Dpwh360!Demo2026`)

| Email | Role | Use it to show |
|---|---|---|
| admin@dpwh360.local | System Administrator | User Management, approvals, offices, delete project |
| personnel@dpwh360.local | DPWH Personnel (North DEO) | Register and edit projects and contractors |
| personnel.south@dpwh360.local | DPWH Personnel (South) | Same as above, other office |
| auditor@dpwh360.local | Auditor | Read-only access to every record |
| applicant@dpwh360.local | Pending sign-up | "Awaiting approval" page; approve it as admin |
| public@dpwh360.local | Public | Public portal while signed in, My account |

Change or delete these accounts before real use.

### Tests

```powershell
npm test
```

Server: 47 tests (Week 1: schemas, auth and role guards, avatars; Week 2: overall completion, planned progress, finance summary and every server-side check). Client: 14 tests.

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
│   └── seed/        generate-seed.mjs → seed.sql   (11 municipalities, 124 barangays, 3 offices, 7 contractors, 16 projects)
│                    week2-seed.mjs → seed_week2.sql (phases, monthly progress reports, obligations, disbursements, VOs)
│                    public_demo_user.sql (public@dpwh360.local)
├── server/src/
│   ├── config/      env.js, supabase.js            Supabase connection (user client + service client)
│   ├── middleware/  auth.js, role.js, validate.js, upload.js, errorHandler.js
│   ├── routes/      projects, contractors, agencies, admin (users, /me), progress, finance, schemas.js
│   ├── controllers/ projects, contractors, reference (agencies), users, phases (Week 2), finance (Week 2)
│   ├── services/    avatars.js, completion.js (Week 2 formula), validationRules.js (Week 2 checks)
│   └── tests/
└── client/src/
    ├── pages/public/ PortalHome, PublicProjectPage
    ├── pages/auth/   LoginPage, RegisterPage, AccountPendingPage
    ├── pages/dpwh/   ProjectsPage, ProjectFormPage, ContractorsPage, AgenciesPage, ProgressPage, FinancePage
    ├── pages/dpwh/project/  ProjectLayout (tabs), OverviewTab, ProgressTab (Week 2), FinanceTab (Week 2)
    ├── pages/admin/  UsersPage
    ├── pages/shared/ DashboardPage, AccountPage
    ├── context/      AuthContext (session, role), ToastContext
    └── routes/       ProtectedRoute (role-based pages)
```

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
| Approve sign-ups, manage users | ✓ | — | — | — |
| View phases, progress history, finances (Week 2) | ✓ | ✓ | ✓ | — |
| Set up phases, submit progress, add financial record (Week 2) | ✓ | ✓ | — | — |
| Delete a financial record (Week 2) | ✓ | — | — | — |

4. `middleware/validate.js` + `routes/schemas.js` (zod) reject bad input (e.g. contract amount above the approved budget, coordinates outside Occidental Mindoro). Week 2 adds `services/validationRules.js`, which checks progress and financial records against the project's current data before saving.
5. **Reads** run as the user, so **Row Level Security** in the database also enforces access. **Writes** use the service-role key, which never leaves the server.
6. Sign-up never grants a role: the database trigger `handle_new_user` stores the *requested* role and sets the account to `pending` until an admin approves it.

## Supabase settings

- Authentication → Sign In / Providers: keep **Allow new users to sign up** and **Confirm email** on.
- Authentication → URL Configuration: Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/login`.
- Without custom SMTP, Supabase sends only a few emails per hour. Use custom SMTP for the demo if you will register several new accounts.
