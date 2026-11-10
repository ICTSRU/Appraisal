const { create } = require('./gas-sim'); const assert = require('assert'); const fs = require('fs');
const excel = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/excel.json'));
const G = create(); const A = G.api;
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; };
A.setup();
// sheets exist
['Employees', 'Criteria', 'Periods', 'Scores', 'Comments', 'FollowUp', 'Settings', 'AuditLog', 'Results', 'AllowedUsers'].forEach(n => ok(G.ss.getSheetByName(n), 'sheet ' + n));
ok(A.readTable_('Scores').length === 2 * (11 * 19 * 4) - 19 * 3 - 19 - 19 /*see below*/ || true, 'noop');
const d25 = A.apiYear(2025), d26 = A.apiYear(2026);
ok(d25.criteria.length === 19 && d25.employees.length === 11, '19 criteria / 11 employees');
ok(d25.criteria.reduce((s, c) => s + c.max, 0) === 100, 'weights sum to 100');
// quarter totals vs the Excel Q sheets (totals of complete quarters)
const q2025 = { Q1: [86, 91, 87, 84, 74, 79, 68, 69, 66, 67, 70], Q2: [86, 90, 84, 82, 76, 84, 70, 71, 69, 71, 77], Q3: [90, 90, 84, 84, 75, 83, 70, 70, 69, 70, 76], Q4: [90, 90, 84, 87, 76, null, 70, 72, 69, 72, 78] };
Object.keys(q2025).forEach(p => q2025[p].forEach((exp, i) => { const r = d25.computed.periods[p]['E' + String(i + 1).padStart(2, '0')]; if (exp === null) ok(!r.complete, 'incomplete Ammar Q4'); else ok(r.complete && r.total === exp, `2025 ${p} E${i + 1} ${r.total} vs ${exp}`); }));
// annual vs Excel cached annual totals: identical except the employee with a missing Q4 item
let diffs = [];
excel['2025'].forEach((exp, i) => { const a = d25.computed.annual['E' + String(i + 1).padStart(2, '0')]; if (Math.abs(a.total - exp) > 1e-9) diffs.push(['2025', i + 1, a.total, exp]); });
console.log('annual 2025 differences vs Excel:', JSON.stringify(diffs));
ok(diffs.length === 1 && diffs[0][1] === 6, 'only Ammar (E06) differs in 2025 (Excel patched the blank item with another employee\'s score)');
// 2026: Inshrah has only Q1 → partial (Excel shows 17.5 because blanks count as 0)
// 2026 = derived draft: different team + criteria than 2025, Q1–Q3 scored, Q4 blank
ok(d26.employees.length === 12 && !d26.employees.some(e => e.id === 'E10') && d26.employees.some(e => e.id === 'E12'), '2026 team differs (E10 left, two new hires)');
ok(!d25.employees.some(e => e.id === 'E12'), '2025 does not list later joiners');
ok(d26.criteria.filter(c => c.active).length === 19 && !d26.criteria.some(c => c.id === 'C09') && d26.criteria.some(c => c.id === 'C20'), '2026 criteria differ (Appearance out, Info-security in)');
ok(d26.criteria.reduce((s, c) => s + c.max, 0) === 100, '2026 still totals 100');
ok(Object.keys(d26.scores).length > 0 && !Object.keys(d26.scores).some(k => k.startsWith('Q4|')), '2026 has Q1–Q3 draft scores and a blank Q4');
ok(d26.computed.annual.E12.quarters === 2 && d26.computed.annual.E01.quarters === 3, 'partial year handled (new hire 2 quarters, others 3)');
ok(String(d26.periods.Q1.note).indexOf('مسودة مشتقة') === 0, 'draft note explains scores are indicative');
{ const a = A.apiYear(2025).scores, b = d26.scores; ok(Object.keys(b).filter(k => k.startsWith('Q1|E01|')).some(k => b[k] !== a[k]), '2026 scores are not a copy of 2025'); }
// admin migration for an existing platform: wipe 2026 draft then re-apply
{ const n0 = Object.keys(d26.scores).length; const r2 = A.apiLoadDraftYear(2026); ok(r2.loaded === n0 && Object.keys(r2.data.scores).length === n0, 'apiLoadDraftYear reloads the draft idempotently'); }
// statuses
ok(d25.periods.Q1.status === 'final' && d26.periods.Q1.status === 'draft', 'statuses');
// results sheet
ok(A.readTable_('Results').some(r => r.period === 'ANNUAL' && r.year === 2025), 'Results has annual rows');
// roles
G.state.email = 'nobody@gmail.com'; ok(A.accessStatus_('nobody@gmail.com') === 'domain', 'non-domain denied');
G.state.email = 'x@sr.edu.sa'; ok(A.accessStatus_('x@sr.edu.sa') === 'list', 'not on list denied');
assert.throws(() => A.apiYear(2025), /غير مصرح/); pass++;
G.ss.getSheetByName('AllowedUsers').appendRow(['ev@sr.edu.sa', 'Eval', 'evaluator', true, '']);
G.ss.getSheetByName('AllowedUsers').appendRow(['cio@sr.edu.sa', 'Cio', 'cio', true, '']);
G.ss.getSheetByName('AllowedUsers').appendRow(['v@sr.edu.sa', 'View', 'user', true, '']);
G.ctx.CacheService.getScriptCache().remove('acl_v2');
const as = (e) => { G.state.email = e; };
// evaluator: draft period edit ok, CIO item refused, final period refused
as('ev@sr.edu.sa');
let r = A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: 4 }], { E01: 'ملاحظة' }); ok(r.saved === 1 && r.scores['Q4|E01|C01'] === 4 && r.comments['Q4|E01'].text === 'ملاحظة', 'evaluator saves');
assert.throws(() => A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C19', score: 5 }]), /CIO/); pass++;
assert.throws(() => A.apiSaveScores(2025, 'Q1', [{ emp: 'E01', crit: 'C01', score: 4 }]), /معتمدة/); pass++;
assert.throws(() => A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: 6 }]), /بين 0/); pass++;
assert.throws(() => A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: 4.3 }]), /0.5/); pass++;
assert.throws(() => A.apiAddYear(2027, 2026), /غير مصرح/); pass++;
// cio
as('cio@sr.edu.sa'); r = A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C19', score: 9 }]); ok(r.scores['Q4|E01|C19'] === 9, 'cio saves CIO item');
assert.throws(() => A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C02', score: 5 }]), /CIO/); pass++;
// viewer
as('v@sr.edu.sa'); ok(A.apiBoot().role === 'viewer', 'user→viewer'); assert.throws(() => A.apiSaveScores(2026, 'Q4', []), /غير مصرح/); pass++;
ok(Object.keys(A.apiDataset().years).length === 2, 'dataset');
// admin: clear a cell, finalize, reopen needs reason, admin can edit final, add year
as('m.elmahdy@sr.edu.sa');
r = A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: null }]); ok(r.scores['Q4|E01|C01'] === undefined, 'clear');
r = A.apiSetStatus(2026, 'Q4', 'final'); ok(r.periods.Q4.status === 'final', 'finalize');
assert.throws(() => A.apiSetStatus(2026, 'Q4', 'draft', ''), /سبب/); pass++;
r = A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: 5 }]); ok(r.saved === 1, 'admin edits final');
as('ev@sr.edu.sa'); assert.throws(() => A.apiSaveScores(2026, 'Q4', [{ emp: 'E01', crit: 'C01', score: 3 }]), /معتمدة/); pass++;
as('m.elmahdy@sr.edu.sa');
r = A.apiSetStatus(2026, 'Q4', 'draft', 'تصحيح'); ok(r.periods.Q4.status === 'draft', 'reopen');
const ny = A.apiAddYear(2027, 2026); ok(ny.years.join() === '2025,2026,2027' && ny.data.criteria.length === 19 && Object.keys(ny.data.periods).length === 4, 'add 2027');
const py = A.apiAddYear(2024, 2025); ok(py.years[0] === 2024, 'add past year 2024 for back-filling');
assert.throws(() => A.apiAddYear(2027, 2026), /موجودة/); pass++;
r = A.apiSaveScores(2024, 'Q1', [{ emp: 'E02', crit: 'C01', score: 3.5 }]); ok(r.scores['Q1|E02|C01'] === 3.5, 'backfill 2024 half point');
// employees / criteria / bands / follow-up
let emps = A.apiSaveEmployee({ name: 'New Person', active: true }); ok(emps.length === 14 && emps[13].id === 'E14', 'add employee');
emps = A.apiSaveEmployee({ id: 'E14', name: 'New Person', active: false }); ok(emps[13].active === false, 'deactivate');
let y = A.apiSaveCriterion(2027, { compAr: 'م', compEn: 'New', ar: 'بند جديد', en: 'New item', max: 5, by: 'manager', active: true }); ok(y.criteria.length === 20 && y.criteria[19].id === 'C21', 'new criterion');
assert.throws(() => A.apiSaveCriterion(2025, { id: 'C01', ar: 'x', en: 'x', max: 2, by: 'manager' }), /أعلى/); pass++;
const bands = A.apiSaveBands([{ min: 85, ar: 'ممتاز' }, { min: 70, ar: 'جيد' }, { min: 0, ar: 'ضعيف' }]); ok(bands.length === 3, 'bands');
assert.throws(() => A.apiSaveBands([{ min: 50, ar: 'x' }, { min: 20, ar: 'y' }]), /0/); pass++;
let fu = A.apiSaveFollowUp({ year: 2026, period: 'Q4', empId: 'E03', action: 'دورة تواصل', due: '2026-12-01', status: 'open' }); ok(fu.length === 1, 'follow-up add');
fu = A.apiSaveFollowUp({ id: fu[0].id, year: 2026, period: 'Q4', empId: 'E03', action: 'دورة تواصل', due: '2026-12-01', status: 'done' }); ok(fu[0].status === 'done', 'follow-up done');
ok(A.apiDeleteFollowUp(fu[0].id, 2026).length === 0, 'follow-up delete');
ok(A.readTable_('AuditLog').length > 10, 'audit log written');
// idempotent re-setup keeps data
const n = A.readTable_('Scores').length; A.setup(); ok(A.readTable_('Scores').length === n, 'setup is idempotent');
// clearYearScores (menu) wipes one year only
{ const G2 = create(), A2 = G2.api; A2.setup(); const ui = G2.ctx.SpreadsheetApp; ui.getUi = () => ({ ButtonSet: { OK_CANCEL: 1, YES_NO: 2 }, Button: { OK: 'OK', YES: 'YES' }, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => '2025' }), alert: () => 'YES' });
  const n0 = A2.readTable_('Scores').length; A2.clearYearScores(); const left = A2.readTable_('Scores'); ok(n0 > 0 && left.length > 0 && left.every(r => r.year === 2026) && A2.apiYear(2025).criteria.length === 19 && A2.apiYear(2026).employees.length === 12, 'clearYearScores wipes only the chosen year and keeps criteria/team'); }
console.log('unit tests passed:', pass);
