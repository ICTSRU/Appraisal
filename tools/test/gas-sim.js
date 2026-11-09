/* Minimal Google Apps Script simulator: loads the real apps-script/*.gs files into one vm context
 * with an in-memory spreadsheet, so server logic and pages can be tested without Google. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', '..', 'apps-script');

function chain() { const p = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : p), apply: () => p }); return p; }

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  _ensure(r, c) { while (this.data.length < r) this.data.push([]); for (let i = 0; i < r; i++) while (this.data[i].length < c) this.data[i].push(''); }
  getLastRow() { for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1; return 0; }
  getLastColumn() { return Math.max(0, ...this.data.map(r => r.length)); }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') return chain();
    nr = nr || 1; nc = nc || 1; const sh = this;
    return new Proxy({
      getValues() { sh._ensure(r + nr - 1, c + nc - 1); return sh.data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)); },
      setValues(v) { sh._ensure(r + v.length - 1, c + v[0].length - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.data[r - 1 + i][c - 1 + j] = x; })); return this; },
      clearContent() { sh._ensure(r + nr - 1, c + nc - 1); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = ''; return this; },
      insertCheckboxes() { return this; }
    }, { get: (t, k) => (k in t ? t[k] : () => chain()) });
  }
  setFrozenRows() {} setRightToLeft() {} setColumnWidth() {}
  appendRow(row) { this.data.push(row.slice()); }
  deleteRow(i) { this.data.splice(i - 1, 1); }
}
class Spreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }
  toast() {}
}

function create(opts = {}) {
  const ss = new Spreadsheet(), cache = {}, state = { email: 'm.elmahdy@sr.edu.sa' };
  const fmtDate = (d, tz, p) => {
    const t = new Date(d.getTime() + 3 * 3600e3), z = n => String(n).padStart(2, '0');
    const m = { yyyy: t.getUTCFullYear(), MM: z(t.getUTCMonth() + 1), dd: z(t.getUTCDate()), HH: z(t.getUTCHours()), mm: z(t.getUTCMinutes()), ss: z(t.getUTCSeconds()), u: t.getUTCDay() || 7 };
    return p.replace(/yyyy|MM|dd|HH|mm|ss|u/g, k => m[k]);
  };
  const sandbox = {
    console, SpreadsheetApp: { getActiveSpreadsheet: () => ss, getActive: () => ss, openById: () => ss, getUi: () => chain() },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => state.email }) },
    Utilities: { formatDate: fmtDate },
    ScriptApp: { getService: () => ({ getUrl: () => 'http://localhost/exec' }) },
    HtmlService: {
      createTemplateFromFile(name) {
        const t = { evaluate() { return { setTitle() { return this; }, addMetaTag() { return this; }, setFaviconUrl() { return this; }, getContent: () => render(name, t) }; } };
        return t;
      },
      createHtmlOutputFromFile(name) { return { getContent: () => fs.readFileSync(path.join(DIR, name + '.html'), 'utf8') }; }
    }
  };
  const ctx = vm.createContext(sandbox);
  function render(name, vars) {
    const src = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
    return src.replace(/<\?!=\s*([\s\S]*?)\?>/g, (m, expr) => String(vm.runInContext('(' + expr + ')', Object.assign(ctx, vars))));
  }
  const files = ['Calc.gs', 'Code.gs', 'Seed.gs', 'Api.gs'];
  vm.runInContext(files.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n;\n') +
    '\n;this.__api = {' + 'setup, apiBoot, apiYear, apiDataset, apiSaveScores, apiSetStatus, apiAddYear, apiSaveEmployee, apiSaveCriterion, apiSaveBands, apiSaveFollowUp, apiDeleteFollowUp, doGet, computeYear_, PERIODS, readTable_, roleOf_, accessStatus_, currentEmail_, rebuildAllResults, clearYearScores };', ctx);
  return { ss, state, api: ctx.__api, ctx, render };
}
module.exports = { create };
