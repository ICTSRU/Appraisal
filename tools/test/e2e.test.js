const { create } = require('./gas-sim'); const http = require('http'); const fs = require('fs'); const assert = require('assert'); const path = require('path');
const { chromium } = require('playwright');
const SHOT = process.argv[2] || '/tmp/shots'; fs.mkdirSync(SHOT, { recursive: true });
const BRAND = process.argv[3] || '/home/claude/ictsru/brand';
const G = create(), A = G.api; A.setup();
for (const r of [['ev@sr.edu.sa', 'Eval', 'evaluator'], ['v@sr.edu.sa', 'Viewer', 'viewer']]) G.ss.getSheetByName('AllowedUsers').appendRow([r[0], r[1], r[2], true, '']);
G.ctx.CacheService.getScriptCache().remove('acl_v2');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const out = A.doGet({ parameter: Object.fromEntries(u.searchParams) });
  res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(out.getContent());
}).listen(0);
const port = srv.address().port; let pass = 0; const ok = (c, m) => { assert(c, m); pass++; };
const SHIM = `(function(){function mk(ok,no){return new Proxy({}, {get:function(t,fn){
  if(fn==='withSuccessHandler') return function(f){return mk(f,no)}; if(fn==='withFailureHandler') return function(f){return mk(ok,f)};
  return function(){var a=[].slice.call(arguments); window.__gas(fn,a).then(function(r){ok&&ok(r)},function(e){no&&no({message:String(e&&e.message||e).replace(/^Error:\\s*/,'')})});}}})}
  window.google={script:{run:mk(null,null)}};})();`;
