import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import {createHarness} from './gas-harness.mjs';
import {API_VERSION,BUILD_VERSION} from '../assets/js/build-version.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const h=createHarness(),base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/',url='https://script.google.com/macros/s/test/exec',errors=[],report={};
// Browser routing intercepts only the first request in a redirect chain. A real
// local echo server supplies controlled cross-origin JSON, without a Google call.
let echoBody='',echoHits=0;const echoServer=http.createServer((req,res)=>{echoHits++;res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(echoBody);});
await new Promise(resolve=>echoServer.listen(0,'127.0.0.1',resolve));
const echo='http://127.0.0.1:'+echoServer.address().port+'/echo';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const gate=()=>{let release;return {wait:new Promise(r=>release=r),release:()=>release()};};
async function client(hash,{clock=false}={}){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[],assets=[],control={fault:null,hold:null};
 await ctx.route('**/assets/js/runtime-config.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',performanceDiagnostics:true,refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,availabilityMs:5000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
 await ctx.route(url+'**',async route=>{
  const r=route.request(),payload=r.method()==='GET'?Object.fromEntries(new URL(r.url()).searchParams):JSON.parse(r.postData()),action=payload.action;
  assert.equal(payload.apiVersion,API_VERSION);if(!['getConfig','getAvailability','getAvailabilityRevision'].includes(action))assert.equal(r.method(),'POST');
  calls.push(action);
  const fault=control.fault?.action===action?control.fault:null;if(fault)control.fault=null;
  if(fault?.kind==='503')return route.fulfill({status:503,body:'temporary'});
  if(fault?.kind==='invalid')return route.fulfill({status:200,body:'<html>not JSON</html>'});
  const response=await h.fetch(r.url(),{method:r.method(),body:r.postData()}),body=await response.text();
  if(control.hold?.action===action){const hold=control.hold;control.hold=null;hold.seen.release();await hold.reply.wait;}
  if(fault?.kind==='lost')return route.abort('failed');
  if(fault?.kind==='redirect'){echoBody=body;return route.fulfill({status:303,headers:{location:echo,'Access-Control-Allow-Origin':'*'},body:''});}
  await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>assets.push(r.url()));if(clock)await p.clock.install();
 // Navigation begins after callers can install fault controls for initial reads.
 return {ctx,p,calls,assets,control,open:()=>p.goto(base+'#'+hash)};
}
const ready=p=>p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
async function fillApplication(p,email='recovery@example.com'){
 await p.locator('[name="itsCompany"]').fill('테스트 ITS');await p.locator('[name="contactName"]').fill('담당자');await p.locator('[name="phone"]').fill('010-0000-0000');await p.locator('[name="email"]').fill(email);await p.locator('[name="details"]').fill('NPU 기술 상담');await p.locator('[name="time"]').first().check();await p.locator('[name="consent"]').check();await p.locator('[name="privacyConsent"]').check();
}
async function login(c,role){
 if(role==='provider'){await c.p.locator('[name="providerId"]').selectOption('deepx');await c.p.locator('[name="approvalCode"]').fill(h.credentials.deepx);}
 else{await c.p.locator('[name="id"]').fill(h.admin.id);await c.p.locator('[name="password"]').fill(h.admin.password);}
 await c.p.locator(role==='provider'?'#provider-login-form button[type="submit"]':'#admin-login-form button[type="submit"]').click();
}
try{
 const home=await client('home');await home.open();await home.p.locator('#welcome-title').waitFor();await ready(home.p);
 assert.deepEqual(home.calls,[]);assert.equal(home.assets.some(u=>/\/(gas-api|mock-api)\.js/.test(u)),false);
 for(const u of home.assets.filter(u=>/\/assets\/js\/.*\.js/.test(u)))assert.equal(new URL(u).searchParams.get('v'),BUILD_VERSION);
 assert.equal(home.assets.some(u=>/\.pdf(?:$|\?)/.test(u)),false);report.home={gas:0,backendAdapters:0,pdfs:0};await home.ctx.close();
 // ContentService-style cross-origin redirect preserves POST action and reads final JSON.
 const redirected=await client('admin');await redirected.open();await ready(redirected.p);redirected.control.fault={action:'authenticateAdmin',kind:'redirect'};await login(redirected,'admin');await redirected.p.locator('#history-filters').waitFor();await ready(redirected.p);assert.deepEqual(redirected.calls,['authenticateAdmin']);assert.equal(echoHits,1);report.contentServiceRedirect='POST followed by redirected JSON, one GAS action';await redirected.ctx.close();
 // Safe transient read retry requires no page reload.
 const read=await client('apply');read.control.fault={action:'getAvailability',kind:'503'};await read.open();await ready(read.p);assert.deepEqual(read.calls,['getAvailability','getAvailability']);assert.equal(await read.p.locator('#application-form button[type="submit"]').isDisabled(),false);report.read503='recovered once';await read.ctx.close();
 const invalid=await client('apply');invalid.control.fault={action:'getAvailability',kind:'invalid'};await invalid.open();await ready(invalid.p);
 await invalid.p.locator('[name="itsCompany"]').fill('입력 보존 확인');assert.deepEqual(invalid.calls,['getAvailability']);await invalid.p.locator('#retry-application').click();await invalid.p.waitForFunction(()=>document.querySelector('#application-form')?.dataset.ready==='true');assert.equal(await invalid.p.locator('[name="itsCompany"]').inputValue(),'입력 보존 확인');report.invalidRead='manual retry preserves form';await invalid.ctx.close();
 // Long auth excludes automatic probes; successful combined login is one HTTP call.
 const npu=await client('npu',{clock:true});await npu.open();await ready(npu.p);npu.calls.length=0;
 const auth={action:'authenticateProvider',seen:gate(),reply:gate()};npu.control.hold=auth;await login(npu,'provider');await auth.seen.wait;
 assert.match(await npu.p.locator('#provider-login-form button[type="submit"]').innerText(),/로그인 중/);await npu.p.clock.fastForward(20000);assert.deepEqual(npu.calls,['authenticateProvider']);auth.reply.release();await npu.p.locator('.status-tabs').waitFor();await ready(npu.p);assert.deepEqual(npu.calls,['authenticateProvider']);report.providerLogin={http:1,pollsDuringAuth:0};
 // Native browser offline state stops polling and reconnect probes once.
 npu.calls.length=0;await npu.ctx.setOffline(true);await npu.p.waitForFunction(()=>navigator.onLine===false);await npu.p.clock.fastForward(20000);assert.deepEqual(npu.calls,[]);
 const reconnect=npu.p.waitForResponse(r=>r.request().postData()?.includes('getProviderRevision'));await npu.ctx.setOffline(false);await npu.p.waitForFunction(()=>navigator.onLine===true);await reconnect;await sleep(50);assert.deepEqual(npu.calls,['getProviderRevision']);report.offlineOnline='paused then one probe';
 // Lost approval response is never re-executed; latest authoritative list reconciles it.
 const row=h.value(h.call('submitRequest',h.form({email:'approve-lost@example.com'})));await npu.p.locator('#refresh-provider').click();await npu.p.locator('[data-detail="'+row.id+'"]').waitFor();npu.calls.length=0;
 npu.control.fault={action:'decideRequest',kind:'lost'};await npu.p.locator('[data-id="'+row.id+'"][data-decision="매칭확정"]').click();await npu.p.locator('#confirm-action').click();await npu.p.locator('#dialog-error').waitFor();
 assert.equal(npu.calls.filter(a=>a==='decideRequest').length,1);assert.equal(h.value(h.call('findRequest',{id:row.id,email:row.email})).status,'매칭확정');assert.equal(await npu.p.locator('.request-card').filter({has:npu.p.locator('[data-detail="'+row.id+'"]')}).locator('.badge.confirmed').count(),1);report.lostApproval='one write, latest list confirmed';const applicant=await client('lookup');await applicant.open();await ready(applicant.p);await applicant.p.locator('[name="id"]').fill(row.id);await applicant.p.locator('[name="email"]').fill(row.email);await applicant.p.locator('#lookup-form button[type="submit"]').click();await applicant.p.locator('#cancel-request').waitFor();applicant.calls.length=0;applicant.control.fault={action:'cancelRequest',kind:'lost'};await applicant.p.locator('#cancel-request').click();await applicant.p.locator('#confirm-action').click();await applicant.p.locator('#lookup-result .badge.cancelled').waitFor();assert.equal(applicant.calls.filter(a=>a==='cancelRequest').length,1);report.lostCancellation='one write, verified view cancelled';await applicant.ctx.close();await npu.ctx.close();
 // Lost submit commits once, preserves all draft fields and offers verified ID finder.
 const lost=await client('apply',{clock:true});await lost.open();await ready(lost.p);await fillApplication(lost.p);lost.calls.length=0;
 const submit={action:'submitRequest',seen:gate(),reply:gate()};lost.control.hold=submit;lost.control.fault={action:'submitRequest',kind:'lost'};
 await lost.p.locator('#application-form button[type="submit"]').click();await submit.seen.wait;await lost.p.clock.fastForward(20000);assert.deepEqual(lost.calls,['submitRequest']);submit.reply.release();await lost.p.locator('#recover-application').waitFor();assert.equal(await lost.p.locator('[name="email"]').inputValue(),'recovery@example.com');assert.equal(lost.calls.filter(a=>a==='submitRequest').length,1);
 await lost.p.locator('#recover-application').click();await lost.p.locator('#find-ids-form').waitFor();
 for(const [name,value]of Object.entries({itsCompany:'테스트 ITS',contactName:'담당자',phone:'010-0000-0000',email:'recovery@example.com'}))await lost.p.locator('[name="'+name+'"]').fill(value);
 await lost.p.locator('#find-ids-form button[type="submit"]').click();await lost.p.locator('[data-found-id]').waitFor();assert.equal(await lost.p.locator('[data-found-id]').count(),1);report.lostSubmit='one write, draft retained, ID finder succeeds';await lost.ctx.close();
 // Old open tabs see version guidance before any auth lock or write in a new server.
 for(const role of ['provider','admin','submit']){
  const c=await client(role==='provider'?'npu':role==='admin'?'admin':'apply');await c.open();await ready(c.p);if(role==='submit')await fillApplication(c.p,'version@example.com');const before={...h.counters};h.context.KN.apiVersion='2026-10-v3.2';
  try{if(role==='submit')await c.p.locator('#application-form button[type="submit"]').click();else await login(c,role);await c.p.locator('#update-client').waitFor();assert.match(await c.p.locator('[role="alert"]').filter({hasText:'새 버전'}).first().innerText(),/새 버전/);assert.doesNotMatch(await c.p.locator('#main').innerText(),/POST 요청/);assert.equal(h.counters.locks,before.locks);assert.equal(h.counters.batches,before.batches);await sleep(80);assert.equal(await c.p.locator('#update-client').count(),1);}finally{h.context.KN.apiVersion=API_VERSION;await c.ctx.close();}
 }
 report.versionMismatch='provider/admin/submit rejected before execution without auto reload';assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts',{recursive:true});await fs.writeFile('artifacts/communication-browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));console.log('PASS: cache versions, one-call login, safe read retry, preserved drafts, no polling during writes/auth, lost-response recovery and offline/online.');
}finally{await browser.close();await new Promise(resolve=>echoServer.close(resolve));}
