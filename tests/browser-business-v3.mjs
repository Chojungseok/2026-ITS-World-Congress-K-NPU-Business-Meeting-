// Local browser regression with actual GAS source and Google service doubles. No production writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createHarness} from './gas-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const h=createHarness(),url='https://script.google.com/macros/s/test/exec',base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/';
const errors=[],report={widths:[320,360,390,430,768,1024,1280,1440,1920]},contexts=[];
const ready=p=>p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
async function client(hash,width=1440,{mock=false,failLogo=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000}});contexts.push(ctx);
 const calls=[],pdf=[];
 ctx.on('request',r=>{if(r.url().includes('.pdf'))pdf.push(r.url());});
 if(!mock){
 await ctx.route('**/assets/js/runtime-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
 await ctx.route(url+'**',async route=>{const r=route.request(),action=r.method()==='GET'?new URL(r.url()).searchParams.get('action'):JSON.parse(r.postData()).action;calls.push(action);const response=await h.fetch(r.url(),{method:r.method(),body:r.postData()});await route.fulfill({contentType:'application/json',body:await response.text()});});
 }
 if(failLogo)await ctx.route('**/assets/logos/deepx-logo.svg',r=>r.fulfill({status:404,body:''}));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base+'#'+hash);await ready(page);
 return {ctx,page,calls,pdf};
}
async function navigate(p,hash){await p.evaluate(hash=>location.hash=hash,hash);await p.waitForFunction(hash=>location.hash==='#'+hash,hash);await ready(p);}
async function adminLogin(p){await p.locator('[name="id"]').fill(h.admin.id);await p.locator('[name="password"]').fill(h.admin.password);await p.locator('#admin-login-form button[type="submit"]').click();await p.locator('#extend-schedule').waitFor();await ready(p);}
async function providerLogin(p){await p.locator('[name="providerId"]').selectOption('deepx');await p.locator('[name="approvalCode"]').fill(h.credentials.deepx);await p.locator('#provider-login-form button[type="submit"]').click();await p.locator('.status-tabs').waitFor();await ready(p);}
async function fits(p,label){
 const metrics=await p.evaluate(()=>({width:innerWidth,body:document.documentElement.scrollWidth,main:document.querySelector('#main').scrollWidth,logos:[...document.querySelectorAll('[data-provider-logo]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,fit:getComputedStyle(e).objectFit,alt:e.alt}))}));
 assert.ok(metrics.body<=metrics.width+1,label+' horizontal overflow '+JSON.stringify(metrics));assert.ok(metrics.logos.every(l=>l.alt&&l.fit==='contain'),label+' CI ratio/alt');
 const profile=p.locator('.profile-avatar.provider-profile');
 if(await profile.count()){assert.equal(await profile.isVisible(),true,label+' provider CI visible');const logo=await profile.boundingBox(),name=await p.locator('.profile-name').boundingBox();assert.ok(logo.x+logo.width<=name.x+1,label+' profile CI/name overlap');}
 if(await p.locator('dialog[open]').count()){const r=await p.locator('dialog[open]').boundingBox();assert.ok(r.x>=0&&r.x+r.width<=metrics.width+1,label+' dialog');}
}
try{
 const its=await client('apply',390);await its.page.locator('[name="itsCompany"]').fill('입력 유지 기업');
 assert.equal(await its.page.locator('.topbar-right').isVisible(),false);assert.equal(await its.page.locator('#sidebar [data-route="brochures"]').getAttribute('hidden'),null);
 const npu=await client('npu');assert.equal(await npu.page.locator('#sidebar [data-route="brochures"]').getAttribute('hidden'),'');
 await providerLogin(npu.page);assert.equal(await npu.page.locator('.profile-name').innerText(),'딥엑스');assert.equal(await npu.page.locator('.profile-avatar img').count(),1);
 const admin=await client('admin');await adminLogin(admin.page);assert.equal(await admin.page.locator('.profile-name').innerText(),'ITS Korea 관리자');
 await its.page.evaluate(()=>window.savedForm=document.querySelector('#application-form'));
 await admin.page.locator('#extend-schedule').click();await admin.page.locator('#confirm-extension').waitFor();
 assert.match(await admin.page.locator('#result-dialog').innerText(),/16:20 – 16:30/);assert.match(await admin.page.locator('#result-dialog').innerText(),/16:30 – 16:40/);
 await admin.page.locator('#confirm-extension').click();await admin.page.locator('#result-dialog').waitFor({state:'hidden'});
 await its.page.clock.fastForward(6000);await its.page.waitForFunction(()=>document.querySelectorAll('#time-options input').length===5);
 assert.equal(await its.page.locator('[name="itsCompany"]').inputValue(),'입력 유지 기업');assert.equal(await its.page.evaluate(()=>window.savedForm===document.querySelector('#application-form')),true);
 await npu.page.clock.fastForward(6000);await npu.page.waitForFunction(()=>document.querySelectorAll('.slot-capacity-form').length===5);
 await navigate(npu.page,'matching');assert.equal(await npu.page.locator('.matching-row').count(),5);assert.equal(await npu.page.locator('#sidebar [data-route="brochures"]').getAttribute('hidden'),'');
 assert.equal(await admin.page.locator('.progress-table tbody tr').count(),5);assert.equal(await admin.page.locator('[data-log-id]').count(),4);
 await admin.page.locator('#extend-schedule').click();await admin.page.locator('#confirm-extension').waitFor();
 assert.match(await admin.page.locator('#result-dialog').innerText(),/16:40 – 16:50/);
 await admin.page.locator('#confirm-extension').click();await admin.page.locator('#result-dialog').waitFor({state:'hidden'});assert.equal(admin.calls.filter(a=>a==='extendSchedule').length,2);
 await its.page.clock.fastForward(6000);await its.page.waitForFunction(()=>document.querySelectorAll('#time-options input').length===6);
 const before=h.counters.batchGets;const requests=its.calls.length;await its.page.clock.fastForward(6000);await its.page.waitForFunction(()=>true);
 // Allow intercepted response to settle without fake-time affecting GAS TTL.
 await its.page.evaluate(()=>new Promise(requestAnimationFrame));
 assert.ok(its.calls.slice(requests).every(a=>a==='getAvailabilityRevision'));assert.equal(h.counters.batchGets,before);
 report.extension={twoSlots:true,allRolesUpdated:true,formPreserved:true,unChangedPublicProbeSheets:0};
 // Every requested width: all role contexts, tables, dialogs and static pages.
 for(const width of report.widths){
   await admin.page.setViewportSize({width,height:1000});await fits(admin.page,'admin '+width);
   await admin.page.locator('[data-slot-detail]').first().click();await fits(admin.page,'slot popup '+width);await admin.page.locator('[data-close-dialog]').first().click();
   await admin.page.locator('#extend-schedule').click();await fits(admin.page,'extension '+width);await admin.page.locator('[data-close-dialog]').first().click();
   await npu.page.setViewportSize({width,height:1000});await fits(npu.page,'matching '+width);
   await navigate(npu.page,'npu');await fits(npu.page,'provider '+width);await navigate(npu.page,'matching');
   await its.page.setViewportSize({width,height:1000});
   for(const hash of ['apply','lookup','find-id','brochures','home']){await navigate(its.page,hash);await fits(its.page,hash+' '+width);if(hash!=='home')assert.equal(await its.page.locator('.topbar-right').isVisible(),false);}
   if([390,1440].includes(width)){
     await fs.mkdir('artifacts',{recursive:true});await its.page.screenshot({path:'artifacts/v3-home-'+width+'.png',fullPage:true});
     await admin.page.screenshot({path:'artifacts/v3-admin-'+width+'.png',fullPage:true});
     await npu.page.screenshot({path:'artifacts/v3-matching-'+width+'.png',fullPage:true});
   }
 }
 const failed=await client('home',390,{failLogo:true});await failed.page.locator('.brochure-card').first().scrollIntoViewIfNeeded();
 await failed.page.waitForFunction(()=>document.querySelector('.brochure-card .logo-fallback')?.hidden===false);
 assert.equal(await failed.page.locator('.brochure-card').first().locator('img').isVisible(),false);assert.match(await failed.page.locator('.brochure-card').first().innerText(),/DEEPX/);
 const local=await client('admin',390,{mock:true});
 await local.page.locator('[name="id"]').fill('ITSKOREA9911');await local.page.locator('[name="password"]').fill('ITSKOREA9911!');await local.page.locator('#admin-login-form button[type="submit"]').click();await local.page.locator('#extend-schedule').waitFor();
 await local.page.locator('#extend-schedule').click();await local.page.locator('#confirm-extension').click();await local.page.locator('#result-dialog').waitFor({state:'hidden'});
 await navigate(local.page,'apply');assert.equal(await local.page.locator('#time-options input').count(),5);
 assert.equal(local.calls.length,0);
 for(const c of [its,npu,admin,failed]){assert.equal(c.pdf.length,0);assert.equal(await c.page.evaluate(()=>Object.keys(localStorage).length),0);}
 assert.deepEqual(errors,[]);report.ciFallback=true;report.mockExtension=true;report.zeroInitialPDF=true;
 await fs.writeFile('artifacts/v3-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 console.log('PASS: V3 role UI, authenticated extension, automatic schedule updates, mock, official CI/fallback, all nine widths and dialogs.');
}finally{await browser.close();}
