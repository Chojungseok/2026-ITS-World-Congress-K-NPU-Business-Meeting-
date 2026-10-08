// Actual UI + actual .gs code with isolated Google service doubles. Never calls the live DB.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHarness} from './gas-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const h=createHarness(),base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/',url='https://script.google.com/macros/s/test/exec';
const good=(action,input={})=>h.value(h.call(action,input)),errors=[],report={};
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
async function client(hash,width=1440,{legacy=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:1000}}),calls=[],control={hold:null,fail:null};
 await ctx.route('**/assets/js/runtime-config.js',route=>route.fulfill({contentType:'text/javascript',body:
  'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
 await ctx.route(url+'**',async route=>{
   const request=route.request(),payload=request.method()==='GET'?Object.fromEntries(new URL(request.url()).searchParams):JSON.parse(request.postData());
   const action=payload.action;calls.push(action);
   let result=await (await h.fetch(request.url(),{method:request.method(),body:request.postData()})).json();
   if(control.fail===action){control.fail=null;result={ok:false,error:{code:'INTERNAL',message:'일시적인 테스트 연결 오류'}};}
   if(legacy&&result.data&&['getProviderRequests','getAdminOverview'].includes(action))delete result.data.revision;
   if(control.hold?.action===action){const hold=control.hold;control.hold=null;hold.seen.release();await hold.reply.promise;}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install();
 await page.goto(base+'#'+hash);return {page,ctx,calls,control};
}
const ready=c=>c.page.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
async function login(c,role){
 await ready(c);
 if(role==='provider'){
   await c.page.locator('[name="providerId"]').selectOption('deepx');
   await c.page.locator('[name="approvalCode"]').fill(h.credentials.deepx);
   await c.page.locator('#provider-login-form button[type="submit"]').click();
   await c.page.locator('.status-tabs').waitFor();
 } else {
   await c.page.locator('[name="id"]').fill(h.admin.id);
   await c.page.locator('[name="password"]').fill(h.admin.password);
   await c.page.locator('#admin-login-form button[type="submit"]').click();
   await c.page.locator('#history-filters').waitFor();
 }
 await ready(c);c.calls.length=0;
}
async function tick(c,ms,action){
 const response=c.page.waitForResponse(r=>r.url().startsWith(url)&&
  (r.request().method()==='GET'?new URL(r.url()).searchParams.get('action'):JSON.parse(r.request().postData()).action)===action);
 await c.page.clock.fastForward(ms);await response;await sleep(80);
}
function calls(c,name,expected){
 assert.deepEqual(c.calls,expected,name);report[name]=[...c.calls];c.calls.length=0;
}
async function visibility(c,state){
 await c.page.evaluate(state=>{
   window.testVisibility=state;
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.testVisibility});
   document.dispatchEvent(new Event('visibilitychange'));
 },state);
 await sleep(100);
}
const slot=c=>c.page.locator('[data-slot-detail][data-provider="deepx"]').first();
try{
 const npu=await client('npu'),admin=await client('admin');
 await login(npu,'provider');await login(admin,'admin');
 let reads=h.counters.batchGets;
 await tick(npu,5100,'getProviderRevision');calls(npu,'unchanged-provider',['getProviderRevision']);
 await tick(admin,10100,'getAdminRevision');calls(admin,'unchanged-admin',['getAdminRevision']);
 assert.equal(h.counters.batchGets,reads);
 const draft=npu.page.locator('.slot-capacity-form [name="capacity"]').nth(1);await draft.fill('1');
 await admin.page.locator('#history-filters [name="query"]').fill('실시간 모바일');
 await admin.page.locator('#history-filters [name="provider"]').selectOption('deepx');
 await admin.page.locator('#history-filters [name="time"]').selectOption(h.time);
 await admin.page.locator('#history-filters [name="order"]').selectOption('asc');
 const filters=await admin.page.locator('#history-filters').evaluate(form=>Object.fromEntries(new FormData(form)));
 await admin.page.evaluate(()=>{window.savedFilterNode=document.querySelector('#history-filters');window.scrollTo(0,700);});
 const scroll=await admin.page.evaluate(()=>scrollY);
 const mobile=await client('apply',390);await ready(mobile);
 for(const[name,value]of Object.entries({itsCompany:'실시간 모바일 기업',contactName:'담당자',phone:'010-0000-0000',email:'mobile-revision@example.com',details:'준실시간 반영 테스트'}))
   await mobile.page.locator('[name="'+name+'"]').fill(value);
 await mobile.page.locator('[name="time"]').first().check();
 await mobile.page.locator('[name="consent"]').check();await mobile.page.locator('[name="privacyConsent"]').check();
 await mobile.page.locator('#application-form button[type="submit"]').click();await mobile.page.locator('#new-request-id').waitFor();
 const id=await mobile.page.locator('#new-request-id').inputValue();
 await tick(npu,5100,'getProviderRevision');
 await npu.page.locator('[data-detail="'+id+'"]').waitFor();
 calls(npu,'new-application-provider',['getProviderRevision','getProviderRequests']);
 assert.equal(await draft.inputValue(),'1');
 assert.match(await npu.page.locator('#toast').innerText(),/새 상담 신청/);
 await tick(admin,10100,'getAdminRevision');
 await admin.page.locator('#history-results [data-detail="'+id+'"]').waitFor();
 calls(admin,'new-application-admin',['getAdminRevision','getAdminOverview']);
 assert.equal(await admin.page.evaluate(()=>window.savedFilterNode===document.querySelector('#history-filters')),true);
 assert.deepEqual(await admin.page.locator('#history-filters').evaluate(form=>Object.fromEntries(new FormData(form))),filters);
 assert.equal(await admin.page.evaluate(()=>scrollY),Math.min(scroll,await admin.page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)));
 assert.match(await admin.page.locator('.stat-card.pending strong').innerText(),/^1/);
 await slot(admin).click();await admin.page.locator('[data-popup-request="'+id+'"]').waitFor();
 await npu.page.locator('[data-decision="매칭확정"][data-id="'+id+'"]').click();await npu.page.locator('#confirm-action').click();
 await npu.page.locator('#result-dialog').waitFor({state:'hidden'});
 await tick(admin,10100,'getAdminRevision');
 assert.equal(await admin.page.locator('#result-dialog [data-popup-request="'+id+'"] .badge.confirmed').count(),1);
 assert.match(await admin.page.locator('.stat-card.confirmed strong').innerText(),/^1/);
 assert.match(await slot(admin).innerText(),/확정 1 \/ 정원 2/);
 assert.match(await admin.page.locator('#history-results').innerText(),/승인/);
 calls(admin,'approval-popup-sync',['getAdminRevision','getAdminOverview']);
 // Capacity changes also reach the open slot popup and the total remaining row.
 const form=npu.page.locator('.slot-capacity-form').first();await form.locator('[name="capacity"]').fill('1');await form.locator('button').click();
 await npu.page.waitForFunction(()=>document.querySelectorAll('.slot-capacity-form input[name="capacity"]')[0]?.defaultValue==='1');
 await tick(admin,10100,'getAdminRevision');
 assert.match(await slot(admin).innerText(),/잔여 0/);assert.match(await slot(admin).innerText(),/정원 1/);
 assert.match(await admin.page.locator('#result-dialog .slot-dialog-summary').innerText(),/정원\s+1건/);
 calls(admin,'capacity-popup-sync',['getAdminRevision','getAdminOverview']);
 assert.equal(await draft.inputValue(),'1');
 // Keep a request detail open while mobile cancels the confirmed application.
 await admin.page.locator('[data-popup-request="'+id+'"]').click();
 await mobile.page.locator('#go-lookup').click();await mobile.page.locator('#cancel-request').click();await mobile.page.locator('#confirm-action').click();
 await mobile.page.locator('#lookup-result .badge.cancelled').waitFor();
 await tick(admin,10100,'getAdminRevision');
 assert.equal(await admin.page.locator('#result-dialog .badge.cancelled').count(),1);
 assert.match(await slot(admin).innerText(),/잔여 1/);
 calls(admin,'cancel-request-popup-sync',['getAdminRevision','getAdminOverview']);
 // Direct log details (not only the slot popup) update too.
 await admin.page.locator('[data-close-dialog]').click();
 await admin.page.locator('#history-results [data-detail="'+id+'"]').first().click();
 good('updateProviderCapacity',{token:h.provider('deepx'),time:h.time,capacity:2});
 await tick(admin,10100,'getAdminRevision');
 assert.equal(await admin.page.locator('#result-dialog .detail-id').innerText(),id);
 calls(admin,'direct-detail-preserved',['getAdminRevision','getAdminOverview']);
 await admin.page.locator('[data-close-dialog]').click();
 // A direct log detail must show an externally rejected request without closing.
 const direct=good('submitRequest',h.form({itsCompany:'실시간 모바일 상세 기업',email:'direct-popup@example.com'}));
 await tick(admin,10100,'getAdminRevision');await admin.page.locator('#history-results [data-detail="'+direct.id+'"]').first().click();
 good('decideRequest',{token:h.provider('deepx'),id:direct.id,decision:'매칭거절',rejectionReason:'기존 회귀 검사용 사유'});
 await tick(admin,10100,'getAdminRevision');
 assert.equal(await admin.page.locator('#result-dialog .badge.rejected').count(),1);
 calls(admin,'direct-detail-status-sync',['getAdminRevision','getAdminOverview','getAdminRevision','getAdminOverview']);
 await admin.page.locator('[data-close-dialog]').click();
 // Hidden tabs send no requests; visible return probes immediately without advancing the clock.
 await visibility(admin,'hidden');admin.calls.length=0;
 good('submitRequest',h.form({itsCompany:'실시간 모바일 새 기업',email:'hidden@example.com'}));
 await admin.page.clock.fastForward(40000);await sleep(80);calls(admin,'hidden-admin',[]);
 await visibility(admin,'visible');
 await admin.page.waitForFunction(()=>document.querySelector('.stat-card.pending strong')?.textContent==='1건');
 calls(admin,'visible-admin',['getAdminRevision','getAdminOverview']);
 // A slow probe, repeated timer opportunities and manual refresh share one in-flight job.
 npu.calls.length=0;
 const slow={action:'getProviderRevision',seen:gate(),reply:gate()};npu.control.hold=slow;
 await npu.page.clock.fastForward(5100);await slow.seen.promise;
 await npu.page.clock.fastForward(20000);await npu.page.locator('#refresh-provider').click();
 assert.deepEqual(npu.calls,['getProviderRevision']);
 slow.reply.release();await sleep(150);
 assert.deepEqual(npu.calls,['getProviderRevision','getProviderRequests']);npu.calls.length=0;
 // A concurrent write after a full snapshot must be discovered on the next probe.
 const a=good('submitRequest',h.form({email:'race-a@example.com'}));
 const held={action:'getProviderRequests',seen:gate(),reply:gate()};npu.control.hold=held;
 await npu.page.clock.fastForward(5100);await held.seen.promise;
 const b=good('submitRequest',h.form({email:'race-b@example.com'}));
 held.reply.release();await npu.page.locator('[data-detail="'+a.id+'"]').waitFor();
 assert.equal(await npu.page.locator('[data-detail="'+b.id+'"]').count(),0);
 await tick(npu,5100,'getProviderRevision');await npu.page.locator('[data-detail="'+b.id+'"]').waitFor();
 calls(npu,'write-during-full-read',['getProviderRevision','getProviderRequests','getProviderRevision','getProviderRequests']);
 // Hidden provider tab also stops probing and refreshes on return.
 await visibility(npu,'hidden');await npu.page.clock.fastForward(20000);calls(npu,'hidden-provider',[]);
 await visibility(npu,'visible');calls(npu,'visible-unchanged-provider',['getProviderRevision']);
 // Returning visible during an older in-flight probe queues one immediate fresh probe.
 const returning={action:'getProviderRevision',seen:gate(),reply:gate()};npu.control.hold=returning;
 await npu.page.clock.fastForward(5100);await returning.seen.promise;
 await visibility(npu,'hidden');
 const returned=good('submitRequest',h.form({email:'visible-race@example.com'}));
 await visibility(npu,'visible');assert.deepEqual(npu.calls,['getProviderRevision']);
 returning.reply.release();await sleep(100);await npu.page.clock.runFor(20);
 await npu.page.locator('[data-detail="'+returned.id+'"]').waitFor();
 calls(npu,'visible-during-probe',['getProviderRevision','getProviderRevision','getProviderRequests']);
 // A failed full refresh does not acknowledge the detected revision.
 const failed=good('submitRequest',h.form({email:'retry@example.com'}));npu.control.fail='getProviderRequests';
 await tick(npu,5100,'getProviderRevision');assert.equal(await npu.page.locator('[data-detail="'+failed.id+'"]').count(),0);
 await tick(npu,30100,'getProviderRevision');await npu.page.locator('[data-detail="'+failed.id+'"]').waitFor();
 calls(npu,'failed-full-refresh-retry',['getProviderRevision','getProviderRequests','getProviderRevision','getProviderRequests']);
 // Matching route shares the provider revision, and includes newly confirmed cards.
 await npu.page.evaluate(()=>{location.hash='matching';});await npu.page.locator('#refresh-matching').waitFor();await ready(npu);npu.calls.length=0;
 good('decideRequest',{token:h.provider('deepx'),id:a.id,decision:'매칭확정'});
 await tick(npu,5100,'getProviderRevision');await npu.page.locator('[data-detail="'+a.id+'"]').waitFor();
 calls(npu,'matching-update',['getProviderRevision','getProviderRequests']);
 // Do not turn a normal in-progress commit into 5-second full reads. Reconcile
 // only if publication remains pending for 30 seconds, then resume after repair.
 const pendingState=JSON.parse(h.properties.get('KNPU_REVISIONS_V1'));pendingState.pending=true;
 h.properties.set('KNPU_REVISIONS_V1',JSON.stringify(pendingState));
 await tick(npu,5100,'getProviderRevision');calls(npu,'pending-write-lightweight',['getProviderRevision']);
 await tick(npu,30100,'getProviderRevision');
 calls(npu,'persistent-publish-recovery',['getProviderRevision','getProviderRequests']);
 h.context.refreshPublicConfig();
 await tick(npu,30100,'getProviderRevision');
 calls(npu,'recovered-publication',['getProviderRevision','getProviderRequests']);
 // A legacy deployment remains usable at the old 30-second full interval.
 const legacy=await client('npu',1440,{legacy:true});await login(legacy,'provider');
 await legacy.page.clock.fastForward(5100);await sleep(80);calls(legacy,'legacy-no-five-second-full',[]);
 await tick(legacy,30100,'getProviderRequests');calls(legacy,'legacy-thirty-second-full',['getProviderRequests']);
 for(const c of [mobile,npu,admin,legacy])assert.equal(await c.page.evaluate(()=>Object.keys(localStorage).length),0);
 assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/revision-browser-results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 console.log('PASS: automatic provider/admin updates, statistics, capacity, logs, filters, scroll, both popup paths, hidden/visible, single-flight, snapshot races, failures and legacy fallback.');
}finally{await browser.close();}
