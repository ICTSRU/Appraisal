/**
 * Api.gs — data layer + every function the pages call through google.script.run.
 * Each api* function begins with requirePerm_(<permission>) (PERMS matrix + gate in Code.gs).
 *
 * Roles:  admin     everything (years, employees, criteria, bands, finalize/reopen, edit finalized periods)
 *         evaluator evaluates the "manager" criteria of DRAFT periods + comments + follow-up
 *         cio       evaluates the "cio" criteria of DRAFT periods + follow-up
 *         viewer    read only (evaluation page in view mode + dashboard)
 */
const SCHEMA = {
  Employees: ['id', 'name', 'fullName', 'sector', 'active', 'order'],
  Criteria:  ['year', 'id', 'order', 'compEn', 'compAr', 'en', 'ar', 'max', 'by', 'active'],
  Periods:   ['year', 'period', 'status', 'note', 'updatedBy', 'updatedAt'],
  Scores:    ['year', 'period', 'empId', 'critId', 'score', 'by', 'at'],
  Comments:  ['year', 'period', 'empId', 'text', 'by', 'at'],
  FollowUp:  ['id', 'year', 'period', 'empId', 'action', 'due', 'status', 'by', 'at'],
  Settings:  ['key', 'value'],
  AuditLog:  ['at', 'by', 'role', 'action', 'entity', 'year', 'period', 'empId', 'ref', 'old', 'new', 'details'],   // every change (Admin.gs)
  Results:   ['year', 'period', 'empId', 'name', 'total', 'max', 'pct', 'band', 'scored', 'of', 'complete', 'status']
};
const EDIT_ROLES = ['admin', 'evaluator', 'cio'];
const ALL_ROLES  = ['admin', 'evaluator', 'cio', 'viewer'];
const AUDIT_CELL_CAP = 3000;     // per save; a full-year paste is ~900 cells

/* ------------------------------ DB layer ----------------------------- */
function ss_() {
  const s = DATA_SPREADSHEET_ID ? SpreadsheetApp.openById(DATA_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!s) throw new Error('لا يوجد Google Sheet: اربط السكربت بملف Sheet أو ضع DATA_SPREADSHEET_ID');
  return s;
}
function sheet_(name) {
  const s = ss_();
  let sh = s.getSheetByName(name);
  const H = SCHEMA[name];
  if (!sh) {
    sh = s.insertSheet(name);
    sh.getRange(1, 1, 1, H.length).setValues([H]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1);
    if (name !== 'Settings') sh.setRightToLeft(true);
    if (name === 'AuditLog') { sh.getRange('A:L').setNumberFormat('@'); [150, 200, 70, 130, 90, 60, 60, 70, 90, 220, 220, 300].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); }); }   // text format: stops Sheets turning timestamps into dates
  }
  return sh;
}
function readTable_(name) {
  const sh = sheet_(name), H = SCHEMA[name], last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, H.length).getValues()
    .filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (r) { const o = {}; H.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}
