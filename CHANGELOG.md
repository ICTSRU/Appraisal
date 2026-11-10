# Changelog — SRU Performance Appraisal (منصة المتابعة والتقييم السنوي للأداء)

## v1.9 — 2026-11-10
**2026 completed from 2025 — with deliberate differences (indicative draft data)**
- `tools/derive_year.py` derives 2026 from 2025 inside `Seed.gs` (deterministic, re-runnable).
- Criteria 2026: «Appearance» removed; «Information Security» added (C20); «Open to change» item reworded; total still 100.
- Team 2026: E10 (SAHZA) inactive; two new hires (`New Staff 1/2`, rename them in the Employees tab) scored from Q2.
- Scores 2026: Q1–Q3 filled from each employee's 2025 profile with individual trends; Q4 left blank (year in progress). Status draft, note says the scores are indicative.
- New admin button «تحميل مسودة 2026» (and sheet menu item) applies the draft to an existing platform: `apiLoadDraftYear`. First-time `setup()` loads it automatically.
- A closed (all-final) year no longer lists employees who have no scores in it (later joiners).
- Tests updated: unit 105 · admin 122 · e2e 51 · i18n 12.

## v1.8 — 2026-11-10
- **Fix:** the «لوحة المؤشرات» / «التقييم والمتابعة» header links now open in the top window (`target="_top"`). Inside the Apps Script sandbox iframe they loaded the page in the frame, which Google blocks (grey page with a "blocked" icon).

## v1.7 — 2026-11-09
- **Users panel** (tab «المستخدمون», admin only): add / edit / deactivate / delete users, roles مدير · محرّر · تقييم الـ CIO · مطّلع, last sign-in, permission matrix. Owner account is fixed; nobody can change their own role or delete themselves.
- **Server-enforced permissions**: one `PERMS` matrix in `Code.gs` + `requirePerm_()` on every `api*` call (the UI only mirrors it). Fixes: CIO/viewer can no longer post comments through the API; comment permission is checked before anything is written.
- **Audit log** (sheet `AuditLog`, tab «سجل التدقيق»): who / role / when / what / old → new for scores, comments, period approve & reopen, years, employees, criteria, bands, follow-ups, users, setup, year clears, **and refused attempts** (`denied`). Filter by user, action, date, text; CSV export. Replaces `ChangeLog` (old sheet is left untouched).
- Tests: `tools/test/admin.test.js` (122 server checks) + UI checks in `e2e.test.js`.

## v1.6 — 2026-11-09
- **English / Arabic switch** (button in the header, remembered per browser; `?lang=en` also works) — full UI, report, dashboard, server messages; direction flips RTL↔LTR.
- **Dark mode** (button in the header, follows the system by default); dashboard charts use a dark palette validated for colour-blind separation; printing/PDF is always light.
- Criteria and domains are shown in ONE language only (Arabic in Arabic mode, English in English mode) — the English sub-line under every criterion/domain was removed.
- New `apps-script/I18n.html` holds the dictionary (add new strings there). Test: `tools/test/i18n.test.js`.

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
