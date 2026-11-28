# Features

Every feature of IPMATS (InfraWatch PH), page by page. Each entry says what it is called in the app, why it exists,
who uses it, what it does, and what it touches. API routes are relative to `/api`.

- Exact rights per role: [roles-and-permissions.md](roles-and-permissions.md)
- Tables and columns: [database.md](database.md)
- Step-by-step flows: [workflows.md](workflows.md)

The app has four parts:
- **Public portal** (`/`, `/projects`, `/map`, `/report-status`): open to everyone, no account. Top navigation bar.
- **Staff workspace** (`/app/...`): for signed-in, approved Admins, DPWH Personnel and Auditors. Left sidebar.
- **Contractor workspace** (also `/app/...`, 029): for signed-in, approved contractor representatives, on their own
  company's projects only. Its own short sidebar. See [Contractor workspace](#contractor-workspace) below.
- **PACC portal** (`/pacc/...`): for signed-in PACC accounts only (Presidential Anti-Corruption Commission). Left
  sidebar, the same look as the staff workspace. See [PACC portal](#pacc-portal) below.

---

## Public portal

The portal exists for transparency: anyone can see where DPWH projects in Occidental Mindoro are, who builds them,
what they cost and how far along they are, without signing in. It shows only public fields. A project's flag is
shown only after an auditor has confirmed or overridden it ("Under review" before that). The automatic flag and its
reasons, audit findings, finance records, phases, progress reports and logs are never sent to it (enforced by the database, see
[roles-and-permissions](roles-and-permissions.md#3-row-level-security-the-real-enforcement-point-for-reads)).
The one finance exception (031) is the project's **liquidation**: the summary and the receipts the Auditor accepted,
computed by the API (see the drawer below).

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
  list can be shared. Clicking a card opens the Project map with that project selected. A Completed project's
  status reads "Completed – awaiting verification" (at most 99 %) or "Completed – verified" (100 %), from
  `v_public_projects.completion_verified_at` (030); the public never sees the verification history.
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
    - Status and physical progress, with start and target dates (a Completed project reads "Completed – awaiting
      verification" or "Completed – verified", see [Completion verification](#completion-verification)).
    - Contract cost.
    - **Bidding** (032, `components/public/PublicBidding.jsx`, `GET /public/projects/:id/bidding`): the abstract
      of bids, newest round first. Each round shows its number, status, opening date and ABC; an **open** round
      shows "Bidding open" and "The bids are shown once they are evaluated." (the API sends no bids for it). Once a
      round is no longer open (evaluated, awarded or failed): every bidder with its amount, eligibility (and the reason a bid failed), rank and the
      "Winner"; a failed round shows the reason for the failure of bidding, an awarded one its award date. No ids,
      round notes or names of DEO staff are sent. "No bidding is recorded for this project." when there is none
      (for example a project registered with its contractor). If the call fails, the rest of the drawer still
      shows, with a "Try again" link.
    - **Liquidation** (031, `components/public/PublicLiquidation.jsx`): the % liquidated with a bar, the money
      released (disbursed + expenses), the amount backed by accepted receipts, the amount not yet liquidated, an
      "Over-liquidated by ₱X" note when accepted receipts exceed the records, and the **accepted receipts** (amount,
      record type, receipt date, description, a PDF or image icon from the file type, and an "Open" link to the file
      in a new tab, valid for 10 minutes). Submitted and returned receipts are never sent, nor the file name, the
      uploader, the reviewer or the review note. "No accepted receipts yet." when there are none. If the call fails,
      the rest of the drawer still shows, with a "Try again" link.
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
  - API: `GET /public/map`, `GET /public/projects/:id`, `GET /public/projects/:id/liquidation` (031),
    `GET /public/projects/:id/bidding` (032).
  - Data: `v_public_projects` (including `pacc_public_status`, migration 024), `site_images` (every photo; public
    as soon as it is uploaded); files in the `panoramas` bucket through expiring signed links; accepted
    `finance_receipts` (read by the API with the service role) in the `finance-receipts` bucket.

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
- **Who:** DPWH personnel, auditors and (029) contractor representatives register. Anyone with an account signs in.
- **What it does:**
  - **Register:** asks for name, email, password, the account type (DPWH Personnel, Auditor or Contractor
    representative), position, and an optional photo. Staff choose their office. A contractor representative
    chooses the company instead (from the active companies, `GET /reference/contractors`, names only) and types
    the company's PCAB licence number; the System Administrator compares it with the company's record. Every
    registration creates a request, not an account with access (see
    [registration and approval](roles-and-permissions.md#registration-and-approval)).
    - The request is sent as sign-up metadata that the `handle_new_user` trigger reads: `requested_role`, and for
      a contractor `requested_contractor_id` and `requested_contractor_license` (no office). A company that does
      not exist makes the request invalid (declined with a note to choose the company again).
    - The photo is kept on the device (IndexedDB) and uploaded at the first sign-in **after the account is
      approved**. Pending and declined accounts cannot upload a profile photo.
  - **Sign in:** shows a 5-second entry screen, then opens the staff dashboard (a contractor's own dashboard for a
    contractor account). Accounts without a role go to the public portal instead. Suspended accounts see a
    suspension message.
  - **Awaiting approval:** shows the status of the request (with the requested company for a contractor), or the
    reason it was declined.
- **Touches:**
  - Pages: `pages/auth/LoginPage.jsx`, `RegisterPage.jsx`, `AccountPendingPage.jsx`, `context/AuthContext.jsx`.
  - Supabase Auth (sign-up, sign-in), and `GET /me`, `POST /me/avatar`, `GET /reference` (office list),
    `GET /reference/contractors` (company list). The sign-up metadata is built by `lib/contractor.js`
    `signUpMetadata()`.
  - Data: `profiles` (created by the `handle_new_user` trigger), `agencies`, `contractors`, bucket `avatars`.

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
- **In the UI:** "Project Management" (`/app/projects`), "Register project", and the project page with seven tabs.
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
    - **After a bidding award (032):** the contractor and the contract amount are read-only, each with the note "The
      contractor and contract amount were set by the bidding award." (the form reads `contract_locked` from
      `GET /projects/:id/bidding`; the API also answers 409 with that message to a different value). While a round
      is in progress the contractor field says the award sets it. Projects without an award are edited as before.
      See [Bidding](#bidding-project-tab).
    - The status is **automatic** (Not started, On-going, Delayed, Completed). When registering a project, staff
      may choose Automatic, Not started or On-going as the starting status; the next evaluation (a progress
      report, a photo, or the daily check) recalculates it from the Notice to Proceed and progress. Completed is
      never chosen by hand: it is set once every phase is at 100%, with a completion date and a final as-built
      photo. The Suspended and Terminated statuses were removed (no project used them); editing a project
      cannot set a status.
    - **Completed – awaiting verification / Completed – verified (030):** a Completed project shows at most 99 %
      and the status "Completed – awaiting verification" until both the Auditor and PACC verify it, then 100 % and
      "Completed – verified" ([Completion verification](#completion-verification)). The labels are on the project
      header and Overview, the project list, Progress and Financial Monitoring, the flag review queue, the map
      panel, the contractor list, the contractor dashboard, the PACC investigation page and the public cards and
      drawer (`StatusBadge` with `completion_verified_at`). The status at a past flag check stays "Completed".
    - **Progress locked:** once verified, the header shows "Progress locked" and the Phases & progress and 360°
      images tabs hide their editing buttons with the message "This project's completion was verified; its
      progress and photos can no longer change." Finance records and documents can still be added. On the Edit
      form the actual completion date is disabled, with the same message (other fields stay editable).
  - **Project page tabs:** Overview, Bidding, Phases & progress, Finance, 360° images, Flag & audit, Documents
    (described below). Auditors see a "Read-only" label. The editing buttons of every tab (phases, progress, adding finance
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

### Bidding (project tab)
- **In the UI:** the project tab "Bidding" (`/app/projects/:id/bidding`, 032), between Overview and Phases &
  progress.
- **Why:** a record of how each contract was awarded (instructor checklist: "Bidding of project contract"), and the
  public abstract of bids.
- **Who:** DPWH Personnel record the bidding. The Admin and the Auditor read it; a contractor reads it on its own
  company's projects (read only); PACC reads it on its investigation page; the public reads the abstract of bids.
  Exact rules: [roles-and-permissions.md, footnote 18](roles-and-permissions.md).
- **What it does:**
  - **Summary:** "Not yet awarded" (no contractor), the round in progress, "Awarded in round N to <contractor> at
    ₱X" (the contractor and contract amount come from the award), or, for a project registered with its
    contractor, "This project already has a contractor." (no round can be opened).
  - **Rounds** (newest first): round number, status chip (Open, Evaluated, Awarded, Failure of bidding), the
    opening date of bids, the ABC (the approved budget when the round was opened), notes, the reason for a failure
    of bidding, and "Awarded to … at ₱X on <date> by <name>".
  - **Bids table** per round: contractor (with "Winner" on the awarded bid, and a line when the contractor is now
    inactive), rank (passed bids by amount, lowest = 1; equal amounts share a rank), bid amount with an "Above the
    ABC" warning, and the eligibility chip (Pending, Passed, Failed) with its note.
  - **Personnel buttons**, shown from the API's `permissions` and each round's `actions`, so the page never offers
    what the API would refuse:
    - **Open a bidding round** (opening date of bids, notes) when the project has no contractor and no round in
      progress. **Edit round** (opening date, notes) while it is open.
    - **Add bid** while the round is open: a contractor from the active contractors that have no bid in the round
      yet (new bidders are added on the Contractors page first) and the amount; a bid above the ABC can be
      recorded, with a warning that it cannot pass. **Change** (amount) and **remove** a bid while the round is
      open.
    - **Eligibility** (open or evaluated round): passed, failed with a reason (5–500 characters), or back to
      pending while the round is open. A bid above the ABC cannot pass ("A bid above the ABC cannot pass.").
    - **Evaluate** (open round): switched off, with the reason under the round, until every bid is passed or
      failed ("Set every bid to passed or failed before evaluating."); a confirmation says the bids can then no
      longer be added, changed or removed.
    - **Award** (evaluated round): switched off with the API's reason (for example a tie for the lowest amount, or
      "This project already has a contractor."). The confirmation names the contractor and amount and explains
      that the award sets the project's contractor and contract amount, that the round becomes final, and that the
      two can no longer be changed in the project form (contract changes go through variation orders). It awards
      the rank-1 passed bid only.
    - **Failure of bidding** (open or evaluated round) with a reason (5–500 characters); a new round can then be
      opened. Awarded and failed rounds are final: no buttons.
  - Every dialog shows the API's message when it refuses (for example "This bidding round is closed." after
    someone else closed it), and every write answers with the whole bidding, which the tab shows at once. After
    an award the project header and Overview reload with the new contractor.
  - **PACC:** the same rounds and bids, read-only, on the [Investigation page](#investigation-page).
  - **Public:** the abstract of bids in the project drawer ([Project map (public)](#project-map-public)).
- **Touches:**
  - Pages and components: `pages/dpwh/project/BiddingTab.jsx`, `components/bidding/BiddingRounds.jsx`,
    `components/public/PublicBidding.jsx`, `pages/dpwh/ProjectFormPage.jsx` (the lock), `pages/pacc/PaccProjectPage.jsx`;
    helpers in `lib/bidding.js`.
  - API: `GET /projects/:id/bidding`, `POST /projects/:id/bidding/rounds`, `PATCH /bidding/rounds/:roundId`,
    `POST /bidding/rounds/:roundId/bids`, `PATCH` / `DELETE /bidding/bids/:bidId`,
    `POST /bidding/rounds/:roundId/evaluate`, `/fail`, `/award`; `GET /public/projects/:id/bidding`;
    `GET /pacc/projects/:id` (`bidding`).
  - Data: `bidding_rounds`, `bids`, the database function `award_bidding_round` (sets the round awarded and the
    project's `contractor_id` and `contract_amount` in one transaction), `projects`, `contractors`.

### Progress Monitoring
- **In the UI:** "Progress Monitoring" (`/app/progress`) and the project tab "Phases & progress".
- **Why:** Objective 3 — track progress phase by phase instead of a single number someone types in.
- **Who:** all staff view. Personnel set up phases and submit progress (027: not the Admin). The project's
  contractor also submits progress, without the completion date ([Contractor workspace](#contractor-workspace)).
- **What it does:**
  - **Progress Monitoring list:** every project's completion bar, with a status filter and sorting.
  - **Set up phases:** a template for the project type is filled in, with dates spread over the contract.
    The weights must total 100 %.
  - **Sub-activities (030, Personnel only):** in "Edit phase plan" each phase can get sub-activities (name and
    weight, up to 20). Their weights must add up to 100, with a running total ("Sub-activity weights in a phase
    must add up to 100."). A phase with sub-activities shows its % as computed: Σ(weight × accomplishment) ÷ 100,
    to 2 decimals; it cannot be typed. New sub-activities start at 0 %, except a phase's first ones, which start
    at the phase's current % (so the phase does not drop). A sub-activity with reported work can be removed only
    together with all the others (the phase then keeps its current %). The phase table lists each phase's
    sub-activities under it.
  - **Submit progress update:** enter each phase's accomplishment, or, for a phase with sub-activities, each
    sub-activity's % (the phase's % is shown computed, read only). The new overall percentage is shown before
    saving, at most 99 % until the completion is verified (the computed figure is named under it). Lowering a figure (phase or sub-activity) needs a written reason. Every report also needs:
    - a **description of the work done**, 10–2000 characters, with a counter;
    - **1–5 reference photos** (JPEG, PNG or WebP, up to 10 MB each), with previews before sending ("Attach 1 to 5
      reference photos."). The server checks the actual bytes. They are stored in the private `progress-photos`
      bucket and shown to staff, PACC and the project's contractor through links that expire after an hour;
      never to the public.
    The form is sent as multipart (`payload` JSON + `photos`); the server's messages are shown in the form.
  - **Tab contents:** planned vs actual, slippage and the report history. Each report shows the work done (and
    the number of photos); opening a row shows the description, the remarks, the reference photos (each opens in
    a new tab) and the phases at that date with their sub-activities. Reports from before 030 have no description,
    photos or sub-activity breakdown and still show as before.
  - **Completed and verified:** a Completed project shows "Completed – awaiting verification" under the overall
    figure (99 % at most). Once verified the tab hides "Edit phase plan" and "Submit progress update" and shows
    the lock message.
  - How the percentage is computed: [workflows → progress reporting](workflows.md#progress-reporting).
- **Touches:**
  - Pages and components: `pages/dpwh/ProgressPage.jsx`, `project/ProgressTab.jsx`,
    `components/progress/ReferencePhotosInput.jsx`, `ReportPhotos.jsx`; helpers in `lib/progress.js`.
  - API: `GET/PUT /projects/:id/phases`, `GET/POST /projects/:id/progress`, `GET /projects`.
  - Data: `project_phases`, `phase_activities`, `progress_updates` (`description`, `activity_snapshot`),
    `progress_photos`, bucket `progress-photos`, `projects.overall_progress`.

### Financial Monitoring
- **In the UI:** "Financial Monitoring" (`/app/finance`) and the project tab "Finance".
- **Why:** Objective 4 — follow budgets, payments and fund use, and spot payments running ahead of the work.
- **Who:** all staff view. Personnel add records (027: not the Admin). Admin deletes a wrong record. Receipts
  (031): DPWH Personnel and the project's contractor upload, the Auditor accepts or returns.
- **What it does:**
  - **Totals:** approved budget, contract amount (with variation orders), disbursed, remaining balance, and an
    overall utilization bar.
  - **Project table:** one row per project, with filters by municipality, office and status, and sorting
    (including "paid ahead of work" and "Liquidated %"). The **Liquidated** column (031) shows the % of
    disbursements + expenses backed by accepted receipts and the amount (unliquidated on hover); the total row
    shows the portfolio's %.
  - **Project Finance tab:** summary cards, a utilization breakdown, physical vs financial progress, the list of
    records, and the form to add a variation order, obligation, disbursement or expense.
    - A record can be tied to a construction phase; the tab shows the totals per phase.
    - The API refuses records that break the rules, for example disbursements above the contract amount, or
      variation orders above 10 % of the original contract.
  - **Finance liquidation (031)**, where the contract amount went, shown by receipts:
    - **Liquidation card:** revised contract amount, disbursed, other expenses, the amount to liquidate
      (disbursed + expenses), liquidated (accepted receipts only, capped per record), unliquidated (never below 0),
      the % liquidated with a bar, an "Over-liquidated by ₱X" note, and the counts of accepted, awaiting-review
      (Submitted) and returned receipts.
    - **Per record:** each disbursement and expense shows its status (Unliquidated, Partly liquidated or
      Liquidated, with the % and amount and any over-liquidation) and a **Receipts (n)** toggle ("· n awaiting
      review" when some wait). Obligations and variation orders show "Not needed" (their papers go in Documents).
    - **Receipts list:** status chip (Submitted, Accepted, Returned with the Auditor's reason), amount, receipt
      date, description, "Uploaded by <name>" ("(Contractor)" for a contractor), and an "Open" link that opens the
      file in a new tab (signed, one hour).
    - **Upload receipt** (shown when the API's `permissions.can_upload_receipts` is true: DPWH Personnel, and the
      project's contractor): file (PDF, JPEG, PNG or WebP, at most 15 MB), amount (more than 0), receipt date (not
      in the future) and an optional description (at most 500 characters), with the reminder "Before uploading,
      cover personal information such as names of private persons, TIN and home addresses. Accepted receipts are
      shown to the public." The dialog checks the fields first; the API checks again (including the file's bytes)
      and its message is shown as it comes. A new receipt is Submitted.
    - **Accept / Return** (the Auditor only, `permissions.can_review_receipts`) on Submitted receipts. Accepting
      asks for confirmation (an accepted receipt counts as liquidated, is public and can no longer change). Return
      asks for a reason of 5–500 characters. A returned receipt stays as history; the uploader uploads a new one.
    - **Delete** a receipt (the API's `can_delete`): its uploader while not accepted, the Admin any not accepted.
      Accepted receipts are never deleted on their own; deleting the financial record removes them.
    - Finance is not locked by completion verification.
- **Touches:**
  - Pages: `pages/dpwh/FinancePage.jsx`, `project/FinanceTab.jsx`; components `components/finance/Liquidation.jsx`,
    `components/finance/UploadReceiptModal.jsx`; helpers `lib/liquidation.js`.
  - API: `GET /finance/overview`, `GET/POST /projects/:id/finance`, `DELETE /projects/:id/finance/:recordId`;
    `POST /projects/:id/finance/:recordId/receipts`, `POST /finance/receipts/:receiptId/accept`,
    `POST /finance/receipts/:receiptId/return`, `DELETE /finance/receipts/:receiptId` (031).
  - Data: `financial_records`, `v_project_summary`, `finance_receipts`, bucket `finance-receipts`.

### 360° images (project tab)
- **In the UI:** project tab "360° images".
- **Why:** Objective 2 — field evidence of the real site condition, with checks that the photo is genuine.
- **Who:**
  - All staff view.
  - Personnel upload, caption and mark a photo as final (027: not the Admin).
  - The project's contractor uploads too (029), never as final as-built ([Contractor workspace](#contractor-workspace)).
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
  - **Public at once:** a photo uploaded by DPWH personnel or the project's contractor appears on the public portal right away. Nobody
    approves or hides photos (migration 022); an Admin can delete a wrong upload.
  - **Final photo:** a photo marked **final** (as-built) is one of the requirements for a project to count as completed.
  - **Locked when verified (030):** once the completion is verified, upload, "Mark as final" and delete are hidden
    and the tab shows the lock message (the API refuses them with 409).
  - **Offline:** with no connection, a photo is kept on the device (IndexedDB). The top bar shows waiting uploads
    (Personnel and contractors, the accounts that upload photos), and they are sent automatically when the connection returns. Each photo is listed and sent
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
  - **Project "Flag & audit" tab:** the current flag and why, the completion verification card (below), the
    decision history, the findings, and the project's audit report (PDF).
- **Touches:**
  - Pages and components: `pages/auditor/AuditPage.jsx`, `project/FlagsTab.jsx`,
    `components/audit/ReviewFlagModal.jsx`, `FindingModal.jsx`, `CorrectiveActionModal.jsx`.
  - API: `GET /flags`, `POST /flags/recheck`, `GET /projects/:id/flags`, `POST /projects/:id/flags/review`,
    `GET /findings`, `GET/POST /projects/:id/findings`, `PATCH /findings/:findingId`, `…/action`, `…/public`,
    `GET /findings/assigned`, `GET /audit/assignees`.
  - Data: `projects` (flag columns), `flag_history`, `flag_reviews`, `audit_findings`, `system_settings`, bucket
    `audit-evidence`.

### Completion verification
- **In the UI:** the "Completion verification" card on the project's "Flag & audit" tab and on the PACC
  investigation page (030).
- **Why:** a finished project should not read 100 % until someone independent has seen it. A Completed project
  stays at 99 % ("Completed – awaiting verification") until both the Auditor and PACC verify it.
- **Who:** the Auditor decides on the Flag & audit tab; PACC decides on its investigation page. DPWH Personnel, the
  Admin and the project's contractor see the card read only. The public sees only the status label.
- **What it does:**
  - Shows both sides' current decision (Verified, Not yet with its reason, or No decision yet), who and when, and
    the full history, newest first. PACC decisions always read "PACC" (no member is named). A decision made before
    the project last became Completed is greyed out: it no longer counts.
  - **Verify completion** asks for confirmation. **Not yet** asks for a reason (5–500 characters, with a counter).
    Either side can decide first; a side that already verified cannot verify again (it can still record Not yet).
  - PACC cannot verify while the project has an open PACC case: the button is disabled with "Close the PACC case
    before verifying completion."; Not yet stays allowed.
  - When both have verified, the project becomes 100 %, "Completed – verified", and its progress, phase plan and
    360° photos are locked. If a PACC case is open at that moment, the decision is recorded and the server's
    message is shown: "Recorded. The project becomes verified once its PACC case is closed." Staff and PACC see
    that the project waits for the PACC case. The project's contractor never learns that a case is open: its card
    says "Both sides verified; the verification is being finalised.", and the API strips every PACC-case field
    from its `GET /projects/:id/completion-verification` answer (`stateForViewer`).
  - Before the project is Completed the card says that verification opens once it is.
- **Touches:** `components/progress/CompletionVerificationCard.jsx`, `lib/progress.js` (`verificationCard`),
  `project/FlagsTab.jsx`, `pages/pacc/PaccProjectPage.jsx`; `GET/POST /projects/:id/completion-verification`,
  `POST /pacc/projects/:id/completion-verification`, `GET /pacc/projects/:id` (`completion_verification`);
  `completion_verifications`, `projects.completed_at`, `projects.completion_verified_at`.

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
    - **Contractor requests (029):** the list shows the requested company and warns when the licence does not
      match. The approve dialog shows the requested company, the licence typed at sign-up, the licence on file
      and whether they match (`requested_contractor_license_matches`), and asks the Admin to confirm the company
      or choose another. The Contractor role always needs a company.
  - **Accounts:** create an account directly, or edit its name, role, office and position. The role list has
    Contractor next to the staff roles; choosing it shows a required company select (from the contractor list,
    inactive companies marked). The list shows a contractor account's company under its role.
  - **Suspend:** with a reason; it blocks sign-in and every API call. Lift the suspension later.
  - **Delete:** only accounts with no records in the system.
  - **Find accounts:** search, and filter by role (Contractor included), status and approval.
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

## Contractor workspace

Contractor accounts (migrations 028, 029) let a contractor company's representative report progress, upload 360°
photos and (031) upload finance receipts for **their own company's projects only**. They work in `/app`, with their own sidebar. Everything else in
`/app` sends them back to their dashboard (`lib/contractor.js` `canOpenWorkspacePath`, used by `ProtectedRoute`).
That is a convenience only: RLS (`private.contractor_company()`) and the API (`PROJECT_VIEWERS`,
`PROJECT_REPORTERS` + `requireOwnProject`) are what keep other companies' projects and the staff pages closed.

- **Who:** an active, approved `contractor` account whose company is active. Pending, declined, suspended or
  deactivated accounts cannot open `/app`. A contractor of an **inactive company** can sign in but sees no
  projects at all (RLS returns nothing), and the dashboard says so.
- **Sidebar:** Dashboard, My projects, My account. The top bar shows "Contractor · <company>" and the waiting
  offline uploads. The account menu calls the area "Contractor workspace".
- **Never shown:** other companies' projects, the staff dashboards and charts, the map, Progress and Financial
  Monitoring, Flags & Audit, reports (including the project audit-report PDF), contractors, offices, users,
  settings, activity logs, deletion requests, and anything PACC (no PACC case chip).

### Dashboard (contractor)
- **In the UI:** "Dashboard" (`/app` for a contractor account).
- **What it does:** counters (projects, behind schedule, Yellow or Red flag, no 360° photo in 30 days) and one row
  per project: flag, status ("Completed – awaiting verification" / "Completed – verified" for a Completed project),
  completion against the plan ("planned X % · N pts behind"; a Completed project is never behind), target completion date,
  latest photo date, and shortcuts to the Phases & progress and 360° images tabs. With no projects, it says that no
  projects of the company are shown (or that the company is marked inactive) and to contact the DPWH District
  Engineering Office if they expected some.
- **Touches:** `pages/contractor/ContractorDashboardPage.jsx`, `lib/contractor.js`
  (`contractorDashboardSummary`, `contractorEmptyMessage`); `GET /projects` (`planned_progress`,
  `latest_inspection_date`), `GET /me` (`contractor`).

### My projects
- **In the UI:** "My projects" (`/app/projects` for a contractor account), titled with the company name.
- **What it does:** the project list with search, sorting and the filters (no contractor filter, no "Register
  project"). Opens the project page.
- **Project page tabs** (`lib/contractor.js` `projectPermissions`):
  - **Overview:** read only.
  - **Bidding** (032): the rounds and bids of the company's project (every bidder, amount, eligibility, rank and
    the winner), read only.
  - **Phases & progress:** view, and "Submit progress update" (per sub-activity where the phase has them, with the
    description and 1–5 reference photos). No phase-plan or sub-activity editing. When every phase reaches
    100 % the form says that DPWH Personnel confirm the completion date; it has no completion-date field (the API
    answers 403 "Only DPWH Personnel can confirm a project's completion." to a contractor that sends one).
  - **360° images:** view and "Upload 360° image" (with the same checks and offline queue as Personnel, and a
    caption). No "Final as-built" checkbox, no "Mark as final", no delete.
  - **Finance:** view the records and the liquidation, and (031) **upload receipts** for the project's
    disbursements and expenses (with the privacy reminder), and delete its own receipts while they are not
    accepted. No adding or deleting records, no Accept / Return.
  - **Flag & audit:** the flag, its reasons, the completion verification, the auditor decisions, findings and
    history, view only (no review, findings, verification or audit-report PDF).
  - **Verified projects:** no progress report or photo upload (the lock message is shown instead).
  - **Documents:** view and download only.
- **Labels for staff:** progress reports and photos submitted by a contractor show "by <name> (Contractor)"
  (`submitted_by_role`, `uploaded_by_role`).
- **Touches:** `pages/dpwh/ProjectsPage.jsx`, `project/ProjectLayout.jsx` and its tabs; the project read routes,
  `POST /projects/:id/progress`, `POST /projects/:id/images`, `POST /projects/:id/finance/:recordId/receipts` and
  `DELETE /finance/receipts/:receiptId`.

### My account (contractor)
- Same as the staff [My account](#my-account), and it shows the company the account represents (changed by the
  System Administrator only).

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
  reports with their proof photos (expiring signed links), and, read-only, the bidding of the contract (032: every
  round with its ranked bids, eligibility and the award; no buttons), the construction phases, the 50 most
  recent progress reports (with the work done and the reference photos, which open in a new tab), the sub-activities
  of each phase, the financial records with a summary, the liquidation and receipts (031: the liquidation summary
  and every receipt of each disbursement and expense, in any status, with the uploader, the review note and an
  "Open" link in a new tab; no accept, return or delete), the 360° photos (each opens full size in a new
  tab) and the supporting documents. Opening it marks new reports "Under review". The
  [Completion verification](#completion-verification) card lets PACC verify a Completed project or record
  "Not yet" (verify is disabled while a PACC case is open). PACC can
  close one report, or all open reports of the project, with an outcome (valid, invalid, duplicate), and open a
  case on the project, attaching open reports to it.
- **Touches:** `pages/pacc/PaccProjectPage.jsx`, `components/pacc/OpenCaseModal.jsx`, `components/pacc/ProjectRecords.jsx`; `GET /pacc/projects/:id`,
  `POST /pacc/reports/:reportId/close`, `POST /pacc/projects/:id/reports/close-all`, `POST /pacc/projects/:id/cases`,
  `POST /pacc/projects/:id/completion-verification`;
  buckets `citizen-reports`, `panoramas`, `project-documents`, `progress-photos` and `finance-receipts` (signed links).

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
