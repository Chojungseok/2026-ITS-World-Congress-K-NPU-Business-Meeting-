// Real UI and .gs sources with Google service doubles; no operational Google calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createHarness} from './gas-harness.mjs';
import {API_VERSION,BUILD_VERSION} from '../assets/js/build-version.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/',url='https://script.google.com/macros/s/test/exec',h=createHarness(),errors=[],report={};
const good=(a,i={},m='POST')=>h.value(h.call(a,i,m)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const gate=()=>{let release;return {wait:new Promise(r=>release=r),release:()=>release()};};
async function client(hash,{mock=false,width=1440,height=900}={}){
 const ctx=await browser.newContext({viewport:{width,height}}),calls=[],assets=[],control={hold:null,lost:null};
 ctx.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));ctx.on('request',r=>assets.push(r.url()));
 if(!mock){
 await ctx.route('**/assets/js/runtime-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,boardMs:10000,availabilityMs:5000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
 await ctx.route(url+'**',async r=>{
  const q=r.request(),input=q.method()==='GET'?Object.fromEntries(new URL(q.url()).searchParams):JSON.parse(q.postData());calls.push(input.action);assert.equal(input.apiVersion,API_VERSION);
  if(input.action.startsWith('getPublicBoard')){assert.equal(q.method(),'GET');assert.deepEqual(Object.keys(input).sort(),['action','apiVersion']);}
  const response=await h.fetch(q.url(),{method:q.method(),body:q.postData()}),body=await response.text();
  if(control.hold?.action===input.action){const held=control.hold;control.hold=null;held.seen.release();await held.reply.wait;}
  if(control.lost===input.action){control.lost=null;return r.abort('failed');}
  await r.fulfill({contentType:'application/json',body});
 });}
 const p=await ctx.newPage();await p.clock.install();await p.goto(base+'#'+hash);await ready(p);return {ctx,p,calls,assets,control};
}
const ready=p=>p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
async function login(c,role,mock=false){
 if(role==='admin'){await c.p.locator('[name="id"]').fill(mock?'ITSKOREA9911':h.admin.id);await c.p.locator('[name="password"]').fill(mock?'ITSKOREA9911!':h.admin.password);await c.p.locator('#admin-login-form button[type="submit"]').click();await c.p.locator('#shrink-schedule').waitFor();}
 else{await c.p.locator('[name="providerId"]').selectOption('deepx');await c.p.locator('[name="approvalCode"]').fill(h.credentials.deepx);await c.p.locator('#provider-login-form button[type="submit"]').click();await c.p.locator('.capacity-settings').waitFor();}
 await ready(c.p);c.calls.length=0;
}
async function tick(c,ms,action){
 const done=c.p.waitForResponse(r=>r.url().startsWith(url)&&(r.request().method()==='GET'?new URL(r.url()).searchParams.get('action'):JSON.parse(r.request().postData()).action)===action);
 await c.p.clock.fastForward(ms);await done;await sleep(80);
}
const cell=(c,time,provider='deepx')=>c.p.locator('[data-board-time="'+time+'"] [data-board-cell="'+provider+'"]');
async function extension(c){await c.p.locator('#extend-schedule').click();await c.p.locator('#confirm-extension').click();await c.p.locator('#result-dialog').waitFor({state:'hidden'});}
async function visibility(c,state){await c.p.evaluate(state=>{window.testVisible=state;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisible});document.dispatchEvent(new Event('visibilitychange'));},state);await sleep(100);}
try{
 const screen=await client('board',{width:1920,height:1080});await screen.p.locator('.board-table').waitFor();assert.deepEqual(screen.calls,['getPublicBoard']);
 assert.equal(await screen.p.locator('#sidebar').isVisible(),false);assert.equal(await screen.p.locator('.topbar').isVisible(),false);assert.equal(await screen.p.locator('form').count(),0);
 assert.deepEqual(await screen.p.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height>0).map(n=>n.id)),['refresh-board']);assert.equal(screen.assets.some(u=>/\.pdf(?:$|\?)/.test(u)),false);
 report.initial={http:1,sheets:1,noAuthentication:true};screen.calls.length=0;let reads=h.counters.batchGets;
 await screen.p.evaluate(()=>window.initialBoard=document.querySelector('.board-table'));
 for(let i=0;i<3;i++)await tick(screen,10100,'getPublicBoardRevision');assert.deepEqual(screen.calls,['getPublicBoardRevision','getPublicBoardRevision','getPublicBoardRevision']);assert.equal(h.counters.batchGets,reads);assert.equal(await screen.p.evaluate(()=>window.initialBoard===document.querySelector('.board-table')),true);report.unchanged={probes:3,sheetReads:0,tablePreserved:true};
 const admin=await client('admin');await login(admin,'admin');assert.equal(await admin.p.locator('#shrink-schedule').isDisabled(),true);
 const fresh=admin.ctx.waitForEvent('page');await admin.p.locator('#open-public-board').click();const popup=await fresh;await popup.locator('.board-table').waitFor();assert.equal(new URL(popup.url()).hash,'#board');assert.equal(new URL(popup.url()).search,'');assert.equal(await popup.evaluate(()=>window.opener),null);assert.equal(await popup.evaluate(()=>Object.keys(sessionStorage).length),0);assert.equal(await popup.locator('form').count(),0);await popup.close();report.newWindow={noopener:true,tokenTransfer:false};
 const its=await client('apply'),npu=await client('npu'),matching=await client('matching');await login(npu,'provider');await login(matching,'provider');
 await npu.p.locator('.slot-capacity-form [name="capacity"]').first().fill('1'); // Valid draft survives ended-slot removal.
 await extension(admin);assert.equal(await admin.p.locator('#shrink-schedule').isDisabled(),false);const time='16:30 – 16:40';
 screen.calls.length=0;await tick(screen,10100,'getPublicBoardRevision');assert.equal(await screen.p.locator('[data-board-time]').count(),5);assert.deepEqual(screen.calls,['getPublicBoardRevision','getPublicBoard']);
 await tick(its,5100,'getAvailabilityRevision');assert.equal(await its.p.locator('[name="time"]').count(),5);
 await tick(npu,5100,'getProviderRevision');await tick(matching,5100,'getProviderRevision');assert.equal(await matching.p.locator('.matching-table tbody tr').count(),5);
 const privateInput=h.form({time,itsCompany:'PRIVATE ITS',contactName:'PRIVATE CONTACT',email:'private-board@example.com',details:'PRIVATE DETAILS'}),row=good('submitRequest',privateInput);
 reads=h.counters.batchGets;screen.calls.length=0;await tick(screen,10100,'getPublicBoardRevision');assert.deepEqual(screen.calls,['getPublicBoardRevision']);assert.equal(h.counters.batchGets,reads);assert.equal(await cell(screen,time).locator('.board-count strong').innerText(),'0');
 await tick(npu,5100,'getProviderRevision');await npu.p.locator('[data-decision="매칭확정"][data-id="'+row.id+'"]').click();await npu.p.locator('#confirm-action').click();await npu.p.locator('#result-dialog').waitFor({state:'hidden'});
 screen.calls.length=0;await tick(screen,10100,'getPublicBoardRevision');assert.equal(await cell(screen,time).locator('.board-count strong').innerText(),'1');assert.deepEqual(screen.calls,['getPublicBoardRevision','getPublicBoard']);
 const text=await screen.p.locator('#main').innerText();for(const value of [row.id,privateInput.itsCompany,privateInput.contactName,privateInput.email,privateInput.details])assert.ok(!text.includes(value));
 good('cancelRequest',{id:row.id,email:row.email});await tick(screen,10100,'getPublicBoardRevision');assert.equal(await cell(screen,time).locator('.board-count strong').innerText(),'0');
 good('updateProviderCapacity',{token:h.provider('deepx'),time,capacity:1});await tick(screen,10100,'getPublicBoardRevision');assert.match(await cell(screen,time).locator('.board-count').innerText(),/\/ 1/);report.aggregateUpdates={pendingNotCounted:true,approval:true,cancellation:true,capacity:true,noPII:true};
 // In-use last slot blocks even if the admin did not refresh its dashboard.
 const pending=good('submitRequest',h.form({providerId:'mobilint',time,email:'pending-shrink@example.com'}));
 await admin.p.locator('#shrink-schedule').click();assert.match(await admin.p.locator('.extension-summary').innerText(),/16:30 – 16:40/);await admin.p.locator('#confirm-shrink').click();await admin.p.locator('#dialog-error').waitFor();assert.match(await admin.p.locator('#dialog-error').innerText(),/진행 중인 상담 신청/);assert.equal(good('getConfig',{},'GET').times.length,5);await admin.p.locator('#result-dialog [aria-label="닫기"]').click();good('cancelRequest',{id:pending.id,email:pending.email});
 // Successful -10 minutes, held reply: processing disables confirmation, no polling/action retries.
 await admin.p.locator('#shrink-schedule').click();const hold={action:'shrinkSchedule',seen:gate(),reply:gate()};admin.control.hold=hold;admin.calls.length=0;await admin.p.locator('#confirm-shrink').click();await hold.seen.wait;assert.equal(await admin.p.locator('#confirm-shrink').isDisabled(),true);await admin.p.clock.fastForward(20000);assert.deepEqual(admin.calls,['shrinkSchedule']);hold.reply.release();await admin.p.locator('#result-dialog').waitFor({state:'hidden'});assert.equal(await admin.p.locator('#shrink-schedule').isDisabled(),true);
 screen.calls.length=0;await tick(screen,10100,'getPublicBoardRevision');assert.equal(await screen.p.locator('[data-board-time]').count(),4);await tick(its,5100,'getAvailabilityRevision');assert.equal(await its.p.locator('[name="time"]').count(),4);await tick(npu,5100,'getProviderRevision');await tick(matching,5100,'getProviderRevision');assert.equal(await matching.p.locator('.matching-table tbody tr').count(),4);assert.equal(await npu.p.locator('.slot-capacity-form[data-time="'+time+'"]').count(),0);assert.equal(await npu.p.locator('.slot-capacity-form [name="capacity"]').first().inputValue(),'1');report.shrink={inUseBlocked:true,confirmation:true,buttonDisabledDuringWrite:true,allRolesUpdated:true,validDraftPreserved:true};
 // No full polling while hidden; visible return immediately probes and reads a changed snapshot.
 screen.calls.length=0;await visibility(screen,'hidden');const pToken=h.provider('deepx');good('updateProviderCapacity',{token:pToken,time:h.time,capacity:1});await screen.p.clock.fastForward(40000);assert.deepEqual(screen.calls,[]);reads=h.counters.batchGets;await visibility(screen,'visible');await screen.p.waitForFunction(()=>document.querySelector('.board-table tbody tr:first-child .board-count')?.textContent.includes('/ 1'));assert.deepEqual(screen.calls,['getPublicBoardRevision','getPublicBoard']);assert.equal(h.counters.batchGets-reads,1);report.visibility={hiddenCalls:0,visibleImmediate:true};
 // Response lost after server commit: one shrink POST, latest schedule and four events.
 await extension(admin);await admin.p.locator('#shrink-schedule').click();admin.control.lost='shrinkSchedule';admin.calls.length=0;await admin.p.locator('#confirm-shrink').click();await admin.p.locator('#dialog-error').waitFor();assert.equal(admin.calls.filter(a=>a==='shrinkSchedule').length,1);assert.equal(await admin.p.locator('#shrink-schedule').isDisabled(),true);assert.equal(good('getConfig',{},'GET').times.length,4);await admin.p.locator('#result-dialog [aria-label="닫기"]').click();report.lostWrite={postCount:1,latestSchedule:true};
 // Display layouts with live mixed occupancy, full and zero-capacity cells.
 good('updateProviderCapacity',{token:pToken,time:h.times[1],capacity:0});
 for(let i=0;i<2;i++){const record=good('submitRequest',h.form({providerId:'mobilint',email:'screen-'+i+'@example.com'}));good('decideRequest',{token:h.provider('mobilint'),id:record.id,decision:'매칭확정'});}
 await tick(screen,10100,'getPublicBoardRevision');assert.equal(await cell(screen,h.time,'mobilint').locator('.board-cell-status').innerText(),'마감');
 await fs.mkdir('artifacts',{recursive:true});report.screens=[];
 for(const [width,height]of [[1366,768],[1440,900],[1920,1080],[2560,1440],[320,800],[390,844]]){
  await screen.p.setViewportSize({width,height});await screen.p.evaluate(()=>new Promise(requestAnimationFrame));const m=await screen.p.evaluate(()=>({width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,footerBottom:document.querySelector('.board-footer').getBoundingClientRect().bottom,logos:[...document.querySelectorAll('#main img')].map(i=>({alt:i.alt,fit:getComputedStyle(i).objectFit,loaded:i.complete&&i.naturalWidth>0}))}));assert.ok(m.bodyWidth<=width+1);if(width>=1000)assert.ok(m.footerBottom<=height+1,'screen content fits '+width+'x'+height);assert.ok(m.logos.every(i=>i.alt&&i.fit==='contain'&&i.loaded));report.screens.push({width,height,fit:true});await screen.p.screenshot({path:'artifacts/public-board-'+width+'x'+height+'.png',fullPage:true});
 }
 // Six-time-slot screen also fits the primary venue display.
 await screen.p.setViewportSize({width:1920,height:1080});await extension(admin);await extension(admin);await tick(screen,10100,'getPublicBoardRevision');assert.equal(await screen.p.locator('[data-board-time]').count(),6);assert.ok(await screen.p.locator('.board-footer').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
 // Two authenticated tabs confirm the same last time before either response arrives.
 const second=await client('admin');await login(second,'admin');
 await admin.p.locator('#shrink-schedule').click();await second.p.locator('#shrink-schedule').click();
 const race={action:'shrinkSchedule',seen:gate(),reply:gate()};admin.control.hold=race;
 const previousAudit=h.sheet('history').data.filter(r=>r[2]==='시간 연장 취소').length;
 await admin.p.locator('#confirm-shrink').click();await race.seen.wait;
 await second.p.locator('#confirm-shrink').click();await second.p.locator('#dialog-error').waitFor();assert.match(await second.p.locator('#dialog-error').innerText(),/이미 변경/);assert.equal(good('getConfig',{},'GET').times.length,5);assert.equal(h.sheet('history').data.filter(r=>r[2]==='시간 연장 취소').length-previousAudit,4);
 race.reply.release();await admin.p.locator('#result-dialog').waitFor({state:'hidden'});await second.ctx.close();report.twoAdminTabs={successes:1,removedSlots:1,staleRejected:true};
 const mock=await client('admin',{mock:true});await login(mock,'admin',true);await extension(mock);await mock.p.locator('#shrink-schedule').click();await mock.p.locator('#confirm-shrink').click();await mock.p.locator('#result-dialog').waitFor({state:'hidden'});assert.equal(await mock.p.locator('#shrink-schedule').isDisabled(),true);await mock.p.goto(base+'#board');await mock.p.locator('.board-table').waitFor();assert.equal(await mock.p.locator('[data-board-time]').count(),4);report.mock=true;
 for(const c of [screen,admin,its,npu,matching])assert.equal(await c.p.evaluate(()=>Object.keys(localStorage).length),0);
 assert.deepEqual(errors,[]);await fs.writeFile('artifacts/schedule-board-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));console.log('PASS: protected -10 minutes, public board privacy/counts/revision/window isolation, all-role updates, drafts, visibility and six screen sizes.');
}finally{await browser.close();}
