// Local browser + in-memory .gs services only. No Google/production DB traffic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHarness} from './gas-harness.mjs';
import {MATERIAL_CATALOG} from '../assets/js/material-catalog.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/',url='https://script.google.com/macros/s/test/exec',h=createHarness();
h.context.syncMaterialCatalog();
const report={},errors=[],contexts=[];
const ready=p=>p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
async function client(hash,{mock=false,width=1440,catalog}={}) {
 const ctx=await browser.newContext({viewport:{width,height:1000}}),calls=[],pdfs=[],control={fail:false};contexts.push(ctx);
 ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 ctx.on('request',r=>{if(/\.pdf(?:$|\?)/.test(r.url()))pdfs.push(r.url());});
 if(catalog)await ctx.route('**/assets/js/material-catalog.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const MATERIAL_CATALOG='+JSON.stringify(catalog)+';'}));
 // Verify the existing PDF target without exercising an installed PDF viewer.
 await ctx.route('**/assets/brochures/*.pdf',r=>r.fulfill({status:204}));
 if(!mock){
  await ctx.route('**/assets/js/runtime-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,availabilityMs:5000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
  await ctx.route(url+'**',async r=>{
   const q=r.request(),input=q.method()==='GET'?Object.fromEntries(new URL(q.url()).searchParams):JSON.parse(q.postData());
   calls.push({input,method:q.method(),url:q.url()});
   if(control.fail&&input.action==='logMaterialView')return r.abort('failed');
   const reply=await h.fetch(q.url(),{method:q.method(),body:q.postData()});
   await r.fulfill({contentType:'application/json',body:await reply.text()});
  });
 }
 const p=await ctx.newPage();await p.clock.install();await p.goto(base+'#'+hash);await ready(p);return {p,ctx,calls,pdfs,control};
}
async function go(c,hash){await c.p.evaluate(h=>{location.hash=h;},hash);await c.p.waitForFunction(h=>location.hash==='#'+h,hash);await ready(c.p);}
async function login(c,mock=false){
 await c.p.locator('[name="id"]').fill(mock?'ITSKOREA9911':h.admin.id);await c.p.locator('[name="password"]').fill(mock?'ITSKOREA9911!':h.admin.password);
 await c.p.locator('#admin-login-form button[type="submit"]').click();await c.p.locator('#material-analytics').waitFor();await ready(c.p);
}
async function openPdf(c,index=0){
 const seen=c.ctx.waitForEvent('request',r=>/\.pdf$/.test(r.url()));
 await c.p.locator('#main [data-material-id]').nth(index).click();await seen;
 if(!c.control.fail && c.calls.some(x=>x.input.action==='logMaterialView'))await c.p.waitForTimeout(80);
 for(const p of c.ctx.pages())if(p!==c.p)await p.close();
}
try{
 const c=await client('home');
 assert.deepEqual(c.calls,[]);assert.deepEqual(c.pdfs,[]);assert.equal(await c.p.locator('.event-entry-card').count(),2);
 await c.p.locator('a[href="#business"]').click();await c.p.locator('.role-choices').waitFor();
 assert.equal(await c.p.locator('.role-choice').count(),2);assert.equal(await c.p.locator('.welcome-admin').count(),0);
 await c.p.locator('.its-choice').click();await c.p.locator('#application-form').waitFor();await ready(c.p);
 assert.equal(await c.p.locator('#sidebar [data-route="npu"]').isVisible(),false);report.originalBusinessEntry=true;
 await go(c,'materials');assert.equal(await c.p.locator('[data-material-company]').count(),4);
 assert.match(await c.p.locator('#materials-its').innerText(),/발표자료 준비 중/);assert.equal(await c.p.locator('.material-resource.pending button[disabled]').count(),4);
 assert.equal(await c.p.locator('#sidebar [data-route="admin"]').isVisible(),false);
 const count=c.calls.length;await c.p.locator('.material-resource.pending button').evaluateAll(nodes=>nodes.forEach(n=>n.click()));assert.equal(c.calls.length,count);assert.equal(c.pdfs.length,0);
 await c.p.locator('[data-material-jump="materials-npu"]').click();assert.equal(new URL(c.p.url()).hash,'#materials');
 report.pending={noPdfRequests:true,noClickLogs:true,itsEmpty:true};
 const admin=await client('admin');await login(admin);assert.equal(admin.calls.some(x=>x.input.action==='getMaterialStatistics'),false);
 await admin.p.locator('#refresh-material-stats').click();await admin.p.getByText('아직 자료 열람 기록이 없습니다',{exact:true}).waitFor();report.emptyStats=true;
 await openPdf(c);await c.p.waitForFunction(()=>sessionStorage.getItem('knpu-material-visit-v1'));
 await admin.p.locator('#refresh-material-stats').click();await admin.p.waitForFunction(()=>document.querySelector('.material-metrics strong')?.textContent==='1');
 const second=await client('materials',{width:390});await openPdf(second,1);
 await admin.p.locator('#refresh-material-stats').click();await admin.p.waitForFunction(()=>document.querySelector('.material-metrics strong')?.textContent==='2');
 assert.equal(await admin.p.locator('.material-metrics strong').nth(1).innerText(),'2');
 assert.equal(await c.p.evaluate(()=>Object.keys(localStorage).length),0);
 const logCall=c.calls.find(x=>x.input.action==='logMaterialView');
 assert.equal(logCall.method,'POST');assert.equal(new URL(logCall.url).search,'');assert.equal(logCall.input.token,undefined);
 assert.deepEqual(Object.keys(logCall.input).sort(),['action','apiVersion','clickId','materialId','sessionId']);
 report.clickStats={mobileToPc:true,uniqueSessions:2,registeredBrochure:true,bodyOnly:true};
 await admin.p.locator('#material-stats-filters [name="materialType"]').selectOption('presentation');
 await admin.p.locator('#material-stats-filters button[type="submit"]').click();await admin.p.waitForFunction(()=>document.querySelector('.material-metrics strong')?.textContent==='0');
 assert.equal(await admin.p.locator('#material-stats-results tbody tr').first().locator('td').nth(2).innerText(),'발표자료');report.filters=true;
 const synthetic=structuredClone(MATERIAL_CATALOG);synthetic.companies.push({companyId:'mock-its',companyType:'ITS',name:'검증용 ITS (mock)'});
 synthetic.materials.push({materialId:'ITS-MOCK-PITCH',companyId:'mock-its',companyType:'ITS',materialType:'presentation',title:'mock 발표자료',filePath:null,available:false,publicApproved:false});
 const future=await client('materials',{catalog:synthetic});assert.equal(await future.p.locator('[data-material-company="mock-its"]').count(),1);assert.equal(future.pdfs.length,0);assert.equal(future.calls.length,0);report.futureIts=true;
 const mock=await client('materials',{mock:true,width:390});await openPdf(mock);
 await mock.p.waitForFunction(()=>JSON.parse(localStorage.getItem('knpu-material-clicks-demo-v1')||'[]').length===1);
 await go(mock,'admin');await login(mock,true);await mock.p.locator('#refresh-material-stats').click();await mock.p.waitForFunction(()=>document.querySelector('.material-metrics strong')?.textContent==='1');report.mockIsolation=true;
 c.control.fail=true;const before=c.calls.filter(x=>x.input.action==='logMaterialView').length;
 await openPdf(c);await c.p.locator('#toast').filter({hasText:'열람 기록은 저장하지 못했습니다'}).waitFor();
 assert.equal(c.calls.filter(x=>x.input.action==='logMaterialView').length,before+1);report.loggingFailureDoesNotBlockPdf=true;
 await fs.mkdir('artifacts',{recursive:true});report.screens=[];
 for(const width of [320,390,768,1440]){
  await c.p.setViewportSize({width,height:1000});
  for(const hash of ['home','business','materials']){
   await go(c,hash);await c.p.evaluate(()=>{document.querySelector('#toast').hidden=true;});assert.equal(await c.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(hash==='materials'||hash==='home')await c.p.screenshot({path:'artifacts/v4-'+hash+'-'+width+'.png',fullPage:true});
  }
  report.screens.push({width,noPageOverflow:true});
 }
 await admin.p.setViewportSize({width:390,height:844});assert.equal(await admin.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await admin.p.screenshot({path:'artifacts/v4-admin-mobile.png',fullPage:true});report.adminMobile=true;
 assert.deepEqual(errors,[]);await fs.writeFile('artifacts/materials-v4-browser-results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));console.log('PASS: V4 portal/materials/anonymous clicks/admin stats/local mock; no real Google calls.');
}finally{await browser.close();}
