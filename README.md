# SRU Performance Appraisal · v1.5
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

## Roles
| Role | Can |
|---|---|
| admin | everything: years, employees, criteria, bands, finalize/reopen, edit finalized periods |
| evaluator | enter the "manager" criteria + comments + follow-up in **draft** periods |
| cio | enter the "CIO" criterion (general evaluation, /10) in draft periods |
| viewer | read-only (evaluation page + dashboard) — appraisals are HR-sensitive: grant sparingly |

## Scoring (same as the workbook)
Quarter total = Σ item scores (max 100). Annual item = average of scored quarters; annual total = Σ items.
Differences from Excel, by design: blank ≠ 0 (a quarter with missing items is flagged "ناقص" and excluded from rankings/averages), annual averages only the scored quarters.

## Sheet tabs
Employees · Criteria (per year) · Periods (status per year/quarter) · Scores (long format) · Comments · FollowUp · Settings (bands) · **Results** (ready table for Power BI/pivots) · ChangeLog · AccessLog · AllowedUsers.

## Adding a year / back-filling
Evaluation page ▸ **＋ إضافة سنة** — any year (e.g. 2024 or 2027); choose the year whose criteria to copy. Then enter scores (paste from Excel supported), finalize. To correct an approved period: admin ▸ **إعادة فتح** (reason is logged).
