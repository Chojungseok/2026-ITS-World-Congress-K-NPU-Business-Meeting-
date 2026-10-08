// Optional browser regression using the actual frontend and .gs service doubles.
// Start npm start first. Set PLAYWRIGHT_MODULE to an installed Playwright module if needed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createHarness} from './gas-harness.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {})});
const base=process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const h=createHarness(), errors=[], loaded=[];
const apiUrl='https://script.google.com/macros/s/test/exec';
async function context(viewport, gas=true) {
  const ctx=await browser.newContext({viewport});
  ctx.on('page',p=>{p.on('pageerror',error=>errors.push(error.message));p.on('request',r=>loaded.push(r.url()));});
  if(gas) {
    await ctx.route('**/assets/js/runtime-config.js',route=>route.fulfill({contentType:'text/javascript',body:
      "export const RUNTIME_CONFIG={backend:'gas',gasUrl:"+JSON.stringify(apiUrl)+",refreshIntervalMs:5000};export function resolveBackend(){return 'gas';}"}));
    await ctx.route(apiUrl+'**',async route=>{
      const req=route.request(), response=await h.fetch(req.url(),{method:req.method(),body:req.postData()});
      await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()});
    });
  }
  return ctx;
}
try {
  const mobileContext=await context({width:390,height:844}), pcContext=await context({width:1440,height:1000});
  const mobile=await mobileContext.newPage(), admin=await pcContext.newPage();
  await mobile.goto(base+'#apply');
  await mobile.locator('#application-form').waitFor();
  await mobile.locator('[name="itsCompany"]').fill('모바일 테스트 기업');
  await mobile.locator('[name="contactName"]').fill('테스트 담당');
  await mobile.locator('[name="phone"]').fill('010-0000-0000');
  await mobile.locator('[name="email"]').fill('mobile@example.com');
  await mobile.locator('[name="time"]').first().check();
  await mobile.locator('[name="details"]').fill('모바일에서 신청한 중앙 데이터입니다.');
  await mobile.locator('[name="consent"]').check();
  await mobile.locator('#privacy-toggle').click();
  assert.match(await mobile.locator('#privacy-details').innerText(),/Google Sheets/);
  await mobile.locator('[name="privacyConsent"]').check();
  await mobile.locator('#application-form button[type="submit"]').click();
  await mobile.locator('#new-request-id').waitFor();
  const id=await mobile.locator('#new-request-id').inputValue();
  assert.match(id,/^KN-/);
  await mobile.locator('#go-lookup').click();
  await mobile.locator('#lookup-result .detail-id').waitFor();
  assert.equal(await mobile.locator('#lookup-form [name="email"]').inputValue(),'mobile@example.com');
  assert.equal(await mobile.locator('#reset-demo').isVisible(),false);
  await admin.goto(base+'#admin');
  await admin.locator('[name="id"]').fill(h.admin.id);
  await admin.locator('[name="password"]').fill(h.admin.password);
  await admin.locator('#admin-login-form button[type="submit"]').click();
  await admin.locator('[data-detail="'+id+'"]').waitFor();
  await admin.locator('[data-slot-detail][data-provider="deepx"]').first().click();
  await admin.locator('[data-popup-request="'+id+'"]').click();
  assert.match(await admin.locator('#result-dialog').innerText(),/모바일 테스트 기업/);
  await admin.locator('[data-close-dialog]').click();
  const providerContext=await context({width:1365,height:900}), npu=await providerContext.newPage();
  await npu.goto(base+'#npu');
  await npu.locator('[name="providerId"]').selectOption('deepx');
  await npu.locator('[name="approvalCode"]').fill(h.credentials.deepx);
  await npu.locator('#provider-login-form button[type="submit"]').click();
  await npu.locator('[data-decision="매칭확정"][data-id="'+id+'"]').click();
  await npu.locator('#confirm-action').click();
  await npu.locator('#result-dialog').waitFor({state:'hidden'});
  assert.equal(await npu.locator('.profile-name').innerText(),'딥엑스');
  await mobile.locator('#lookup-form button[type="submit"]').click();
  await mobile.locator('#lookup-result .badge.confirmed').waitFor();
  await npu.goto(base+'#matching');
  await npu.locator('[data-detail="'+id+'"]').click();
  assert.match(await npu.locator('#result-dialog').innerText(),/모바일 테스트 기업/);
  await npu.locator('[data-close-dialog]').click();
  await npu.reload(); await npu.locator('#refresh-matching').waitFor(); // sessionStorage restoration
  const capacityForm=npu.locator('.slot-capacity-form').nth(1);
  await capacityForm.locator('[name="capacity"]').fill('0');
  await capacityForm.locator('button[type="submit"]').click();
  await mobile.goto(base+'#apply');
  await mobile.locator('[name="time"]').nth(1).waitFor({state:'attached'});
  assert.equal(await mobile.locator('[name="time"]').nth(1).isDisabled(),true);
  // An already-open ITS page updates a changed capacity by polling.
  const reopened=npu.locator('.slot-capacity-form').nth(1);
  await reopened.locator('[name="capacity"]').fill('2');
  await reopened.locator('button[type="submit"]').click();
  await mobile.waitForFunction(()=>document.querySelectorAll('[name="time"]')[1]?.disabled===false);
  await mobile.goto(base+'#lookup');
  await mobile.locator('#lookup-form [name="id"]').fill(id);
  await mobile.locator('#lookup-form [name="email"]').fill('mobile@example.com');
  await mobile.locator('#lookup-form button[type="submit"]').click();
  await mobile.locator('#cancel-request').click();
  await mobile.locator('#confirm-action').click();
  await mobile.locator('#lookup-result .badge.cancelled').waitFor();
  assert.equal(h.value(h.call('getAvailability',{providerId:'deepx'}))[0].confirmed,0);
  await admin.locator('#refresh-admin').click();
  await admin.locator('#history-results').getByText('취소',{exact:true}).waitFor();
  await fs.mkdir('artifacts',{recursive:true});
  await admin.screenshot({path:'artifacts/gas-admin-desktop.png',fullPage:true});
  await mobile.screenshot({path:'artifacts/gas-lookup-mobile.png',fullPage:true});
  for(const page of [admin,mobile,npu]) {
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  assert.equal(loaded.some(url=>url.includes('/mock-api.js')),false);
  const mockContext=await context({width:1440,height:900},false), mock=await mockContext.newPage();
  await mock.goto(base+'#lookup'); await mock.locator('#fill-example').click();
  await mock.locator('#lookup-form button[type="submit"]').click();
  await mock.locator('#lookup-result .detail-id').waitFor();
  assert.equal(await mock.locator('#reset-demo').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile apply → desktop admin → NPU approval → lookup → slot polling → cancellation; mock preserved; no page errors/overflow.');
  console.log('Uses Google service doubles; actual GAS/GitHub Pages CORS and devices still require deployment testing.');
} finally { await browser.close(); }
