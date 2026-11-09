/**
 * Admin.gs — user management (AllowedUsers) + audit trail (AuditLog).
 * Every function here is admin-only and enforced on the SERVER through requirePerm_() (see PERMS in Code.gs);
 * the browser UI only mirrors it.
 */

const AUDIT_FIELDS = ['at', 'by', 'role', 'action', 'entity', 'year', 'period', 'empId', 'ref', 'old', 'new', 'details'];
const AUDIT_MAX_PAGE = 500;

/* ------------------------------- Audit ------------------------------- */

function clip_(v, n) { v = v === undefined || v === null ? '' : String(v); return v.length > n ? v.slice(0, n - 1) + '…' : v; }
function atStr_(v) { return v instanceof Date ? Utilities.formatDate(v, LOG_TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(v === undefined || v === null ? '' : v); }

/** Builds one audit row. ctx = {email, role} (null for menu/system actions → uses the signed-in editor). */
function auditRow_(ctx, action, f) {
  f = f || {};
  let by = ctx && ctx.email, role = ctx && ctx.role;
  if (!by) { by = currentEmail_() || 'system'; role = role || (by === 'system' ? '' : roleOf_(by)); }
  return { at: now_(), by: by, role: role || '', action: action, entity: f.entity || action.split('.')[0],
    year: f.year === undefined ? '' : f.year, period: f.period || '', empId: f.empId || '', ref: f.ref || '',
    old: clip_(f.old, 300), new: clip_(f.new, 300), details: clip_(f.details, 500) };
}
function audit_(ctx, action, f) { appendRows_('AuditLog', [auditRow_(ctx, action, f)]); }
function auditMany_(rows) { appendRows_('AuditLog', rows); }

/** "name: a → b; active: true → false" for the keys that changed. */
function diff_(before, after, keys) {
  const out = [];
  keys.forEach(function (k) {
    const a = before && before[k] !== undefined ? before[k] : '', b = after[k] !== undefined ? after[k] : '';
    if (String(a) !== String(b)) out.push(k + ': ' + clip_(a, 60) + ' → ' + clip_(b, 60));
  });
  return out.join('; ');
}

/**
 * Admin only. filter = {q, user, action, from:'yyyy-mm-dd', to, year, limit, offset}
 * → {rows (newest first), total, users[], actions[], all}
 */
function apiAudit(filter) {
  requirePerm_('audit.read');
  filter = filter || {};
  const all = readTable_('AuditLog').map(function (r) {
    const o = {}; AUDIT_FIELDS.forEach(function (k) { o[k] = k === 'at' ? atStr_(r[k]) : String(r[k] === undefined || r[k] === null ? '' : r[k]); }); return o;
  });
  const q = String(filter.q || '').trim().toLowerCase();
  const rows = all.filter(function (r) {
    if (filter.user && r.by !== filter.user) return false;
    if (filter.action && r.action !== filter.action) return false;
    if (filter.year && String(r.year) !== String(filter.year)) return false;
    if (filter.from && r.at.slice(0, 10) < filter.from) return false;
    if (filter.to && r.at.slice(0, 10) > filter.to) return false;
    if (q && AUDIT_FIELDS.map(function (k) { return r[k]; }).join(' ').toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).reverse();
  const limit = Math.min(Math.max(Number(filter.limit) || 200, 1), AUDIT_MAX_PAGE), offset = Math.max(Number(filter.offset) || 0, 0);
  const uniq = function (k) { const s = {}; all.forEach(function (r) { if (r[k]) s[r[k]] = 1; }); return Object.keys(s).sort(); };
  return { rows: rows.slice(offset, offset + limit), total: rows.length, all: all.length, users: uniq('by'), actions: uniq('action') };
}

/* -------------------------------- Users ------------------------------- */

function readAccessRows_() {
  const sh = accessSheet_(true), n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return [];
  return sh.getRange(2, 1, n, 5).getValues().filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    return { email: String(r[0]).trim().toLowerCase(), name: String(r[1] || '').trim(), role: ROLES.indexOf(String(r[2]).trim().toLowerCase()) === -1 ? 'viewer' : String(r[2]).trim().toLowerCase(),
             active: !(r[3] === false || String(r[3]).toUpperCase() === 'FALSE'), notes: String(r[4] || '') };
  });
}
function writeAccessRows_(rows) {
  const sh = accessSheet_(true), n = Math.max(sh.getLastRow() - 1, 0);
  if (n) sh.getRange(2, 1, n, 5).clearContent();
  sh.getRange(2, 4, Math.max(rows.length, n, 50), 1).insertCheckboxes();
  if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows.map(function (r) { return [r.email, r.name, r.role, r.active, r.notes]; }));
  CacheService.getScriptCache().remove('acl_v2');
}
function lastLogins_() {
  const out = {};
  try {
    const sh = getLogSheet_(), last = sh.getLastRow();
    if (last < 2) return out;
    const from = Math.max(2, last - 4000 + 1);
    sh.getRange(from, 1, last - from + 1, 6).getValues().forEach(function (r) {
      if (r[5] !== 'دخول' || !r[0]) return;
      const e = String(r[4]).toLowerCase(), t = atStr_(r[0]);
      if (!out[e] || t > out[e]) out[e] = t;
    });
  } catch (e) { console.error('lastLogins_ failed: ' + e); }
  return out;
}

