/* Server-side permission + audit + user-management tests (no browser). */
const { create } = require('./gas-sim'); const assert = require('assert');
const G = create(), A = G.api; A.setup();
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; };
const as = e => { G.state.email = e; };
const throwsAuth = (fn, m) => { assert.throws(fn, /غير مصرح/, m); pass++; };
const audit = () => A.readTable_('AuditLog');
const OWNER = 'm.elmahdy@sr.edu.sa';

/* ---- users: add one per role (as the owner) ---- */
as(OWNER);
for (const [e, r] of [['ed@sr.edu.sa', 'evaluator'], ['cio@sr.edu.sa', 'cio'], ['view@sr.edu.sa', 'viewer'], ['admin2@sr.edu.sa', 'admin']]) A.apiSaveUser({ email: e, name: e.split('@')[0], role: r, active: true });
ok(A.apiUsers().users.length === 5, 'owner + 4 users listed');
ok(audit().filter(r => r.action === 'user.add').length === 4, 'user.add audited ×4');

/* ---- every API is closed to outsiders (unlisted, wrong domain) ---- */
const calls = {
  apiBoot: () => A.apiBoot(), apiYear: () => A.apiYear(2025), apiDataset: () => A.apiDataset(),
  apiSaveScores: () => A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C01', score: 3 }], {}),
  apiSetStatus: () => A.apiSetStatus(2026, 'Q1', 'final', ''), apiAddYear: () => A.apiAddYear(2030, 2026),
  apiSaveEmployee: () => A.apiSaveEmployee({ name: 'X' }), apiSaveCriterion: () => A.apiSaveCriterion(2026, { id: 'C01', ar: 'x', en: 'x', max: 5, by: 'manager' }),
  apiSaveBands: () => A.apiSaveBands([{ min: 50, ar: 'a', en: 'a' }, { min: 0, ar: 'b', en: 'b' }]),
  apiSaveFollowUp: () => A.apiSaveFollowUp({ year: 2026, period: 'Q1', empId: 'E01', action: 'x' }), apiDeleteFollowUp: () => A.apiDeleteFollowUp('F1', 2026),
  apiSetup: () => A.apiSetup(), apiUsers: () => A.apiUsers(), apiSaveUser: () => A.apiSaveUser({ email: 'z@sr.edu.sa', role: 'viewer' }),
  apiDeleteUser: () => A.apiDeleteUser('view@sr.edu.sa'), apiAudit: () => A.apiAudit({})
};
for (const e of ['stranger@sr.edu.sa', 'someone@gmail.com', '']) { as(e); for (const [n, f] of Object.entries(calls)) throwsAuth(f, n + ' closed to ' + (e || 'anonymous')); }

/* ---- viewer: read only ---- */
as('view@sr.edu.sa'); ok(A.apiBoot().role === 'viewer' && A.apiBoot().perms.join() === 'data.read', 'viewer perms = data.read'); A.apiYear(2025); A.apiDataset();
for (const n of Object.keys(calls).filter(k => !['apiBoot', 'apiYear', 'apiDataset'].includes(k))) throwsAuth(calls[n], 'viewer denied ' + n);
ok(audit().filter(r => r.action === 'denied' && r.by === 'view@sr.edu.sa').length >= 10, 'viewer denials audited');

