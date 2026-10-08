// Reproducible LOCAL measurements, not real GAS network latency.
// Baseline is the user's pre-V3 commit, served through browser interception without pull/reset.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHarness} from './gas-harness.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const baseline='f0a4c3fb472b38b3af0efcb205d1bbb40b6f8ed0',url='https://script.google.com/macros/s/test/exec',base=process.env.PREVIEW_URL||'http://127.0.0.1:4173/';
const phase=process.argv[2]||'final',browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
const oldFiles=new Map();
const old=(path)=>{if(!oldFiles.has(path))oldFiles.set(path,execFileSync('git',['show',baseline+':'+path],{encoding:'utf8',maxBuffer:5e6}));return oldFiles.get(path);};
const specs=[['home','home'],['apply','apply'],['npu-login','npu'],['npu-requests','npu','provider'],['matching','matching','provider'],['admin-login','admin'],['admin-dashboard','admin','admin'],['find-id','find-id'],['brochures','brochures']];
async function measure(mode){
 const sources=mode==='before'?Object.fromEntries(['Config','Revision','Database','Setup','Migration','Auth','Services','Code'].map(n=>[n,old('apps-script/'+n+'.gs')])):{};
 const h=createHarness({sources});for(let i=0;i<200;i++)h.value(h.call('submitRequest',h.form({email:'synthetic-'+i+'@example.com'})));
 const report={};
 for(const [name,hash,role]of specs){
 const samples=[];
 for(let repeat=0;repeat<3;repeat++){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),calls=[];let bytes=0,pdfs=0;
 ctx.on('request',r=>{if(/\.pdf(?:$|\?)/.test(r.url()))pdfs++;});
 if(mode==='before')await ctx.route('**/assets/**',async route=>{const path=new URL(route.request().url()).pathname.slice(1);if(/\.(?:js|css)$/.test(path)&&!path.endsWith('runtime-config.js')){await route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:old(path)});}else await route.continue();});
 await ctx.route('**/assets/js/runtime-config.js',r=>r.fulfill({contentType:'text/javascript',body:'export const RUNTIME_CONFIG={backend:"gas",gasUrl:'+JSON.stringify(url)+',refreshIntervalMs:30000,revisionPolling:{providerMs:5000,adminMs:10000,retryMs:30000}};export function resolveBackend(){return "gas";}'}));
 await ctx.route(url+'**',async route=>{const r=route.request();calls.push(r.method()==='GET'?new URL(r.url()).searchParams.get('action'):JSON.parse(r.postData()).action);const response=await h.fetch(r.url(),{method:r.method(),body:r.postData()}),body=await response.text();bytes+=Buffer.byteLength(body);await new Promise(resolve=>setTimeout(resolve,100));await route.fulfill({contentType:'application/json',body});});
 await ctx.addInitScript(()=>{window.renderMetrics={staticAt:null,replacements:0};new MutationObserver(events=>{const main=document.querySelector('#main');if(main?.children.length&&window.renderMetrics.staticAt===null)window.renderMetrics.staticAt=performance.now();window.renderMetrics.replacements+=events.filter(e=>e.target===main&&e.type==='childList').length;}).observe(document,{childList:true,subtree:true});});
 const p=await ctx.newPage();let start=0,counters={...h.counters};await p.goto(base+'#'+hash);await p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
 if(role){
 calls.length=0;bytes=0;counters={...h.counters};
 if(role==='provider'){await p.locator('[name="providerId"]').selectOption('deepx');await p.locator('[name="approvalCode"]').fill(h.credentials.deepx);}
 else{await p.locator('[name="id"]').fill(h.admin.id);await p.locator('[name="password"]').fill(h.admin.password);}
 start=await p.evaluate(()=>{window.renderMetrics={staticAt:null,replacements:0};return performance.now();});
 await p.locator(role==='provider'?'#provider-login-form button[type="submit"]':'#admin-login-form button[type="submit"]').click();
 await p.locator(role==='provider'?(hash==='matching'?'.matching-panel':'.status-tabs'):'#history-filters').waitFor();await p.waitForFunction(()=>document.querySelector('#main')?.dataset.loading==='false');
 }
 const metric=await p.evaluate(()=>({...window.renderMetrics,readyAt:performance.now(),entries:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.encodedBodySize}))}));
 samples.push({staticMs:+((metric.staticAt||metric.readyAt)-start).toFixed(1),readyMs:+(metric.readyAt-start).toFixed(1),gasRequests:calls.length,actions:[...calls],sheetBatchReads:h.counters.batchGets-counters.batchGets,sheetRangeReads:h.counters.rangeReads-counters.rangeReads,payloadBytes:bytes,mainReplacements:metric.replacements,pdfInitialRequests:pdfs,staticBytes:metric.entries.filter(r=>!r.name.startsWith(url)).reduce((n,r)=>n+r.bytes,0)});
 await ctx.close();
 }
 const median=key=>[...samples].map(s=>s[key]).sort((a,b)=>a-b)[1];
 report[name]={...samples[1],staticMs:median('staticMs'),readyMs:median('readyMs'),samples};
 }
 return report;
}
try{
 const report={baseline,phase,fixture:'200 synthetic pending applications + 200 audit records; desktop 1440x1000; 3 samples/route; fixed 100ms simulated delay per API; no real GAS requests',before:await measure('before'),after:await measure('after')};
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/v3-performance-'+phase+'.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(Object.fromEntries(['before','after'].map(m=>[m,Object.fromEntries(Object.entries(report[m]).map(([n,r])=>[n,{staticMs:r.staticMs,readyMs:r.readyMs,gas:r.gasRequests,batchReads:r.sheetBatchReads,payload:r.payloadBytes,mainReplacements:r.mainReplacements}]))])),null,2));
}finally{await browser.close();}