/** Admin only: the user list + the permission matrix. */
function apiUsers() {
  const ctx = requirePerm_('users.manage');
  const rows = readAccessRows_(), logins = lastLogins_(), seen = {};
  const users = rows.map(function (r) {
    seen[r.email] = true;
    return { email: r.email, name: r.name, role: isOwner_(r.email) ? 'admin' : r.role, active: isOwner_(r.email) ? true : r.active, notes: r.notes, owner: isOwner_(r.email), me: r.email === ctx.email, lastLogin: logins[r.email] || '' };
  });
  OWNER_EMAILS.forEach(function (e) {
    e = e.toLowerCase();
    if (!seen[e]) users.unshift({ email: e, name: '', role: 'admin', active: true, notes: 'owner', owner: true, me: e === ctx.email, lastLogin: logins[e] || '' });
  });
  return { users: users, roles: ROLES, perms: PERMS, me: ctx.email };
}

function apiSaveUser(u) {
  const ctx = requirePerm_('users.manage');
  u = u || {};
  const email = String(u.email || '').trim().toLowerCase();
  if (!new RegExp('^[a-z0-9._%+\\-]+@' + ALLOWED_DOMAIN.replace(/\./g, '\\.') + '$').test(email)) throw new Error('يجب إدخال بريد جامعي صحيح من نطاق ' + ALLOWED_DOMAIN);
  const role = String(u.role || '').trim().toLowerCase();
  if (ROLES.indexOf(role) === -1) throw new Error('دور غير صالح');
  if (isOwner_(email)) throw new Error('حساب المالك ثابت ولا يُعدَّل من المنصة');
  return withLock_(function () {
    const rows = readAccessRows_();
    const hit = rows.filter(function (r) { return r.email === email; })[0];
    const active = u.active !== false;
    if (email === ctx.email && (!active || (hit && hit.role !== role))) throw new Error('لا يمكنك تغيير دورك أو إيقاف حسابك بنفسك');
    const name = clip_(String(u.name || '').trim(), 80), notes = clip_(String(u.notes || '').trim(), 200);
    if (hit) {
      const before = { name: hit.name, role: hit.role, active: hit.active, notes: hit.notes };
      hit.name = name; hit.role = role; hit.active = active; hit.notes = notes;
      const d = diff_(before, { name: name, role: role, active: active, notes: notes }, ['name', 'role', 'active', 'notes']);
      writeAccessRows_(rows);
      if (d) audit_(ctx, 'user.update', { entity: 'user', ref: email, old: before.role + (before.active ? '' : ' (off)'), new: role + (active ? '' : ' (off)'), details: d });
    } else {
      rows.push({ email: email, name: name, role: role, active: active, notes: notes || 'added from platform' });
      writeAccessRows_(rows);
      audit_(ctx, 'user.add', { entity: 'user', ref: email, new: role, details: name });
    }
    if (!rows.some(function (r) { return r.role === 'admin' && r.active; }) && !OWNER_EMAILS.length) throw new Error('يجب أن يبقى مدير واحد فعّال على الأقل');
    return apiUsers();
  });
}

function apiDeleteUser(email) {
  const ctx = requirePerm_('users.manage');
  email = String(email || '').trim().toLowerCase();
  if (isOwner_(email)) throw new Error('حساب المالك ثابت ولا يُعدَّل من المنصة');
  if (email === ctx.email) throw new Error('لا يمكنك حذف حسابك بنفسك');
  return withLock_(function () {
    const rows = readAccessRows_(), hit = rows.filter(function (r) { return r.email === email; })[0];
    if (!hit) throw new Error('المستخدم غير موجود');
    writeAccessRows_(rows.filter(function (r) { return r.email !== email; }));
    audit_(ctx, 'user.delete', { entity: 'user', ref: email, old: hit.role + (hit.active ? '' : ' (off)'), details: hit.name });
    return apiUsers();
  });
}
