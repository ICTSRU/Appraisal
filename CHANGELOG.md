# Changelog — SRU Performance Appraisal (منصة المتابعة والتقييم السنوي للأداء)

## v1.5 — 2026-11-09
- Empty-state fix: when the Sheet has no data the page shows «تهيئة وتحميل البيانات» (admin) which runs first-time setup from the page (`apiSetup`), with a clear error if Seed.gs is missing from the project.

## v1.4 — 2026-11-09
- Seed: 2025 loads employees + criteria + actual scores (final); **2026 loads employees + criteria only, no scores** (`tools/build_seed.py ... --blank=2026`).
- New menu item «مسح درجات سنة» (`clearYearScores`) to wipe a year's scores/comments in a sheet already seeded with the old data.

## v1.3 — 2026-11-09
- **Individual appraisal report (PDF)** per employee: scores per criterion for Q1–Q4 and annual average, totals, %, band, evaluator comments, follow-up plan, signature block, A4 print layout. Buttons: «تقرير PDF للموظف» (employee view), «PDF» per row and «تقارير الجميع PDF» (annual summary; one page per employee).
- Draft (non-final) periods are flagged on the report; unsaved edits must be saved first.
- No server/schema change (first release to ship through the auto-deploy Action).

## v1.2 — 2026-11-09
- Added GitHub → Apps Script auto-deploy (`.github/workflows/deploy-apps-script.yml`, clasp) and `AUTODEPLOY.md`; `.gitignore`. No application changes.

## v1.1 — 2026-11-09
- `index.html`: sign-in landing now points to the deployed Apps Script web app (`/exec`). No other changes.

## v1.0 — 2026-11-09
- First release. Built from `Appraisal_form 2025.xlsx` / `Appraisal_form 2026.xlsx`.
- **Evaluation page** (`/exec`): Q1–Q4 + annual per year; matrix view (like the Excel sheet, with paste-from-Excel) and employee-by-employee view; live totals, bands, completeness; save with change log.
- **Dashboard page** (`/exec?page=dashboard`): team average, top/low, completion, year-over-year change, quarterly trend, ranking, quarter table, competence heat-map, strengths/gaps, band distribution, multi-year comparison, CSV + print.
- **Years**: add a new year or a past year (back-fill) — criteria copied from another year; finalize / reopen (with reason) any period.
- **Follow-up**: completion board + follow-up actions (due date, overdue flag).
- **Admin**: employees, criteria per year (weights, CIO-only items), rating bands.
- **Access** (SRU Secure Access Kit v1.4): @sr.edu.sa only, AllowedUsers with roles admin / evaluator / cio / viewer, AccessLog, ChangeLog.
- Data import of 2025 (final) and 2026 (draft — identical to 2025 apart from Inshrah; review before approving).
- Tests: `tools/test` (96 unit checks incl. match to the Excel totals, 32 browser checks).