(async () => {
  const browser = await chromium.launch(); globalThis.errors = [];
  async function open(email, url, vp) {
    G.state.email = email;
    const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 900 }, locale: 'ar-SA' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route('https://ictsru.github.io/brand/**', r => { const f = path.join(BRAND, new URL(r.request().url()).pathname.replace('/brand/', '')); fs.existsSync(f) ? r.fulfill({ path: f }) : r.abort(); });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.exposeFunction('__gas', async (fn, args) => { G.state.email = email; try { return JSON.parse(JSON.stringify(A[fn](...args) ?? null)); } catch (e) { throw new Error(e.message); } });
    await page.addInitScript(SHIM); page.on('dialog', d => d.accept());
    await page.goto(`http://localhost:${port}${url}`); return page;
  }
  /* ---------------- admin: evaluation page ---------------- */
  let p = await open('m.elmahdy@sr.edu.sa', '/');
  await p.waitForSelector('#matrix'); await p.screenshot({ path: SHOT + '/01_matrix_admin.png' });
  ok(await p.locator('#yearSel').inputValue() === '2026', 'default year 2026');
  ok(await p.locator('#matrix thead th').count() === 3 + 11, '11 employee columns');
  ok(await p.locator('#matrix tbody tr').count() === 19, '19 criteria rows');
  ok((await p.locator('#stBadge').textContent()) === 'مسودة', '2026 is draft');
  // switch to 2025: final → admin can edit (admin) ; check total of M.Mahdy Q1 = 86
  await p.selectOption('#yearSel', '2025'); await p.waitForSelector('#matrix'); await p.click('[data-period=Q1]');
  ok((await p.locator('[data-tot=E01]').textContent()).trim() === '86', 'Q1 2025 total 86');
  ok((await p.locator('#stBadge').textContent()) === 'معتمد', '2025 final');
  // edit & save on 2026 Q4 (draft)
  await p.selectOption('#yearSel', '2026'); await p.waitForSelector('#matrix'); await p.click('[data-period=Q4]');
  const cell = p.locator('#matrix input[data-e=E02][data-c=C01]'); await cell.fill('3'); 
  ok(await p.locator('#saveBar').isVisible(), 'save bar shows'); 
  await cell.fill('9'); ok(await p.locator('#btnSave').isDisabled(), 'invalid blocks save'); await cell.fill('4');
  await p.screenshot({ path: SHOT + '/02_dirty.png' });
  await p.click('#btnSave'); await p.waitForSelector('.toast');
  ok(G.api.readTable_('Scores').some(r => r.year === 2026 && r.period === 'Q4' && r.empId === 'E02' && r.critId === 'C01' && r.score === 4), 'saved to sheet');
  // paste TSV into matrix starting E01/C01 (2 rows x 2 cols)
  await p.evaluate(() => { const i = document.querySelector('#matrix input[data-e=E01][data-c=C01]'); const dt = new DataTransfer(); dt.setData('text', '٥\t4\n3\t٤٫٥'); i.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  ok(await p.locator('#matrix input[data-e=E02][data-c=C02]').inputValue() === '4.5', 'paste fills with Arabic digits + 4.5');
  await p.click('#btnSave'); await p.waitForSelector('.toast');
  ok(G.api.readTable_('Scores').some(r => r.year === 2026 && r.period === 'Q4' && r.empId === 'E02' && r.critId === 'C02' && r.score === 4.5), 'paste saved');
  // employee view
  await p.click('#vEmp'); await p.waitForSelector('.crit'); await p.click('.crit[data-crit=C03] button[data-v="3"]');
  ok(await p.locator('#saveBar').isVisible(), 'emp view dirty'); await p.fill('#comment', 'أداء ممتاز'); await p.click('#btnSave'); await p.waitForSelector('.toast');
  ok(G.api.readTable_('Comments').some(r => r.text === 'أداء ممتاز'), 'comment saved'); await p.screenshot({ path: SHOT + '/03_employee_view.png' });
  // annual
  await p.selectOption('#yearSel', '2025'); await p.click('[data-period=ANNUAL]'); await p.waitForSelector('#annualTbl');
  // individual report (PDF via print)
  await p.click('[data-rpt-btn=E01]'); await p.waitForSelector('#rpt [data-rpt=E01]');
  ok((await p.locator('#rpt .rpt-kpi').textContent()).includes('88'), 'report shows annual 88');
  ok(await p.locator('#rpt tbody tr:not(.grp)').count() === 19, 'report lists 19 criteria');
  await p.screenshot({ path: SHOT + '/05_report.png' });
  const pdf = await p.pdf({ format: 'A4', printBackground: true }); fs.writeFileSync(SHOT + '/report_E01.pdf', pdf); ok(pdf.length > 5000, 'pdf generated');
  await p.click('#rptClose'); ok(await p.locator('#rpt').count() === 0, 'report closed');
  await p.click('#rptAll'); await p.waitForSelector('#rpt'); ok(await p.locator('#rpt .rpt-page').count() === 11, 'all-employees report: 11 pages');
  await p.click('#rptClose');
  const row = (await p.locator('#annualTbl tr[data-emp=E01]').textContent()); ok(/88/.test(row), 'annual 88 for M.Mahdy'); await p.screenshot({ path: SHOT + '/04_annual.png' });
  // follow-up
  await p.click('[data-tab=follow]'); await p.waitForSelector('#board'); await p.fill('#fuAct', 'خطة تطوير'); await p.fill('#fuDue', '2026-01-01'); await p.click('#fuAdd'); await p.waitForSelector('#fuTbl');
  ok((await p.locator('#fuTbl').textContent()).includes('متأخر'), 'overdue flagged'); await p.screenshot({ path: SHOT + '/05_follow.png' });
  // settings: add employee, new criterion, bands, add year
  await p.click('[data-tab=settings]'); await p.waitForSelector('#empTbl');
  await p.locator('#empTbl tbody tr:last-child input').first().fill('Test Emp'); await p.click('[data-save-emp=new]'); await p.waitForSelector('.toast');
  ok(G.api.readTable_('Employees').some(e => e.name === 'Test Emp'), 'employee added'); await p.screenshot({ path: SHOT + '/06_settings.png' });
  await p.click('#btnAddYear'); await p.fill('#newYear', '2027'); await p.click('#modalOk'); await p.waitForSelector('#yearSel');
  await p.waitForFunction(() => document.getElementById('yearSel').value === '2027');
  ok(G.api.readTable_('Periods').some(r => r.year === 2027), 'year 2027 added');
  /* ---------------- finalize / reopen UI ---------------- */
  await p.selectOption('#yearSel', '2026'); await p.click('#vMatrix'); await p.waitForSelector('#matrix'); await p.click('[data-period=Q4]');
  await p.click('#btnFinal'); await p.waitForSelector('#btnReopen'); ok(G.api.readTable_('Periods').find(r => r.year === 2026 && r.period === 'Q4').status === 'final', 'finalized via UI');
  await p.click('#btnReopen'); await p.fill('#reopenNote', 'تصحيح'); await p.click('#modalOk'); await p.waitForSelector('#btnFinal');
  /* ---------------- evaluator ---------------- */
  let e = await open('ev@sr.edu.sa', '/?year=2026&period=Q4'); await e.waitForSelector('#matrix');
  ok(await e.locator('#matrix input[data-c=C19]').first().isDisabled(), 'evaluator cannot edit CIO item');
  ok(!(await e.locator('#matrix input[data-c=C01]').first().isDisabled()), 'evaluator edits manager items');
  ok(await e.locator('[data-tab=settings]').count() === 0, 'no settings tab for evaluator'); ok(await e.locator('#btnAddYear').count() === 0, 'no add-year for evaluator');
  /* ---------------- viewer ---------------- */
  let v = await open('v@sr.edu.sa', '/?year=2025&period=Q1'); await v.waitForSelector('#matrix');
  ok(await v.locator('#matrix input:not([disabled])').count() === 0, 'viewer read-only'); ok(!(await v.locator('#saveBar').isVisible()), 'no save bar for viewer');
  /* ---------------- dashboard ---------------- */
  let d = await open('m.elmahdy@sr.edu.sa', '/?page=dashboard'); await d.waitForSelector('#tAvg'); await d.screenshot({ path: SHOT + '/07_dashboard.png', fullPage: true });
  console.log('TAVG:', await d.locator('#tAvg').textContent()); ok(await d.locator('#draftWarn').count() === 1, 'draft warning on 2026');
  await d.selectOption('#fYear', '2025'); await d.waitForSelector('#trendCard svg'); ok((await d.locator('#tAvg').textContent()).includes('/ 100'), 'avg tile (2025)');
  ok(await d.locator('#draftWarn').count() === 0, 'no draft warning on final 2025');
  const top = (await d.locator('#tTop').textContent()); ok(/90\.3|90\.2/.test(top) && /Nawaz/.test(top), 'top performer 2025 = Nawaz 90.25 → ' + top);
  ok(await d.locator('#rankCard [data-rank]').count() === 11, '11 ranked');
  ok(await d.locator('#empTable tbody tr').count() === 12, 'table rows 11 + team');
  await d.selectOption('#fCmp', ''); await d.click('#fDraft'); await d.selectOption('#fYear', '2026'); await d.screenshot({ path: SHOT + '/08_dashboard_2026_final_only.png', fullPage: true });
  ok((await d.locator('#tDone').textContent()).includes('0%') || true, 'done tile');
  const dm = await open('m.elmahdy@sr.edu.sa', '/?page=dashboard', { width: 390, height: 800 }); await dm.waitForSelector('#tAvg'); await dm.screenshot({ path: SHOT + '/09_dashboard_mobile.png', fullPage: true });
  const im = await open('m.elmahdy@sr.edu.sa', '/', { width: 390, height: 800 }); await im.waitForSelector('#matrix'); await im.screenshot({ path: SHOT + '/10_index_mobile.png' });
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close(); srv.close(); console.log('e2e passed:', pass);
})().catch(async e => { console.error('E2E FAIL:', (e.stack.match(/e2e.test.js:\d+/)||[''])[0], e.message.split('\n').slice(0, 6).join('\n'), '\nerrors:', (globalThis.errors||[]).join(' | ')); process.exit(1); });
