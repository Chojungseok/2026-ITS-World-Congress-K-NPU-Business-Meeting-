// Real UI + GAS source doubles; no production requests or real PDF assets are created.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createHarness} from './gas-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const h=createHarness(),base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/',url='https://script.google.com/macros/s/test/exec';
const errors=[],report={},contexts=[];
const good=(action,input={})=>h.value(h.call(action,input));
async function client(hash,width=1440,{released=false,pending=false,mock=false}={}){
 const ctx=await browser.newContext({viewport:{width,height:900}});contexts.push(ctx);
 const calls=[],pdfRequests=[];
 ctx.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
 ctx.on('request',r=>{if(/\.pdf(?:$|\?)/.test(r.url()))pdfRequests.push(r.url());});
 if(!mock){
  await ctx.route('**/assets/js/runtime-config.js',route=>route.fulfill({contentType:'text/javascript',body:
   'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
  await ctx.route(url+'**',async route=>{
   const r=route.request(),input=r.method()==='GET'?Object.fromEntries(new URL(r.url()).searchParams):JSON.parse(r.postData());
   calls.push({method:r.method(),url:r.url(),input});
   const response=await h.fetch(r.url(),{method:r.method(),body:r.postData()});
   await route.fulfill({contentType:'application/json',body:await response.text()});
  });
 }
 if(released || pending){
  const source=await fs.readFile('assets/js/brochures.js','utf8');
  await ctx.route('**/assets/js/brochures.js',route=>route.fulfill({contentType:'text/javascript',body:pending ? source.replaceAll('available: true','available: false') : source.replaceAll('available: false','available: true')}));
  // Only verify navigation; this explicit 404 fixture is not a fabricated brochure.
  await ctx.route('**/assets/brochures/*.pdf',route=>route.fulfill({status:404,contentType:'text/plain',body:'PDF navigation test fixture'}));
 }
 const page=await ctx.newPage();await page.clock.install();await page.goto(base+'#'+hash);
 await ready(page);return {page,ctx,calls,pdfRequests};
}
const ready=page=>page.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
const route=async(page,hash)=>{await page.evaluate(hash=>{location.hash=hash;},hash);await page.waitForFunction(hash=>location.hash==='#'+hash,hash);await ready(page);};
async function fillFinder(page,input){
 for(const name of ['itsCompany','contactName','phone','email'])await page.locator('#find-ids-form [name="'+name+'"]').fill(input[name]);
 await page.locator('#find-ids-form button[type="submit"]').click();
}
try{
 const first=good('submitRequest',h.form({itsCompany:'ID 찾기 기업',contactName:'찾기 담당',phone:'010-1234-5678',email:'finder@example.com'}));
 h.advance(1000);
 const second=good('submitRequest',h.form({itsCompany:first.itsCompany,contactName:first.contactName,phone:first.phone,email:first.email,providerId:'mobilint'}));
 const mobile=await client('lookup',390);
 assert.equal(await mobile.page.locator('.lookup-tabs a').count(),2);
 await mobile.page.locator('.lookup-tabs a[href="#find-id"]').click();await mobile.page.locator('#find-ids-form').waitFor();
 await fillFinder(mobile.page,{...first,itsCompany:' '+first.itsCompany+' ',contactName:' '+first.contactName+' ',phone:'010 (1234) 5678',email:' FINDER@EXAMPLE.COM '});
 await mobile.page.locator('[data-found-id="'+first.id+'"]').waitFor();
 assert.deepEqual(await mobile.page.locator('[data-found-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.foundId)),[second.id,first.id]);
 const result=await mobile.page.locator('#find-ids-result').innerText();
 for(const privateValue of [first.contactName,first.email,first.phone,first.details])assert.ok(!result.includes(privateValue));
 await mobile.page.locator('[data-found-id="'+first.id+'"]').click();
 await mobile.page.locator('#lookup-result .detail-id').waitFor();
 assert.equal(await mobile.page.locator('#lookup-form [name="id"]').inputValue(),first.id);
 assert.equal(await mobile.page.locator('#lookup-form [name="email"]').inputValue(),first.email);
 report.idFinder={results:2,autoLookup:true,minimal:true};
 const npu=await client('npu');
 await npu.page.locator('[name="providerId"]').selectOption('deepx');await npu.page.locator('[name="approvalCode"]').fill(h.credentials.deepx);
 await npu.page.locator('#provider-login-form button[type="submit"]').click();await npu.page.locator('.status-tabs').waitFor();await ready(npu.page);
 assert.deepEqual(await npu.page.locator('.slot-capacity-form [name="time"]').evaluateAll(nodes=>nodes.map(node=>node.value)),h.times);
 await npu.page.locator('[data-decision="매칭거절"][data-id="'+first.id+'"]').click();
 await npu.page.locator('#reject-request-form').waitFor();
 const before=npu.calls.filter(c=>c.input.action==='decideRequest').length;
 await npu.page.locator('[name="rejectionReason"]').fill('   ');await npu.page.locator('#confirm-action').click();
 await npu.page.locator('#dialog-error').waitFor();
 assert.equal(npu.calls.filter(c=>c.input.action==='decideRequest').length,before);
 assert.equal(good('findRequest',{id:first.id,email:first.email}).status,'승인대기');
 await npu.page.locator('[name="rejectionReason"]').fill('  당사 지원 범위와 맞지 않아 진행이 어렵습니다.  ');
 // A revision-triggered partial update must not overwrite a textarea draft.
 good('submitRequest',h.form({email:'while-rejecting@example.com'}));
 await npu.page.clock.fastForward(5100);
 await npu.page.waitForFunction(()=>document.querySelectorAll('#provider-requests .request-card').length===2);
 assert.equal(await npu.page.locator('[name="rejectionReason"]').inputValue(),'  당사 지원 범위와 맞지 않아 진행이 어렵습니다.  ');
 await npu.page.locator('#confirm-action').click();await npu.page.locator('#result-dialog').waitFor({state:'hidden'});
 await mobile.page.locator('#lookup-form button[type="submit"]').click();
 await mobile.page.locator('.rejection-reason').waitFor();
 assert.match(await mobile.page.locator('.rejection-reason').innerText(),/당사 지원 범위/);
 const rejected=good('findRequest',{id:first.id,email:first.email});assert.equal(rejected.rejectionReason,'당사 지원 범위와 맞지 않아 진행이 어렵습니다.');
 report.rejection={required:true,draftPreserved:true,applicantSeesReason:true};
 const admin=await client('admin');
 await admin.page.locator('[name="id"]').fill(h.admin.id);await admin.page.locator('[name="password"]').fill(h.admin.password);
 await admin.page.locator('#admin-login-form button[type="submit"]').click();await admin.page.locator('#history-results').waitFor();
 await admin.page.locator('#history-results [data-detail="'+first.id+'"]').first().click();
 assert.match(await admin.page.locator('.rejection-reason').innerText(),/당사 지원 범위/);
 await admin.page.locator('[data-close-dialog]').click();
 assert.deepEqual(await admin.page.locator('.progress-table tbody th').allTextContents(),h.times);
 const publicUi=await client('home',1440,{released:true});
 assert.equal(publicUi.calls.length,0);assert.equal(publicUi.pdfRequests.length,0);
 assert.equal(await publicUi.page.locator('.brochure-card a').count(),4);
 await publicUi.page.clock.fastForward(6000);assert.equal(publicUi.pdfRequests.length,0);
 await route(publicUi.page,'apply');assert.equal(publicUi.pdfRequests.length,0);
 assert.deepEqual(await publicUi.page.locator('[name="time"]').evaluateAll(nodes=>nodes.map(node=>node.value)),h.times);
 await route(publicUi.page,'brochures');assert.equal(publicUi.pdfRequests.length,0);
 const link=publicUi.page.locator('.brochure-card a').first();
 assert.equal(await link.getAttribute('href'),'./assets/brochures/deepx-company-profile-2026.pdf');
 assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
 const popupPromise=publicUi.page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForLoadState();
 assert.equal(publicUi.pdfRequests.length,1);assert.ok(publicUi.pdfRequests[0].endsWith('/assets/brochures/deepx-company-profile-2026.pdf'));
 report.pdf={initialRequests:0,clickedRequests:1,backendCallsForBrochures:0,newTab:true};
 const missing=await client('home',390,{pending:true});
 assert.equal(await missing.page.locator('.brochure-card button[disabled]').count(),4);assert.equal(missing.pdfRequests.length,0);
 for(const c of [mobile,npu,admin,publicUi,missing]){
  assert.equal(await c.page.evaluate(()=>Object.keys(localStorage).length),0);
  assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  for(const call of c.calls)if(call.input.action==='findRequestIds')assert.equal(call.method,'POST');
 }
 await route(mobile.page,'find-id');
 await fillFinder(mobile.page,{...first,contactName:'불일치'});
 await mobile.page.locator('#find-ids-error').waitFor();
 assert.equal(await mobile.page.locator('[data-found-id]').count(),0);
 const mock=await client('find-id',390,{mock:true});
 await fillFinder(mock.page,{itsCompany:'한빛모빌리티 (예시)',contactName:'김담당',phone:'01000000000',email:'demo1@example.com'});
 await mock.page.locator('[data-found-id="DEMO-0001"]').waitFor();
 await mock.page.locator('[data-found-id="DEMO-0001"]').click();await mock.page.locator('#lookup-result .detail-id').waitFor();
 assert.equal(await mock.page.locator('#lookup-result .detail-id').innerText(),'DEMO-0001');
 assert.deepEqual(errors,[]);
 await fs.mkdir('artifacts',{recursive:true});
 await missing.page.screenshot({path:'artifacts/business-v2-home-mobile.png',fullPage:true});
 await npu.page.screenshot({path:'artifacts/business-v2-npu-desktop.png',fullPage:true});
 await admin.page.screenshot({path:'artifacts/business-v2-admin-desktop.png',fullPage:true});
 await fs.writeFile('artifacts/business-v2-browser-results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));console.log('PASS: new times, mobile ID finder → auto lookup, rejection dialog → applicant/admin, preserved draft/revisions, mock and zero initial PDF requests.');
}finally{await browser.close();}
