// Before/after REAL repository code with Google service doubles, NOT Google latency.
// Never checks out, pulls, resets, authenticates to or writes to the operational DB.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHarness} from './gas-harness.mjs';
import {BUILD_VERSION} from '../assets/js/build-version.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const baseline='0e1f4ebf89dfd75aab522c22a6560e273fa74043',url='https://script.google.com/macros/s/test/exec',base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/';
const oldFiles=new Map(),old=p=>{if(!oldFiles.has(p))oldFiles.set(p,execFileSync('git',['show',baseline+':'+p],{encoding:'utf8',maxBuffer:5e6}));return oldFiles.get(p);};
const wait=ms=>new Promise(r=>setTimeout(r,ms)),countKeys=['batchGets','rangeReads','batchCells','locks','propertyScans'];
const specs=[['Home','home'],['Apply','apply'],['Submit','apply','submit'],['Provider login','npu','provider'],['Admin login','admin','admin'],['Provider refresh','npu','provider-refresh'],['Admin overview','admin','admin-refresh']];
async function measure(mode,onlyHome=false){
 const before=mode==='before',sources=before?Object.fromEntries(['Config','Revision','Database','Setup','Migration','MigrationV3','Schedule','Auth','Services','Code'].map(n=>[n,old('apps-script/'+n+'.gs')])):{};
 const h=createHarness({sources});h.properties.set('PERFORMANCE_DIAGNOSTICS','false');
 // Direct synthetic fixtures avoid measuring 200 fixture-write calls and disclose no identities.
 const seed=h.value(h.call('submitRequest',h.form())),requests=h.sheet('requests'),history=h.sheet('history'),sample=[...requests.data[1]],event=[...history.data[1]];
 for(let i=1;i<200;i++){const row=[...sample];row[0]='KN-FIXTURE-'+i;row[2]='Synthetic '+i;row[5]='synthetic-'+i+'@example.com';requests.data.push(row);const e=[...event];e[0]='event-'+i;e[5]=row[0];history.data.push(e);}
 h.context.Date.now=Date.now;
 const report={};
 for(const [name,hash,operation]of specs.filter(s=>!onlyHome||s[0]==='Home')){
 const samples=[];
 for(let repeat=0;repeat<3;repeat++){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[],assets=[];let payloadBytes=0,active=0;
  await ctx.route(base+'**',async route=>{
   const pathname=new URL(route.request().url()).pathname,path=pathname==='/'?'index.html':pathname.slice(1);
   if(!/\.(html|js|css|svg)$/.test(path))return route.continue();
   let body=before&&/\.(html|js|css)$/.test(path)?old(path):fs.readFileSync(path);
   if(mode==='no-preload'&&path==='index.html')body=String(body).replace(/\s*<link rel="modulepreload"[^>]*>/g,'');
   if(mode==='preload'&&path==='index.html'&&!String(body).includes('rel="modulepreload"'))body=String(body).replace('  <script defer','  <link rel="modulepreload" href="./assets/js/app.js?v='+BUILD_VERSION+'">\n  <script defer');
   await wait(20);await route.fulfill({contentType:path.endsWith('.html')?'text/html':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'image/svg+xml',body});
  });
  await ctx.route('**/assets/js/runtime-config.js*',async r=>{await wait(20);await r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',performanceDiagnostics:true,refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,availabilityMs:5000,retryMs:30000}};export function resolveBackend(){return "gas";}'});});
  await ctx.route(url+'**',async route=>{active++;try{const q=route.request(),action=q.method()==='GET'?new URL(q.url()).searchParams.get('action'):JSON.parse(q.postData()).action,response=await h.fetch(q.url(),{method:q.method(),body:q.postData()}),body=await response.text(),parsed=JSON.parse(body);calls.push({action,method:q.method(),serverMs:parsed.meta?.timing?.elapsedMs??null,lockWaitMs:parsed.meta?.timing?.lockWaitMs??0});payloadBytes+=Buffer.byteLength(body);await wait(100);await route.fulfill({contentType:'application/json',body});}finally{active--;}});
  await ctx.addInitScript(()=>{window.staticAt=null;new MutationObserver(()=>{if(window.staticAt===null&&document.querySelector('#main')?.children.length)window.staticAt=performance.now();}).observe(document,{childList:true,subtree:true});});
  const p=await ctx.newPage();p.on('request',q=>assets.push(new URL(q.url()).pathname));let counters={...h.counters},start=0;
  await p.goto(base+'#'+hash);await p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
  async function signIn(role){
   if(role==='provider'){await p.locator('[name="providerId"]').selectOption('deepx');await p.locator('[name="approvalCode"]').fill(h.credentials.deepx);}else{await p.locator('[name="id"]').fill(h.admin.id);await p.locator('[name="password"]').fill(h.admin.password);}
   await p.locator(role==='provider'?'#provider-login-form button[type="submit"]':'#admin-login-form button[type="submit"]').click();await p.locator(role==='provider'?'.status-tabs':'#history-filters').waitFor();await p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
  }
  if(operation?.endsWith('refresh'))await signIn(operation.startsWith('provider')?'provider':'admin');
  if(operation){
   if(operation==='submit'){
    for(const [field,value]of Object.entries({itsCompany:'Synthetic submission',contactName:'Synthetic contact',phone:'010-0000-0000',email:'measured-'+mode+'-'+repeat+'@example.com',details:'Synthetic consultation'}))await p.locator('[name="'+field+'"]').fill(value);
    await p.locator('[name="time"]').first().check();await p.locator('[name="consent"]').check();await p.locator('[name="privacyConsent"]').check();
   }else if(!operation.endsWith('refresh')){
    const provider=operation==='provider';if(provider){await p.locator('[name="providerId"]').selectOption('deepx');await p.locator('[name="approvalCode"]').fill(h.credentials.deepx);}else{await p.locator('[name="id"]').fill(h.admin.id);await p.locator('[name="password"]').fill(h.admin.password);}
   }
   calls.length=0;payloadBytes=0;counters={...h.counters};start=await p.evaluate(()=>{window.staticAt=null;return performance.now();});
   if(operation==='submit'){await p.locator('#application-form button[type="submit"]').click();await p.locator('#new-request-id').waitFor();}
   else if(operation.endsWith('refresh')){await p.locator(operation.startsWith('provider')?'#refresh-provider':'#refresh-admin').click();}
   else{await p.locator(operation==='provider'?'#provider-login-form button[type="submit"]':'#admin-login-form button[type="submit"]').click();await p.locator(operation==='provider'?'.status-tabs':'#history-filters').waitFor();await p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');}
  }
  let readyMs=(await p.evaluate(()=>performance.now()))-start;
  // Include post-submit reconciliation in payload/Sheet counts; keep dialog-ready separately.
  if(operation==='submit'||operation?.endsWith('refresh')){await wait(20);while(active)await wait(10);await p.evaluate(()=>new Promise(requestAnimationFrame));if(operation.endsWith('refresh'))readyMs=(await p.evaluate(()=>performance.now()))-start;}
  const elapsedMs=(await p.evaluate(()=>performance.now()))-start,staticAt=await p.evaluate(()=>window.staticAt);
  const s={elapsedMs:+elapsedMs.toFixed(1),readyMs:+readyMs.toFixed(1),staticMs:+((staticAt??(start+readyMs))-start).toFixed(1),gasHttpCount:calls.length,actions:calls.map(c=>c.action),sheetBatchGetCount:h.counters.batchGets-counters.batchGets,sheetRangeReads:h.counters.rangeReads-counters.rangeReads,sheetCells:h.counters.batchCells-counters.batchCells,lockAcquisitions:h.counters.locks-counters.locks,lockWaitMs:calls.reduce((n,c)=>n+c.lockWaitMs,0),payloadBytes,initialPdfRequests:assets.filter(a=>a.endsWith('.pdf')).length,jsAssets:assets.filter(a=>a.endsWith('.js')),assetCount:assets.length};
  samples.push(s);await ctx.close();
 }
 const median=k=>samples.map(s=>s[k]).sort((a,b)=>a-b)[1];report[name]={...samples[1],elapsedMs:median('elapsedMs'),readyMs:median('readyMs'),staticMs:median('staticMs'),samples};
 }
 return report;
}
try{
 const r={baseline,fixture:'200 synthetic requests + 200 audit rows; 1440x1000; 3 fresh contexts/flow; static responses 20ms and API responses 100ms simulated delay; Google service doubles with zero lock contention. No live auth or writes.',before:await measure('before'),after:await measure('after'),noPreloadExperiment:await measure('no-preload',true)};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/communication-performance.json',JSON.stringify(r,null,2));
 console.log(JSON.stringify(Object.fromEntries(['before','after','noPreloadExperiment'].map(mode=>[mode,Object.fromEntries(Object.entries(r[mode]).map(([n,x])=>[n,{readyMs:x.readyMs,elapsedMs:x.elapsedMs,http:x.gasHttpCount,batchGets:x.sheetBatchGetCount,cells:x.sheetCells,locks:x.lockAcquisitions,bytes:x.payloadBytes,assets:x.assetCount}]))])),null,2));
}finally{await browser.close();}