/* ---- evaluator ---- */
as('ed@sr.edu.sa');
const old0 = A.apiYear(2026).scores['Q1|E01|C01'], nv = old0 === 4 ? 3 : 4;   // 2026 holds a derived draft, so the cell already has a value
let r = A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C01', score: nv }], { E01: 'ملاحظة المحرر' }); ok(r.saved === 1 && r.comments['Q1|E01'].text === 'ملاحظة المحرر', 'evaluator saves manager item + comment');
assert.throws(() => A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C19', score: 5 }], {}), /CIO/); pass++;
A.apiSaveFollowUp({ year: 2026, period: 'Q1', empId: 'E01', action: 'دورة', due: '2026-12-01', status: 'open' });
for (const n of ['apiSetStatus', 'apiAddYear', 'apiSaveEmployee', 'apiSaveCriterion', 'apiSaveBands', 'apiSetup', 'apiUsers', 'apiSaveUser', 'apiDeleteUser', 'apiAudit']) throwsAuth(calls[n], 'evaluator denied ' + n);
as(OWNER); A.apiSetStatus(2026, 'Q1', 'final', ''); as('ed@sr.edu.sa');
assert.throws(() => A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C01', score: 2 }], {}), /معتمدة/); pass++;

/* ---- cio ---- */
as('cio@sr.edu.sa'); as(OWNER); A.apiSetStatus(2026, 'Q1', 'draft', 'تصحيح'); as('cio@sr.edu.sa');
r = A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C19', score: 8 }], {}); ok(r.scores['Q1|E01|C19'] === 8, 'cio saves CIO item');
const before = audit().length;
assert.throws(() => A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C19', score: 9 }], { E01: 'تعليق' }), /غير مصرح/); pass++;
ok(A.apiYear(2026).scores['Q1|E01|C19'] === 8 && A.apiYear(2026).comments['Q1|E01'].text === 'ملاحظة المحرر', 'cio comment attempt wrote NOTHING (no partial save)');
ok(audit().length === before + 1 && audit().pop().action === 'denied', 'refusal audited');
assert.throws(() => A.apiSaveScores(2026, 'Q1', [{ emp: 'E01', crit: 'C02', score: 5 }], {}), /CIO/); pass++;
A.apiSaveFollowUp({ year: 2026, period: 'Q1', empId: 'E02', action: 'CIO action' });
for (const n of ['apiSetStatus', 'apiAddYear', 'apiSaveEmployee', 'apiUsers', 'apiAudit']) throwsAuth(calls[n], 'cio denied ' + n);

/* ---- admin (non-owner) ---- */
as('admin2@sr.edu.sa'); ok(A.apiBoot().perms.length === Object.keys(A.PERMS).length, 'admin has every permission');
A.apiSaveEmployee({ id: 'E02', name: 'Nawaz', fullName: 'Nawaz Full', sector: 'NOC', active: true });
A.apiSaveCriterion(2026, { id: 'C02', compEn: 'Main', compAr: 'م', en: 'Follows SRU policies', ar: 'يلتزم', max: 5, by: 'manager', active: true, order: 2 });
A.apiSaveBands([{ min: 90, ar: 'ممتاز', en: 'Outstanding' }, { min: 75, ar: 'جيد', en: 'Good' }, { min: 0, ar: 'ضعيف', en: 'Weak' }]);
A.apiAddYear(2027, 2026); A.apiSaveFollowUp({ year: 2027, period: 'Q1', empId: 'E01', action: 'x' }); const fid = A.apiSaveFollowUp({ year: 2027, period: 'Q1', empId: 'E01', action: 'x' }).slice(-1)[0].id; A.apiDeleteFollowUp(fid, 2027);

/* ---- audit content ---- */
const rows = audit(); const by = a => rows.filter(x => x.action === a);
const cell = by('score.edit').find(x => x.empId === 'E01' && x.ref === 'C01' && x.by === 'ed@sr.edu.sa');
ok(cell && cell.new === String(nv) && cell.old === String(old0) && cell.year === 2026 && cell.period === 'Q1' && cell.role === 'evaluator', 'score.edit has who/role/where/old/new');
ok(by('comment.edit').some(x => x.new === 'ملاحظة المحرر' && x.by === 'ed@sr.edu.sa'), 'comment.edit audited');
ok(by('status.change').length === 2 && by('status.change')[1].old === 'final' && by('status.change')[1].details === 'تصحيح', 'status.change old/new/reason');
ok(by('employee.save').some(x => /sector: .* → NOC/.test(x.details)), 'employee.save diff'); ok(by('criterion.save').length === 1 && /max|ar:/.test(by('criterion.save')[0].details || 'ar:'), 'criterion.save audited');
ok(by('bands.save').length === 1 && /90:ممتاز/.test(by('bands.save')[0].new), 'bands.save old/new'); ok(by('year.add').length === 1 && by('year.add')[0].year === 2027, 'year.add');
ok(by('followup.save').length >= 3 && by('followup.delete').length === 1, 'followup save/delete audited'); ok(by('setup').length === 1, 'setup audited');
ok(rows.every(x => x.by && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(String(x.at))), 'every row has by + timestamp');

/* ---- users guard rails ---- */
as('admin2@sr.edu.sa');
assert.throws(() => A.apiSaveUser({ email: 'x@gmail.com', role: 'viewer' }), /جامعي/); pass++;
assert.throws(() => A.apiSaveUser({ email: 'x@sr.edu.sa', role: 'superuser' }), /دور غير صالح/); pass++;
assert.throws(() => A.apiSaveUser({ email: OWNER, role: 'viewer' }), /المالك/); pass++;
assert.throws(() => A.apiDeleteUser(OWNER), /المالك/); pass++;
assert.throws(() => A.apiSaveUser({ email: 'admin2@sr.edu.sa', role: 'viewer' }), /بنفسك/); pass++;
assert.throws(() => A.apiSaveUser({ email: 'admin2@sr.edu.sa', role: 'admin', active: false }), /بنفسك/); pass++;
assert.throws(() => A.apiDeleteUser('admin2@sr.edu.sa'), /بنفسك/); pass++;
assert.throws(() => A.apiDeleteUser('nobody@sr.edu.sa'), /غير موجود/); pass++;
// promote viewer → evaluator: effective immediately for that user
A.apiSaveUser({ email: 'view@sr.edu.sa', name: 'View', role: 'evaluator', active: true }); as('view@sr.edu.sa'); ok(A.apiBoot().role === 'evaluator', 'role change effective immediately');
as('admin2@sr.edu.sa'); ok(audit().filter(x => x.action === 'user.update').pop().details.includes('role: viewer → evaluator'), 'user.update diff');
// deactivate → locked out; reactivate → back
A.apiSaveUser({ email: 'view@sr.edu.sa', name: 'View', role: 'evaluator', active: false }); as('view@sr.edu.sa'); throwsAuth(() => A.apiBoot(), 'deactivated user locked out');
as('admin2@sr.edu.sa'); A.apiSaveUser({ email: 'view@sr.edu.sa', name: 'View', role: 'viewer', active: true }); as('view@sr.edu.sa'); ok(A.apiBoot().role === 'viewer', 'reactivated');
as('admin2@sr.edu.sa'); A.apiDeleteUser('cio@sr.edu.sa'); as('cio@sr.edu.sa'); throwsAuth(() => A.apiBoot(), 'deleted user locked out');
as(OWNER); const U = A.apiUsers(); ok(U.users.find(u => u.email === OWNER).owner === true && !U.users.some(u => u.email === 'cio@sr.edu.sa'), 'owner flagged, deleted user gone');
ok(audit().some(x => x.action === 'user.delete' && x.ref === 'cio@sr.edu.sa'), 'user.delete audited');
// last login from the access log
as('ed@sr.edu.sa'); A.doGet({ parameter: {} }); as(OWNER); ok(/^\d{4}-/.test(A.apiUsers().users.find(u => u.email === 'ed@sr.edu.sa').lastLogin), 'lastLogin shown');

/* ---- audit query ---- */
as(OWNER); let q = A.apiAudit({});
ok(q.total === q.all && q.rows[0].at >= q.rows[q.rows.length - 1].at && q.users.includes('ed@sr.edu.sa') && q.actions.includes('score.edit'), 'newest first + facets');
ok(A.apiAudit({ user: 'ed@sr.edu.sa' }).rows.every(x => x.by === 'ed@sr.edu.sa'), 'filter user'); ok(A.apiAudit({ action: 'denied' }).rows.every(x => x.action === 'denied'), 'filter action');
ok(A.apiAudit({ q: 'ملاحظة المحرر' }).total >= 1, 'search text'); ok(A.apiAudit({ year: 2027 }).rows.every(x => String(x.year) === '2027'), 'filter year');
ok(A.apiAudit({ from: '2999-01-01' }).total === 0 && A.apiAudit({ to: '2000-01-01' }).total === 0, 'date range');
ok(A.apiAudit({ limit: 5, offset: 0 }).rows.length === 5 && A.apiAudit({ limit: 5, offset: 5 }).rows[0].at <= A.apiAudit({ limit: 5 }).rows[4].at, 'paging');
console.log('admin tests passed:', pass);
