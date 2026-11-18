# IPMATS — DPWH 360° Infrastructure Project Monitoring and Transparency System

**Week 1 build (November 5–12, 2026), Objective 1:**
> To develop a centralized platform with secure user login and registration for managing infrastructure project information, including contractors, budgets, agencies, and project duration.

This repository grows **week by week** until it matches the full DPWH 360° system. Week 1 contains only what the Week 1 tasks require:

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

**Not in Week 1** (added in later weeks): construction phases, financial records, 360° images, GIS map, automatic flags, audit findings, reports, public portal.

| Layer | Tech |
|---|---|
| Frontend (`client/`) | React 18, Vite, Tailwind CSS, Headless UI, react-day-picker |
| Backend (`server/`) | Node.js, Express, zod validation, helmet, rate limiting |
| Database (`database/`) | Supabase PostgreSQL, Auth, Storage, Row Level Security |

Supabase project: **IPMATS** (`indtgynilfigtqaljblc`). The three Week 1 migrations and the seed are **already applied**.

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

Change or delete these accounts before real use.

### Tests

```powershell
npm test
```

Server: 17 tests (schemas, auth and role guards, avatar processing). Client: 14 tests.

---

## Folder structure

```
ipmats-system/
├── database/
│   ├── migrations/  001_week1_core_schema.sql      tables: municipalities, barangays, agencies, profiles, contractors, projects
│   │                002_week1_access_control.sql   roles, Row Level Security, grants, v_project_summary view
│   │                003_week1_profile_photos.sql   private avatars bucket
│   └── seed/        generate-seed.mjs → seed.sql   (11 municipalities, 124 barangays, 3 offices, 7 contractors, 16 projects)
├── server/src/
│   ├── config/      env.js, supabase.js            Supabase connection (user client + service client)
│   ├── middleware/  auth.js, role.js, validate.js, upload.js, errorHandler.js
│   ├── routes/      projects, contractors, agencies, admin (users, /me), schemas.js
│   ├── controllers/ projects, contractors, reference (agencies), users
│   ├── services/    avatars.js
│   └── tests/
├── client/src/
│   ├── pages/auth/   LoginPage, RegisterPage, AccountPendingPage
│   ├── pages/dpwh/   ProjectsPage, ProjectFormPage, ProjectDetailPage, ContractorsPage, AgenciesPage
│   ├── pages/admin/  UsersPage
│   ├── pages/shared/ DashboardPage, AccountPage
│   ├── context/      AuthContext (session, role), ToastContext
│   └── routes/       ProtectedRoute (role-based pages)
└── docs/WEEK-1.md    task → file map and video demo script per member
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

4. `middleware/validate.js` + `routes/schemas.js` (zod) reject bad input (e.g. contract amount above the approved budget, coordinates outside Occidental Mindoro).
5. **Reads** run as the user, so **Row Level Security** in the database also enforces access. **Writes** use the service-role key, which never leaves the server.
6. Sign-up never grants a role: the database trigger `handle_new_user` stores the *requested* role and sets the account to `pending` until an admin approves it.

## Supabase settings

- Authentication → Sign In / Providers: keep **Allow new users to sign up** and **Confirm email** on.
- Authentication → URL Configuration: Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/login`.
- Without custom SMTP, Supabase sends only a few emails per hour. Use custom SMTP for the demo if you will register several new accounts.
