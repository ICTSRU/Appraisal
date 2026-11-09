/**
 * =====================================================================
 *  SRU Performance Appraisal Platform (منصة المتابعة والتقييم السنوي للأداء) v1.1
 *  Built on SRU Secure Access Kit v1.4 — Sulaiman Al Rajhi University Google accounts (@sr.edu.sa) only
 *  ICTD — ITOC
 * ---------------------------------------------------------------------
 *  Files:  Code.gs (access · routing · menu) · Api.gs (data + server calls) · Calc.gs (scoring) · Seed.gs (2025/2026 import)
 *          Index.html (evaluation page) · Dashboard.html (dashboard page) · Style.html · Header.html · Footer.html · Logos.html · Denied.html
 *  Deploy: Deploy ▸ New deployment ▸ Web app
 *          Execute as: Me  ·  Who has access: Anyone within Sulaiman Al Rajhi University
 *  Pages:  <exec URL>               → التقييم والمتابعة
 *          <exec URL>?page=dashboard → لوحة المؤشرات (صفحة منفصلة)
 *  Access list: sheet "AllowedUsers" (email · name · role · active · notes)
 *               role = admin | evaluator | cio | viewer   (see README)
 *  Access log:  every sign-in → sheet "AccessLog"
 * =====================================================================
 */

/* ▼▼▼ CONFIG — change per platform ▼▼▼ */
const APP_NAME       = 'منصة المتابعة والتقييم السنوي للأداء';
const APP_NAME_EN    = 'SRU Performance Appraisal';
const APP_VERSION    = '1.1';
const ALLOWED_DOMAIN = 'sr.edu.sa';
const FAVICON_URL    = 'https://ictsru.github.io/ITOC/assets/itoc-logo.png';

/* Where the data lives: '' = the spreadsheet this script is bound to; or paste a Sheet ID */
const DATA_SPREADSHEET_ID = '';

/* Access log */
const LOG_ENABLED        = true;
const LOG_SPREADSHEET_ID = '';
const SHEET_LOG          = 'AccessLog';
const LOG_TIMEZONE       = 'Asia/Riyadh';
const LOG_DEDUP_MINUTES  = 30;            // same user within N min = one entry (0 = log every page open)
const LOG_RETENTION_DAYS = 180;
/* Access list */
const ACCESS_MODE        = 'LIST';         // 'LIST' = only active emails in AllowedUsers · 'DOMAIN' = any @sr.edu.sa account
const ACCESS_SPREADSHEET_ID = '';
const SHEET_ACCESS       = 'AllowedUsers';
const OWNER_EMAILS       = ['m.elmahdy@sr.edu.sa']; // always allowed, always admin
/* Public repo → keep this empty; the real list (e-mail, name, role) lives only in the AllowedUsers tab. */
const DEFAULT_ALLOWED    = [];
const ACCESS_CACHE_SECONDS = 120;
/* ▲▲▲ CONFIG ▲▲▲ */

const LOG_HEADERS = ['timestamp', 'date', 'time', 'day', 'email', 'result', 'version'];
const DAYS_AR_    = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ROLES       = ['admin', 'evaluator', 'cio', 'viewer'];

/* ----------------------------- Web app ------------------------------ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status !== 'ok') {
    logAccess_(email || '(unknown)', status === 'list' ? 'not-listed' : 'denied');
    const d = HtmlService.createTemplateFromFile('Denied');
    d.appName = APP_NAME; d.appNameEn = APP_NAME_EN; d.userEmail = email || '';
    const acc = accountUrls_(String(p.page || ''));
    d.switchUrl = acc.switchUrl; d.logoutUrl = acc.logoutUrl; d.reason = status;
    return d.evaluate().setTitle(APP_NAME + ' | غير مصرح').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  logAccess_(email, 'granted');

  const page = String(p.page || '').toLowerCase() === 'dashboard' ? 'dashboard' : 'index';
  const base = ScriptApp.getService().getUrl();
  const acc = accountUrls_(page === 'dashboard' ? 'dashboard' : '');
  const boot = {
    app: APP_NAME, appEn: APP_NAME_EN, version: APP_VERSION, page: page,
    user: email, userName: userName_(email), role: roleOf_(email),
    urls: { index: base, dashboard: base + '?page=dashboard', switchUrl: acc.switchUrl },
    params: { year: String(p.year || '').slice(0, 4), period: String(p.period || '').slice(0, 6) }
  };
  const t = HtmlService.createTemplateFromFile(page === 'dashboard' ? 'Dashboard' : 'Index');
  t.bootJson = safeJson_(boot);
  const out = t.evaluate()
    .setTitle((page === 'dashboard' ? 'لوحة المؤشرات' : 'التقييم والمتابعة') + ' | ' + APP_NAME_EN)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (FAVICON_URL) out.setFaviconUrl(FAVICON_URL);
  return out;
}

/* ------------------------------ Access ------------------------------ */

