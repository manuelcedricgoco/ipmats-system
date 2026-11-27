# IPMATS system documentation

IPMATS (shown in the app as **DPWH 360°**) is the Infrastructure Project Monitoring and Transparency System for
DPWH projects in Occidental Mindoro. Staff keep project records, progress, payments and 360° site photos up to
date. The system flags delays and discrepancies automatically, and auditors review the flags. The public can
browse every project without an account.

These pages describe the system as it is in the code and the live database on 22 November 2026, updated on
25 November 2026 for the security fixes merged in pull request #3 (migrations 019 and 020, applied to the live
database the same day), and on 27 November 2026 for the PACC portal and anonymous citizen reports ("Magsumbong",
migrations 023–025).

| File | What it covers |
|---|---|
| [features.md](features.md) | Every feature, page by page (public portal, staff portal and PACC portal): why it exists, who uses it, what it touches; plus what is not finished |
| [database.md](database.md) | Entity-relationship diagram, every table and column, keys, enums, Row Level Security, storage buckets and the migration history |
| [roles-and-permissions.md](roles-and-permissions.md) | The roles, a permission matrix, registration and approval, and where each rule is enforced |
| [workflows.md](workflows.md) | Diagrams of the main flows: registration, project lifecycle, progress reporting, flags and audit, public browsing, reports |
| [tech-stack.md](tech-stack.md) | Libraries and services with their versions and reasons, map and imagery licences, and an architecture diagram |

Suggested reading order for a first-time reader or a panelist: this page → features → roles and permissions →
workflows → database → tech stack.

How to install and run the system is in the root [README.md](../../README.md).

## What could not be verified

These points were not checked, or could not be checked, while writing these pages. They are marked where they
appear.

- **Email confirmation at sign-up.** Whether Supabase requires new users to confirm their email is an Auth
  setting in the Supabase dashboard; it cannot be read from the database or the code. The Register page handles
  both cases.
- **How three storage buckets were created.** `panoramas`, `audit-evidence` and `project-documents` exist in the
  live project, but no migration creates them (migrations only update their limits). See
  [database.md → File storage](database.md#file-storage).
- **Behaviour in a real browser.** The pages were checked by reading the code, not by clicking through them.
- **Licences of external services.** The licences of the npm packages are taken from the lock files. The
  OpenStreetMap tile and Nominatim usage policies were not re-read for this document.
