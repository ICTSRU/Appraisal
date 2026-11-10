# SRU Performance Appraisal · v2.0
منصة المتابعة والتقييم السنوي للأداء — ICTD / ITOC · Google Sheet backend (Apps Script) · @sr.edu.sa only

| Page | URL |
|---|---|
| Evaluation & follow-up | `<exec URL>` |
| Dashboard (separate page) | `<exec URL>?page=dashboard` |
| Sign-in landing (GitHub Pages) | `index.html` — shows the ITOC sign-in screen, then opens the `/exec` URL |

## Folder
```
v1.1/
├─ index.html                 GitHub Pages landing (set WEB_APP_URL)
├─ apps-script/               pushed to Apps Script (manually or by the GitHub Action)
│   Code.gs  access kit, routing, menu   · Api.gs  data + server calls · Calc.gs  scoring · Seed.gs  2025/2026 import
│   Index.html  Dashboard.html  Style/Header/Brand/Chrome/Footer/Logos/Denied.html · appsscript.json
├─ assets/                    logos (from ICTSRU/brand)
├─ tools/build_seed.py        regenerates Seed.gs from the Excel files
├─ tools/test/                unit + browser tests (node)
└─ .github/workflows/         auto-deploy (same as the SOP platform)
```

## Setup (≈10 min)
1. Create a Google Sheet **"ICTD Performance Appraisal"** → Extensions ▸ Apps Script → paste every file of `apps-script/` (or use clasp / the Action).
2. Reload the Sheet → menu **SRU Performance Appraisal ▸ 1) تهيئة المنصة** (creates the tabs and loads 2025 + 2026) → **2) AllowedUsers**.
3. In **AllowedUsers** add each person: `email · name · role · active` — roles below. The owner (`OWNER_EMAILS`) is always admin.
4. Deploy ▸ New deployment ▸ Web app · Execute as **Me** · Who has access **Anyone within Sulaiman Al Rajhi University**. Copy the `/exec` URL.
5. Put the URL in `index.html` (`WEB_APP_URL`) and publish the repo with GitHub Pages. For auto-deploy follow `AUTODEPLOY` steps of the SOP platform (secrets `CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`).

## Roles & permissions (enforced on the server)
| Role (UI label) | Can |
|---|---|
| `admin` — مدير | everything: users, audit log, years, employees, criteria, bands, approve/reopen, edit approved periods |
| `evaluator` — محرّر | enter the "manager" criteria, write comments, manage follow-ups — in **draft** periods only |
| `cio` — تقييم الـ CIO | enter the "CIO" criterion + follow-ups (no comments) — draft periods only |
| `viewer` — مطّلع | read-only (evaluation page + dashboard) — appraisals are HR-sensitive: grant sparingly |

The single source of truth is the `PERMS` table in `apps-script/Code.gs`; every `api*` call goes through `requirePerm_()`.
The owner(s) in `OWNER_EMAILS` are always admin and cannot be edited or deleted from the UI; nobody can change their own role or delete themselves.
**Users** are managed in the platform (tab «المستخدمون») — it edits the `AllowedUsers` sheet and takes effect immediately.

## Audit log
Sheet `AuditLog` (tab «سجل التدقيق», admin): time · user · role · action · target (year/period/employee/ref) · old → new · details.
Covers scores, comments, approve/reopen, years, employees, criteria, bands, follow-ups, users, setup, year clears and **refused attempts** (`denied`).
Rows are only ever appended by the platform; keep the Sheet itself editable by few people (anyone with edit access to the Sheet can alter it).

## Scoring (same as the workbook)
Quarter total = Σ item scores (max 100). Annual item = average of scored quarters; annual total = Σ items.
Differences from Excel, by design: blank ≠ 0 (a quarter with missing items is flagged "ناقص" and excluded from rankings/averages), annual averages only the scored quarters.

## Sheet tabs
Employees · Criteria (per year) · Periods (status per year/quarter) · Scores (long format) · Comments · FollowUp · Settings (bands) · **Results** (ready table for Power BI/pivots) · **AuditLog** · AccessLog · AllowedUsers.

## Adding a year / back-filling
Evaluation page ▸ **＋ إضافة سنة** — any year (e.g. 2024 or 2027); choose the year whose criteria to copy. Then enter scores (paste from Excel supported), finalize. To correct an approved period: admin ▸ **إعادة فتح** (reason is logged).