function currentEmail_() { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }
function isAllowed_(email) { return !!email && email.endsWith('@' + ALLOWED_DOMAIN); }

/** EVERY function called through google.script.run starts with requireRole_(). */
function requireRole_(allowed) {
  const email = currentEmail_();
  const status = accessStatus_(email);
  if (status === 'domain') throw new Error('غير مصرح — الدخول لمنسوبي الجامعة فقط');
  if (status === 'list') throw new Error('غير مصرح — حسابك غير مضاف إلى قائمة المصرّح لهم');
  const role = roleOf_(email);
  if (allowed && allowed.indexOf(role) === -1) throw new Error('غير مصرح — صلاحيتك (' + role + ') لا تسمح بهذا الإجراء');
  return { email: email, role: role };
}

const ACCESS_HEADERS = ['email', 'name', 'role', 'active', 'notes'];

/** Map email → {role, name} of ACTIVE rows (cached briefly). */
function aclMap_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('acl_v2');
  if (hit) return JSON.parse(hit);
  const map = {};
  try {
    const sh = accessSheet_(false);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
        if (!r[0] || r[3] === false || String(r[3]).toUpperCase() === 'FALSE') return;
        let role = String(r[2] || '').trim().toLowerCase();
        if (ROLES.indexOf(role) === -1) role = 'viewer';          // 'user' / blank / unknown → read-only
        map[String(r[0]).trim().toLowerCase()] = { role: role, name: String(r[1] || '').trim() };
      });
    }
  } catch (e) { console.error('aclMap_ failed: ' + e); }
  cache.put('acl_v2', JSON.stringify(map), ACCESS_CACHE_SECONDS);
  return map;
}
function isOwner_(email) { return OWNER_EMAILS.map(function (e) { return e.toLowerCase(); }).indexOf(email) !== -1; }
function roleOf_(email) {
  if (isOwner_(email)) return 'admin';
  const m = aclMap_()[email];
  return m ? m.role : 'viewer';
}
/** 'ok' | 'domain' | 'list' */
function accessStatus_(email) {
  if (!isAllowed_(email)) return 'domain';
  if (ACCESS_MODE !== 'LIST') return 'ok';
  if (isOwner_(email)) return 'ok';
  return aclMap_()[email] ? 'ok' : 'list';
}
function userName_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return '';
  const m = aclMap_()[email];
  if (m && m.name) return m.name;
  return email.split('@')[0].split(/[._-]+/).filter(String)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1) + (w.length === 1 ? '.' : ''); }).join(' ');
}
function accountUrls_(page) {
  const app = ScriptApp.getService().getUrl() + (page ? '?page=' + page : '');
  const chooser = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(app);
  const out = 'https://accounts.google.com/Logout?continue=' + encodeURIComponent(chooser);
  return { switchUrl: out, logoutUrl: out };
}

function accessSheet_(create) {
  const ss = ACCESS_SPREADSHEET_ID ? SpreadsheetApp.openById(ACCESS_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_ACCESS);
  if (!sh && create) {
    sh = ss.insertSheet(SHEET_ACCESS);
    sh.getRange(1, 1, 1, ACCESS_HEADERS.length).setValues([ACCESS_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#501e8c');
    sh.setFrozenRows(1); sh.setRightToLeft(true);
    [260, 200, 110, 70, 260].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange(2, 4, 300, 1).insertCheckboxes();
    sh.getRange('A1').setNote('البريد الجامعي كاملًا — name@sr.edu.sa');
    sh.getRange('C1').setNote('admin = مدير المنصة · evaluator = مقيّم · cio = تقييم الـ CIO فقط · viewer = اطلاع فقط (لوحة المؤشرات)');
    sh.getRange('D1').setNote('ألغِ العلامة لإيقاف الوصول دون حذف الصف');
  }
  return sh;
}

/** Run once from the editor/menu: creates AllowedUsers and adds the owner(s). Existing rows are kept. */
function setupAccessList() {
  const sh = accessSheet_(true);
  const n = Math.max(sh.getLastRow() - 1, 0);
  const data = n ? sh.getRange(2, 1, n, 5).getValues() : [];
  const kept = data.filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return [String(r[0]).trim(), r[1], r[2], r[3] === true || String(r[3]).toUpperCase() === 'TRUE', r[4]]; });
  const have = kept.map(function (r) { return r[0].toLowerCase(); });
  const seed = OWNER_EMAILS.map(function (e) { return [e, 'Owner', 'admin', 'owner']; }).concat(DEFAULT_ALLOWED);
  seed.forEach(function (r) {
    const e = String(r[0]).trim().toLowerCase();
    if (e && have.indexOf(e) === -1) { kept.push([e, r[1] || '', r[2] || 'viewer', true, r[3] || 'added by setupAccessList']); have.push(e); }
  });
  if (n) sh.getRange(2, 1, n, 5).clearContent();
  sh.getRange(2, 4, Math.max(n, kept.length, 50), 1).insertCheckboxes();
  if (kept.length) sh.getRange(2, 1, kept.length, 5).setValues(kept);
  CacheService.getScriptCache().remove('acl_v2');
}