function writeTable_(name, rows) {
  const sh = sheet_(name), H = SCHEMA[name], last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, H.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, H.length)
    .setValues(rows.map(function (r) { return H.map(function (h) { return r[h] === undefined || r[h] === null ? '' : r[h]; }); }));
}
function appendRows_(name, rows) {
  if (!rows.length) return;
  const sh = sheet_(name), H = SCHEMA[name];
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, H.length)
    .setValues(rows.map(function (r) { return H.map(function (h) { return r[h] === undefined || r[h] === null ? '' : r[h]; }); }));
}
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function now_() { return Utilities.formatDate(new Date(), LOG_TIMEZONE, 'yyyy-MM-dd HH:mm:ss'); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function scoreKey_(p, e, c) { return p + '|' + e + '|' + c; }

function getBands_() {
  const row = readTable_('Settings').filter(function (r) { return r.key === 'bands'; })[0];
  if (row) { try { const b = JSON.parse(row.value); if (b && b.length) return b; } catch (e) {} }
  return DEFAULT_BANDS;
}
function yearsList_() {
  const seen = {};
  readTable_('Periods').forEach(function (r) { seen[Number(r.year)] = true; });
  return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
}
function employeesAll_() {
  return readTable_('Employees').map(function (e) {
    return { id: e.id, name: String(e.name), fullName: String(e.fullName || ''), sector: String(e.sector || ''), active: bool_(e.active), order: Number(e.order) || 0 };
  }).sort(function (a, b) { return a.order - b.order; });
}
function criteriaOf_(year) {
  return readTable_('Criteria').filter(function (c) { return Number(c.year) === Number(year); }).map(function (c) {
    return { id: c.id, order: Number(c.order), compEn: String(c.compEn), compAr: String(c.compAr), en: String(c.en), ar: String(c.ar),
             max: Number(c.max), by: String(c.by || 'manager'), active: bool_(c.active) };
  }).sort(function (a, b) { return a.order - b.order; });
}

/** Everything the evaluation page needs for one year. */
function yearData_(year) {
  year = Number(year);
  const bands = getBands_();
  const criteria = criteriaOf_(year);
  const periods = {};
  readTable_('Periods').filter(function (r) { return Number(r.year) === year; }).forEach(function (r) {
    periods[r.period] = { status: String(r.status), note: String(r.note || ''), updatedBy: String(r.updatedBy || ''), updatedAt: String(r.updatedAt || '') };
  });
  const scores = {}, withScores = {};
  readTable_('Scores').filter(function (r) { return Number(r.year) === year && r.score !== ''; }).forEach(function (r) {
    scores[scoreKey_(r.period, r.empId, r.critId)] = Number(r.score); withScores[r.empId] = true;
  });
  const allFinal = Object.keys(periods).length > 0 && Object.keys(periods).every(function (k) { return periods[k].status === 'final'; });
  const emps = employeesAll_().filter(function (e) { return withScores[e.id] || (e.active && !allFinal); });   // an employee who joined later is not listed in a closed past year
  const comments = {};
  readTable_('Comments').filter(function (r) { return Number(r.year) === year; }).forEach(function (r) {
    comments[r.period + '|' + r.empId] = { text: String(r.text), by: String(r.by), at: String(r.at) };
  });
  const followups = readTable_('FollowUp').filter(function (r) { return Number(r.year) === year; }).map(function (r) {
    return { id: r.id, year: Number(r.year), period: String(r.period), empId: r.empId, action: String(r.action), due: String(r.due || ''), status: String(r.status), by: String(r.by), at: String(r.at) };
  });
  const computed = computeYear_(criteria.filter(function (c) { return c.active; }), emps.map(function (e) { return e.id; }), scores, bands);
  return { year: year, criteria: criteria, periods: periods, scores: scores, comments: comments, followups: followups,
           employees: emps, computed: computed };
}

/* ---------------------------- Server calls --------------------------- */

function apiBoot() {
  const ctx = requirePerm_('data.read');
  return { user: ctx.email, name: userName_(ctx.email), role: ctx.role, version: APP_VERSION,
           years: yearsList_(), employees: employeesAll_(), bands: getBands_(), perms: permsOf_(ctx.role),
           draftYears: (typeof SEED !== 'undefined' && SEED.derived) ? Object.keys(SEED.derived).map(Number) : [] };
}

function apiYear(year) {
  requirePerm_('data.read');
  return yearData_(year);
}

/** Dashboard dataset: all years, computed server-side. */
function apiDataset() {
  requirePerm_('data.read');
  const bands = getBands_(), employees = employeesAll_(), out = { version: APP_VERSION, bands: bands, employees: employees, years: {} };
  yearsList_().forEach(function (y) {
    const d = yearData_(y);
    const finalScores = {};                                    // same math, but only FINAL periods (dashboard toggle «تضمين المسودات»)
    Object.keys(d.scores).forEach(function (k) { const per = d.periods[k.split('|')[0]]; if (per && per.status === 'final') finalScores[k] = d.scores[k]; });
    const computedFinal = computeYear_(d.criteria.filter(function (c) { return c.active; }), d.employees.map(function (e) { return e.id; }), finalScores, bands);
    out.years[y] = { criteria: d.criteria, periods: d.periods, scores: d.scores, computed: d.computed, computedFinal: computedFinal,
                     employees: d.employees.map(function (e) { return e.id; }), followups: d.followups };
  });
  return out;
}

/**
 * Saves scores (and optional comments) of one year/period.
 * changes: [{emp, crit, score}]  — score null/'' clears the cell.
 * comments: { empId: "text" }
 */
function apiSaveScores(year, period, changes, comments) {
  const ctx = requirePerm_('scores.write');
  year = Number(year);
  if (PERIODS.indexOf(period) === -1) throw new Error('فترة غير صالحة');
  if (comments && Object.keys(comments).length && !can_(ctx.role, 'comments.write')) {     // checked BEFORE anything is written
    try { audit_(ctx, 'denied', { entity: 'permission', ref: 'comments.write', year: year, period: period, details: 'role ' + ctx.role }); } catch (e) { console.error(e); }
    throw new Error('غير مصرح — صلاحيتك (' + ctx.role + ') لا تسمح بهذا الإجراء');
  }
  return withLock_(function () {
    const per = readTable_('Periods').filter(function (r) { return Number(r.year) === year && r.period === period; })[0];
    if (!per) throw new Error('الفترة غير موجودة — أضف السنة أولاً');
    if (per.status === 'final' && !can_(ctx.role, 'scores.write.final')) throw new Error('الفترة معتمدة (نهائية) — يلزم أن يعيد المدير فتحها للتعديل');
    const crit = {}; criteriaOf_(year).forEach(function (c) { crit[c.id] = c; });
    const emps = {}; employeesAll_().forEach(function (e) { emps[e.id] = e; });
    const rows = readTable_('Scores');
    const idx = {}; rows.forEach(function (r, i) { idx[Number(r.year) + '|' + scoreKey_(r.period, r.empId, r.critId)] = i; });
    const at = now_(), log = [], remove = {};
    let changed = 0;
    (changes || []).forEach(function (ch) {
      const c = crit[ch.crit];
      if (!c || !c.active) throw new Error('بند غير موجود: ' + ch.crit);
      if (!emps[ch.emp]) throw new Error('موظف غير موجود: ' + ch.emp);
      if (ctx.role === 'evaluator' && c.by !== 'manager') throw new Error('بند «' + c.ar + '» يخص تقييم الـ CIO');
      if (ctx.role === 'cio' && c.by !== 'cio') throw new Error('صلاحيتك تسمح بتقييم الـ CIO فقط');
      const err = validateScore_(ch.score, c);
      if (err) throw new Error(err + ' — ' + c.ar);
      const empty = ch.score === null || ch.score === undefined || ch.score === '';
      const key = year + '|' + scoreKey_(period, ch.emp, ch.crit);
      const i = idx[key];
      const old = i === undefined ? '' : rows[i].score;
      if (empty && i === undefined) return;
      if (!empty && i !== undefined && Number(old) === Number(ch.score)) return;
      if (empty) { remove[i] = true; }
      else if (i === undefined) { rows.push({ year: year, period: period, empId: ch.emp, critId: ch.crit, score: Number(ch.score), by: ctx.email, at: at }); idx[key] = rows.length - 1; }
      else { rows[i].score = Number(ch.score); rows[i].by = ctx.email; rows[i].at = at; }
      changed++;
      log.push(auditRow_(ctx, 'score.edit', { entity: 'score', year: year, period: period, empId: ch.emp, ref: ch.crit, old: old, new: empty ? '' : Number(ch.score), details: per.status === 'final' ? 'edit on approved period' : '' }));
    });
    if (changed) writeTable_('Scores', rows.filter(function (r, i) { return !remove[i]; }));

    // comments
    const crows = readTable_('Comments');
    let cchanged = false;
    Object.keys(comments || {}).forEach(function (e) {
      if (!emps[e]) return;
      const text = String(comments[e] || '').trim().slice(0, 2000);
      const i = crows.findIndex(function (r) { return Number(r.year) === year && r.period === period && r.empId === e; });
      if (i === -1 && text) { crows.push({ year: year, period: period, empId: e, text: text, by: ctx.email, at: at }); cchanged = true; log.push(auditRow_(ctx, 'comment.edit', { entity: 'comment', year: year, period: period, empId: e, new: text })); }
      else if (i !== -1 && String(crows[i].text) !== text) { log.push(auditRow_(ctx, 'comment.edit', { entity: 'comment', year: year, period: period, empId: e, old: crows[i].text, new: text })); if (text) { crows[i].text = text; crows[i].by = ctx.email; crows[i].at = at; } else crows.splice(i, 1); cchanged = true; }
    });
    if (cchanged) writeTable_('Comments', crows);
    if (log.length > AUDIT_CELL_CAP) { const n = log.length; log.length = AUDIT_CELL_CAP; log.push(auditRow_(ctx, 'score.edit', { entity: 'score', year: year, period: period, details: 'audit truncated: ' + n + ' changes in one save' })); }
    auditMany_(log);

    if (changed || cchanged) {
      const prow = readTable_('Periods');
      prow.forEach(function (r) { if (Number(r.year) === year && r.period === period) { r.updatedBy = ctx.email; r.updatedAt = at; } });
      writeTable_('Periods', prow);
      rebuildResults_(year);
    }
    const d = yearData_(year); d.saved = changed; return d;
  });
}

/** Finalize (draft→final) or reopen (final→draft). Admin only; reopening needs a reason. */
function apiSetStatus(year, period, status, note) {
  const ctx = requirePerm_('status.change');
  year = Number(year);
  if (['draft', 'final'].indexOf(status) === -1) throw new Error('حالة غير صالحة');
  return withLock_(function () {
    const rows = readTable_('Periods'); let hit = null;
    rows.forEach(function (r) { if (Number(r.year) === year && r.period === period) hit = r; });
    if (!hit) throw new Error('الفترة غير موجودة');
    if (hit.status === status) return yearData_(year);
    if (status === 'draft' && !String(note || '').trim()) throw new Error('اكتب سبب إعادة فتح الفترة');
    const at = now_(), before = hit.status;
    hit.status = status; hit.note = String(note || '').trim(); hit.updatedBy = ctx.email; hit.updatedAt = at;
    writeTable_('Periods', rows);
    audit_(ctx, 'status.change', { entity: 'period', year: year, period: period, old: before, new: status, details: note });
    rebuildResults_(year);
    return yearData_(year);
  });
}

/** Adds a year (any year — new or a past one for back-filling) with 4 empty draft periods; criteria copied from `copyFrom`. */
function apiAddYear(year, copyFrom) {
  const ctx = requirePerm_('year.add');
  year = Number(year);
  if (!(year >= 2000 && year <= 2100)) throw new Error('سنة غير صالحة');
  return withLock_(function () {
    if (yearsList_().indexOf(year) !== -1) throw new Error('السنة ' + year + ' موجودة مسبقاً');
    const years = yearsList_();
    let src = Number(copyFrom);
    if (!src || years.indexOf(src) === -1) {                    // nearest earlier year, else nearest later
      const earlier = years.filter(function (y) { return y < year; });
      src = earlier.length ? earlier[earlier.length - 1] : years[0];
    }
    const crit = src ? criteriaOf_(src) : [];
    if (!crit.length) throw new Error('لا توجد بنود تقييم للنسخ منها');
    const at = now_();
    appendRows_('Criteria', crit.map(function (c) { return { year: year, id: c.id, order: c.order, compEn: c.compEn, compAr: c.compAr, en: c.en, ar: c.ar, max: c.max, by: c.by, active: c.active }; }));
    appendRows_('Periods', PERIODS.map(function (p) { return { year: year, period: p, status: 'draft', note: '', updatedBy: ctx.email, updatedAt: at }; }));
    audit_(ctx, 'year.add', { entity: 'year', year: year, details: 'criteria copied from ' + src });
    return { years: yearsList_(), data: yearData_(year) };
  });
}

function apiSaveEmployee(emp) {
  const ctx = requirePerm_('employee.write');
  return withLock_(function () {
    const rows = readTable_('Employees');
    const name = String(emp.name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    let hit = emp.id ? rows.filter(function (r) { return r.id === emp.id; })[0] : null;
    if (!hit) {
      const n = rows.reduce(function (m, r) { return Math.max(m, Number(String(r.id).replace(/\D/g, '')) || 0); }, 0) + 1;
      hit = { id: 'E' + (n < 10 ? '0' : '') + n, order: rows.reduce(function (m, r) { return Math.max(m, Number(r.order) || 0); }, 0) + 1 };
      rows.push(hit);
    }
    const isNew = hit.name === undefined, before = isNew ? null : { name: hit.name, fullName: hit.fullName, sector: hit.sector, active: hit.active };
    hit.name = name; hit.fullName = String(emp.fullName || '').trim(); hit.sector = String(emp.sector || '').trim();
    hit.active = emp.active !== false;
    writeTable_('Employees', rows);
    const dd = diff_(before, hit, ['name', 'fullName', 'sector', 'active']);
    if (isNew || dd) audit_(ctx, isNew ? 'employee.add' : 'employee.save', { entity: 'employee', empId: hit.id, ref: hit.id, new: name, details: isNew ? 'created' : dd });
    return employeesAll_();
  });
}

function apiSaveCriterion(year, c) {
  const ctx = requirePerm_('criterion.write');
  year = Number(year);
  return withLock_(function () {
    if (yearsList_().indexOf(year) === -1) throw new Error('السنة غير موجودة');
    const max = Number(c.max);
    if (!(max >= 1 && max <= 100)) throw new Error('الدرجة العظمى بين 1 و 100');
    if (['manager', 'cio'].indexOf(c.by) === -1) throw new Error('جهة التقييم غير صالحة');
    if (!String(c.ar || '').trim() && !String(c.en || '').trim()) throw new Error('نص البند مطلوب');
    const rows = readTable_('Criteria');
    let hit = c.id ? rows.filter(function (r) { return Number(r.year) === year && r.id === c.id; })[0] : null;
    if (hit) {
      const over = readTable_('Scores').some(function (s) { return Number(s.year) === year && s.critId === hit.id && Number(s.score) > max; });
      if (over) throw new Error('توجد درجات مسجلة أعلى من الحد الجديد (' + max + ')');
    } else {
      const n = rows.reduce(function (m, r) { return Math.max(m, Number(String(r.id).replace(/\D/g, '')) || 0); }, 0) + 1;
      hit = { year: year, id: 'C' + (n < 10 ? '0' : '') + n, order: rows.filter(function (r) { return Number(r.year) === year; }).reduce(function (m, r) { return Math.max(m, Number(r.order) || 0); }, 0) + 1 };
      rows.push(hit);
    }
    const isNewC = hit.max === undefined, beforeC = isNewC ? null : { compEn: hit.compEn, compAr: hit.compAr, en: hit.en, ar: hit.ar, max: hit.max, by: hit.by, active: hit.active, order: hit.order };
    ['compEn', 'compAr', 'en', 'ar'].forEach(function (k) { hit[k] = String(c[k] || '').trim(); });
    hit.max = max; hit.by = c.by; hit.active = c.active !== false;
    if (c.order) hit.order = Number(c.order);
    writeTable_('Criteria', rows);
    const dc = diff_(beforeC, hit, ['compEn', 'compAr', 'en', 'ar', 'max', 'by', 'active', 'order']);
    if (isNewC || dc) audit_(ctx, isNewC ? 'criterion.add' : 'criterion.save', { entity: 'criterion', year: year, ref: hit.id, new: hit.ar || hit.en, details: isNewC ? 'created (max ' + max + ')' : dc });
    rebuildResults_(year);
    return yearData_(year);
  });
}

function apiSaveBands(bands) {
  const ctx = requirePerm_('bands.write');
  if (!Array.isArray(bands) || bands.length < 2 || bands.length > 8) throw new Error('من 2 إلى 8 فئات');
  const clean = bands.map(function (b) { return { min: Number(b.min), ar: String(b.ar || '').trim(), en: String(b.en || '').trim() }; });
  if (clean.some(function (b) { return !isFinite(b.min) || b.min < 0 || b.min > 100 || !b.ar; })) throw new Error('بيانات الفئات غير صالحة');
  clean.sort(function (a, b) { return b.min - a.min; });
  if (clean[clean.length - 1].min !== 0) throw new Error('أدنى فئة يجب أن تبدأ من 0');
  return withLock_(function () {
    const oldBands = JSON.stringify(getBands_().map(function (b) { return b.min + ':' + b.ar; }));
    const rows = readTable_('Settings').filter(function (r) { return r.key !== 'bands'; });
    rows.push({ key: 'bands', value: JSON.stringify(clean) });
    writeTable_('Settings', rows);
    audit_(ctx, 'bands.save', { entity: 'bands', old: oldBands, new: JSON.stringify(clean.map(function (b) { return b.min + ':' + b.ar; })) });
    yearsList_().forEach(rebuildResults_);
    return clean;
  });
}

function apiSaveFollowUp(item) {
  const ctx = requirePerm_('followup.write');
  const action = String(item.action || '').trim().slice(0, 500);
  if (!action) throw new Error('نص الإجراء مطلوب');
  if (PERIODS.indexOf(item.period) === -1) throw new Error('فترة غير صالحة');
  return withLock_(function () {
    const rows = readTable_('FollowUp'), at = now_();
    let hit = item.id ? rows.filter(function (r) { return r.id === item.id; })[0] : null;
    if (!hit) { hit = { id: 'F' + new Date().getTime().toString(36), by: ctx.email }; rows.push(hit); }
    const isNewF = hit.action === undefined, beforeF = isNewF ? null : { action: hit.action, due: hit.due, status: hit.status, period: hit.period, empId: hit.empId };
    hit.year = Number(item.year); hit.period = item.period; hit.empId = item.empId; hit.action = action;
    hit.due = String(item.due || '').slice(0, 10); hit.status = item.status === 'done' ? 'done' : 'open'; hit.at = at;
    writeTable_('FollowUp', rows);
    const df = diff_(beforeF, hit, ['action', 'due', 'status', 'period', 'empId']);
    if (isNewF || df) audit_(ctx, 'followup.save', { entity: 'followup', year: hit.year, period: hit.period, empId: hit.empId, ref: hit.id, new: hit.status, details: isNewF ? action : df });
    return yearData_(item.year).followups;
  });
}
function apiDeleteFollowUp(id, year) {
  const ctx = requirePerm_('followup.write');
  return withLock_(function () {
    const gone = readTable_('FollowUp').filter(function (r) { return r.id === id; })[0];
    writeTable_('FollowUp', readTable_('FollowUp').filter(function (r) { return r.id !== id; }));
    if (gone) audit_(ctx, 'followup.delete', { entity: 'followup', year: Number(gone.year), period: gone.period, empId: gone.empId, ref: gone.id, old: gone.status, details: gone.action });
    return yearData_(year).followups;
  });
}

/* ------------------------------ Results ------------------------------ */
/** Rewrites the Results sheet rows of one year (a ready-made table for Power BI / pivots). */
function rebuildResults_(year) {
  year = Number(year);
  const d = yearData_(year), bands = getBands_().slice().sort(function (a, b) { return b.min - a.min; });
  const rows = [];
  d.employees.forEach(function (e) {
    PERIODS.forEach(function (p) {
      const r = d.computed.periods[p][e.id];
      if (!r.n) return;
      rows.push({ year: year, period: p, empId: e.id, name: e.name, total: r.total, max: r.max, pct: r.pct, band: r.complete ? bands[r.band].ar : '', scored: r.n, of: r.of, complete: r.complete, status: d.periods[p] ? d.periods[p].status : '' });
    });
    const a = d.computed.annual[e.id];
    if (a.n) rows.push({ year: year, period: 'ANNUAL', empId: e.id, name: e.name, total: a.total, max: a.max, pct: a.pct, band: a.complete ? bands[a.band].ar : '', scored: a.n, of: a.of, complete: a.complete, status: a.fullYear ? 'full year' : 'partial (' + a.quarters + '/4)' });
  });
  const keep = readTable_('Results').filter(function (r) { return Number(r.year) !== year; });
  writeTable_('Results', keep.concat(rows).sort(function (a, b) { return a.year - b.year || (a.period < b.period ? -1 : 1) || (a.empId < b.empId ? -1 : 1); }));
}
function rebuildAllResults() { yearsList_().forEach(rebuildResults_); }

/** Admin-only, from the web page: first-time setup (creates tabs + loads 2025 data and the blank 2026). */
function apiSetup() {
  requirePerm_('setup');
  if (!readTable_('Employees').length && typeof SEED === 'undefined') throw new Error('ملف Seed.gs غير موجود في مشروع Apps Script — أضفه ثم أعد المحاولة');
  setup();
  return apiBoot();
}

/** Menu ▸ clears ALL scores and comments of one year (keeps employees, criteria, status). Asks for the year and a confirmation. */
function clearYearScores() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('مسح درجات سنة', 'اكتب السنة المراد مسح درجاتها وملاحظاتها (مثال 2026). الموظفون والبنود تبقى كما هي.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const y = Number(String(r.getResponseText()).trim());
  if (!y || yearsList_().indexOf(y) === -1) { ui.alert('السنة غير موجودة: ' + r.getResponseText()); return; }
  const n = readTable_('Scores').filter(function (s) { return Number(s.year) === y; }).length;
  if (ui.alert('تأكيد', 'سيتم حذف ' + n + ' درجة وملاحظات السنة ' + y + ' نهائياً. متابعة؟', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  withLock_(function () {
    writeTable_('Scores', readTable_('Scores').filter(function (s) { return Number(s.year) !== y; }));
    writeTable_('Comments', readTable_('Comments').filter(function (s) { return Number(s.year) !== y; }));
    const at = now_();
    writeTable_('Periods', readTable_('Periods').map(function (p) { if (Number(p.year) === y) { p.status = 'draft'; p.note = 'تم مسح الدرجات — جاهزة للإدخال'; p.updatedBy = 'menu'; p.updatedAt = at; } return p; }));
    audit_(null, 'scores.clear', { entity: 'year', year: y, details: n + ' scores and the comments of the year deleted (menu)' });
  });
  rebuildResults_(y);
  ui.alert('تم مسح درجات ' + y);
}


/** Writes criteria + periods + scores of one SEED year (replacing whatever that year held). */
function seedCriteria_(y) { return (SEED.criteriaByYear && SEED.criteriaByYear[y]) || SEED.criteria; }
function loadSeedYear_(y, at) {
  const crit = seedCriteria_(y);
  const status = Number(y) < new Date().getFullYear() ? 'final' : 'draft';
  const derived = SEED.derived && SEED.derived[y];
  const hasScores = PERIODS.some(function (p) { return Object.keys(SEED.years[y][p] || {}).length; });
  const note = derived ? 'مسودة مشتقة من بيانات ' + derived + ' مع تعديل البنود والفريق — درجات استرشادية تُستبدل بالتقييم الفعلي' :
    !hasScores ? 'سنة جديدة — الموظفون والبنود جاهزة بدون درجات' : status === 'draft' ? 'مستورد من ملف Appraisal_form ' + y + ' — يحتاج مراجعة قبل الاعتماد' : 'مستورد من ملف Appraisal_form ' + y;
  const num = Number(y), other = function (r) { return Number(r.year) !== num; };
  writeTable_('Criteria', readTable_('Criteria').filter(other));
  writeTable_('Periods', readTable_('Periods').filter(other));
  writeTable_('Scores', readTable_('Scores').filter(other));
  appendRows_('Criteria', crit.map(function (c) { return { year: num, id: c.id, order: c.order, compEn: c.compEn, compAr: c.compAr, en: c.en, ar: c.ar, max: c.max, by: c.by, active: true }; }));
  appendRows_('Periods', PERIODS.map(function (p) { return { year: num, period: p, status: status, note: note, updatedBy: 'import', updatedAt: at }; }));
  const sc = [];
  PERIODS.forEach(function (p) {
    const per = SEED.years[y][p] || {};
    Object.keys(per).forEach(function (e) {
      per[e].forEach(function (v, i) { if (v !== null && v !== undefined) sc.push({ year: num, period: p, empId: e, critId: crit[i].id, score: v, by: 'import', at: at }); });
    });
  });
  appendRows_('Scores', sc);
  return sc.length;
}

/** Admin: applies the derived draft year of the seed (team + criteria changes + indicative scores) to an EXISTING platform. Replaces that year's scores. */
function apiLoadDraftYear(year) {
  requirePerm_('setup');
  if (typeof SEED === 'undefined') throw new Error('ملف Seed.gs غير موجود أو قديم — الصق نسخة v1.9');
  year = String(year || 2026);
  if (!SEED.derived || !SEED.derived[year]) throw new Error('لا توجد مسودة مشتقة للسنة ' + year + ' في Seed.gs');
  const n = withLock_(function () {
    const at = now_(), have = {}; readTable_('Employees').forEach(function (e) { have[e.id] = e; });
    const emps = readTable_('Employees');
    SEED.employees.forEach(function (e) {
      if (have[e.id]) { if (e.active === false) have[e.id].active = false; }
      else emps.push({ id: e.id, name: e.name, fullName: '', sector: '', active: e.active !== false, order: emps.length + 1 });
    });
    writeTable_('Employees', emps);
    const cnt = loadSeedYear_(year, at);
    audit_(null, 'setup', { entity: 'year', year: Number(year), details: 'draft year ' + year + ' derived from ' + SEED.derived[year] + ': ' + cnt + ' indicative scores, criteria + team changes' });
    return cnt;
  });
  rebuildResults_(Number(year));
  return { loaded: n, boot: apiBoot(), data: yearData_(Number(year)) };
}
function loadDraft2026() { SpreadsheetApp.getUi().alert('تم تحميل ' + apiLoadDraftYear(2026).loaded + ' درجة استرشادية لسنة 2026'); }

/* ------------------------------- Setup ------------------------------- */
/** Menu ▸ 1) — creates every tab and (once) loads the 2025/2026 data from the original workbooks. Safe to re-run. */
function setup() {
  Object.keys(SCHEMA).forEach(sheet_);
  let seeded = false;
  if (!readTable_('Employees').length && typeof SEED !== 'undefined') {
    const at = now_();
    appendRows_('Employees', SEED.employees.map(function (e, i) { return { id: e.id, name: e.name, fullName: '', sector: '', active: e.active !== false, order: i + 1 }; }));
    Object.keys(SEED.years).forEach(function (y) { loadSeedYear_(y, at); });
    writeTable_('Settings', [{ key: 'bands', value: JSON.stringify(DEFAULT_BANDS) }]);
    audit_(null, 'setup', { entity: 'platform', details: 'import 2025/2026 from workbooks' });
    seeded = true;
  }
  setupAccessList();
  rebuildAllResults();
  try { SpreadsheetApp.getActive().toast(seeded ? 'تمت التهيئة وتحميل بيانات 2025 و2026' : 'الأوراق جاهزة (لم تُحمَّل بيانات لأن الموظفين موجودون)', APP_NAME_EN, 8); } catch (e) {}
}
