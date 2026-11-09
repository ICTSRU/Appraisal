const { create } = require('./gas-sim'); const http=require('http'); const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path');
const G=create(), A=G.api; A.setup(); G.state.email='m.elmahdy@sr.edu.sa';
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');const o=A.doGet({parameter:Object.fromEntries(u.searchParams)});r.setHeader('content-type','text/html; charset=utf-8');r.end(o.getContent());}).listen(0);
const SHIM=fs.readFileSync(__dirname+'/e2e.test.js','utf8').match(/const SHIM = `([\s\S]*?)`;/)[1];
const SHOT=process.argv[2]||'/tmp/shots_i18n'; fs.mkdirSync(SHOT,{recursive:true});
const BRAND=process.argv[3]||'/home/claude/ictsru/brand'; const assert=require('assert'); let pass=0; const ok=(c,m)=>{assert(c,m);pass++};
(async()=>{const b=await chromium.launch();
 async function open(url,lang,theme,vp){const c=await b.newContext({viewport:vp||{width:1366,height:900}});
  if(lang) await c.addInitScript(([l,t])=>{try{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('appr_lang',l);localStorage.setItem('appr_theme',t)}}catch(e){}},[lang,theme]);
  await c.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await c.route('https://ictsru.github.io/brand/**',r=>{const f=path.join(BRAND,new URL(r.request().url()).pathname.replace('/brand/',''));fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
  const p=await c.newPage(); p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('dialog',d=>d.accept());
  await p.exposeFunction('__gas',async(fn,a)=>{G.state.email='m.elmahdy@sr.edu.sa';try{return JSON.parse(JSON.stringify(A[fn](...a)??null))}catch(e){throw new Error(e.message)}});
  await p.addInitScript(SHIM); await p.goto('http://localhost:'+srv.address().port+url); return p;}
 const ar=/[؀-ۿ]/;
 async function arabicLeft(p){return p.evaluate(()=>{const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const s=n.nodeValue.trim();if(s&&/[؀-ۿ]/.test(s)&&!n.parentElement.closest('script,style'))out.push(s.slice(0,70))}
   document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e=>{['placeholder','title','aria-label'].forEach(a=>{const v=e.getAttribute(a);if(v&&/[؀-ۿ]/.test(v))out.push(a+':'+v.slice(0,60))})});return [...new Set(out)]})}
 // index EN light
 let p=await open('/?year=2025&period=Q1','en','light'); await p.waitForSelector('#matrix'); ok(await p.evaluate(()=>document.documentElement.dir==='ltr'&&document.documentElement.lang==='en'),'en → ltr'); await p.screenshot({path:SHOT+'/en_matrix.png'}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'MATRIX English mode has Arabic: '+l.join(' | '));}
 await p.click('#vEmp'); await p.waitForSelector('.crit'); await p.screenshot({path:SHOT+'/en_emp.png'}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'EMP English mode has Arabic: '+l.join(' | '));}
 await p.click('[data-period=ANNUAL]'); await p.waitForSelector('#annualTbl'); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'ANNUAL English mode has Arabic: '+l.join(' | '));}
 await p.click('[data-rpt-btn=E01]'); await p.waitForSelector('#rpt'); await p.screenshot({path:SHOT+'/en_report.png'}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'REPORT English mode has Arabic: '+l.join(' | '));} await p.click('#rptClose');
 await p.click('[data-tab=follow]'); await p.waitForSelector('#board'); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'FOLLOW English mode has Arabic: '+l.join(' | '));}
 await p.click('[data-tab=users]'); await p.waitForSelector('#usersTbl'); await p.screenshot({path:SHOT+'/en_users.png',fullPage:true}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'USERS English mode has Arabic: '+l.join(' | '));}
 await p.click('[data-tab=audit]'); await p.waitForSelector('#auditTbl'); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'AUDIT English mode has Arabic: '+l.join(' | '));}
 await p.click('[data-tab=settings]'); await p.waitForTimeout(300); await p.screenshot({path:SHOT+'/en_settings.png',fullPage:true}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'SET English mode has Arabic: '+l.join(' | '));}
 // dashboard EN dark
 p=await open('/?page=dashboard&year=2025','en','dark'); await p.waitForSelector('#tAvg'); await p.screenshot({path:SHOT+'/en_dash_dark.png',fullPage:true}); {const l=(await arabicLeft(p)).filter(x=>x!=='عربي'&&!/^(title|aria-label):العربية$/.test(x)); ok(l.length===0,'DASH English mode has Arabic: '+l.join(' | '));}
 // index AR dark
 p=await open('/?year=2025&period=Q1','ar','dark'); await p.waitForSelector('#matrix'); await p.screenshot({path:SHOT+'/ar_matrix_dark.png'});
 await p.click('#vEmp'); await p.waitForSelector('.crit'); await p.screenshot({path:SHOT+'/ar_emp_dark.png'});
 // toggle test
 p=await open('/?year=2025&period=Q1','ar','light'); await p.waitForSelector('#matrix'); await p.click('#btnLang'); await p.waitForSelector('#matrix'); ok(await p.evaluate(()=>localStorage.getItem('appr_lang'))==='en'&&await p.evaluate(()=>document.documentElement.lang)==='en','lang toggle → en');
 await p.click('#btnTheme'); ok(await p.evaluate(()=>document.documentElement.dataset.theme)==='dark','theme toggle → dark');
 await b.close(); srv.close(); console.log('i18n passed:',pass);})().catch(e=>{console.log('I18N FAIL:',e.message);process.exit(1)});