/* ---------------------------- Access log ---------------------------- */

function logAccess_(email, result) {
  if (!LOG_ENABLED) return;
  try {
    if (LOG_DEDUP_MINUTES > 0 && result === 'granted') {
      const cache = CacheService.getScriptCache();
      const key = 'log_' + email;
      if (cache.get(key)) return;
      cache.put(key, '1', LOG_DEDUP_MINUTES * 60);
    }
    const now = new Date();
    const f = function (p) { return Utilities.formatDate(now, LOG_TIMEZONE, p); };
    getLogSheet_().appendRow([now, f('yyyy-MM-dd'), f('HH:mm:ss'), DAYS_AR_[Number(f('u')) % 7], email,
      result === 'granted' ? 'دخول' : (result === 'not-listed' ? 'غير مدرج' : 'مرفوض'), APP_VERSION]);
  } catch (e) { console.error('logAccess_ failed: ' + e); }
}
function getLogSheet_() {
  const ss = LOG_SPREADSHEET_ID ? SpreadsheetApp.openById(LOG_SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet: bind the script to a Sheet or set LOG_SPREADSHEET_ID');
  let sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setFontColor('#ffffff').setBackground('#3a1464');
    sh.setFrozenRows(1); sh.setRightToLeft(true);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    [170, 100, 80, 80, 260, 80, 70].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}
function showLogSummary() {
  const sh = getLogSheet_(), ui = SpreadsheetApp.getUi(), last = sh.getLastRow();
  if (last < 2) { ui.alert('سجل الدخول', 'لا توجد سجلات بعد.', ui.ButtonSet.OK); return; }
  const since = new Date(Date.now() - 30 * 864e5);
  const rows = sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues()
    .filter(function (r) { return r[0] instanceof Date && r[0] >= since && r[5] === 'دخول'; });
  const users = {};
  rows.forEach(function (r) { users[r[4]] = (users[r[4]] || 0) + 1; });
  const top = Object.keys(users).sort(function (a, b) { return users[b] - users[a]; }).slice(0, 10)
    .map(function (u, i) { return (i + 1) + '. ' + u + ' — ' + users[u]; }).join('\n');
  ui.alert('سجل الدخول — آخر 30 يومًا — ' + APP_NAME,
    'عدد الزيارات: ' + rows.length + '\nعدد المستخدمين: ' + Object.keys(users).length + '\n\nالأكثر دخولًا:\n' + (top || '—'), ui.ButtonSet.OK);
}
function purgeOldLogs() {
  const sh = getLogSheet_(), last = sh.getLastRow();
  let removed = 0;
  if (last > 1) {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 864e5);
    const stamps = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = stamps.length - 1; i >= 0; i--) if (stamps[i][0] instanceof Date && stamps[i][0] < cutoff) { sh.deleteRow(i + 2); removed++; }
  }
  SpreadsheetApp.getActive().toast('حُذف ' + removed + ' سجل أقدم من ' + LOG_RETENTION_DAYS + ' يومًا.', APP_NAME_EN, 6);
}

/** Sheet menu (bound script). */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(APP_NAME_EN)
      .addItem('1) تهيئة المنصة وتحميل بيانات 2025 و2026', 'setup')
      .addItem('2) إعداد قائمة المصرّح لهم (AllowedUsers)', 'setupAccessList')
      .addSeparator()
      .addItem('إعادة بناء ورقة Results', 'rebuildAllResults')
      .addItem('ملخص سجل الدخول (30 يومًا)', 'showLogSummary')
      .addItem('حذف سجلات الدخول القديمة', 'purgeOldLogs')
      .addSeparator()
      .addItem('عرض رابط المنصة', 'showWebAppUrl')
      .addToUi();
  } catch (e) { /* standalone script: no sheet UI */ }
}
function showWebAppUrl() {
  const ui = SpreadsheetApp.getUi();
  const u = ScriptApp.getService().getUrl();
  ui.alert('رابط ' + APP_NAME, u ? u + '\n\nلوحة المؤشرات:\n' + u + '?page=dashboard' : 'لم يُنشر بعد: Deploy ▸ New deployment ▸ Web app', ui.ButtonSet.OK);
}

/* ----------------------------- Helpers ------------------------------ */
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function safeJson_(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
