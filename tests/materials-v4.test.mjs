import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
import {MATERIAL_CATALOG} from '../assets/js/material-catalog.js';
import {materialAvailable,materialSessionId} from '../assets/js/materials.js';
import {materialCompanyCards,materialsPage,eventHome} from '../assets/js/material-views.js';
import {aggregateMaterialViews} from '../assets/js/material-stats.js';
const setup=()=>{const h=createHarness();h.context.syncMaterialCatalog();return h;};
const good=(h,a,i={})=>h.value(h.call(a,i));
const click=(materialId='NPU-DEEPX-BROCHURE',sessionId=randomUUID())=>({materialId,sessionId,clickId:randomUUID()});
const stats=(h,filters={})=>good(h,'getMaterialStatistics',{token:h.adminToken(),...filters});
function enableSyntheticPresentation(h){
 // In-memory service fixture only. No PDF file is created, published or requested.
 const m=h.context.MATERIAL_CATALOG_SEED.materials.find(m=>m.materialId==='NPU-DEEPX-PITCH');
 Object.assign(m,{filePath:'assets/materials/npu/deepx/mock-only.pdf',available:true,publicApproved:true});
 h.context.syncMaterialCatalog();
}
test('V4 catalog has no invented ITS speakers or placeholder presentations; brochures are unchanged real files',()=>{
 assert.equal(MATERIAL_CATALOG.companies.filter(c=>c.companyType==='ITS').length,0);
 const presentations=MATERIAL_CATALOG.materials.filter(m=>m.materialType==='presentation');
 assert.equal(presentations.length,4);
 for(const m of presentations){assert.equal(m.filePath,null);assert.equal(m.available,false);assert.equal(materialAvailable(m),false);}
 for(const m of MATERIAL_CATALOG.materials.filter(m=>m.materialType==='brochure')){
  assert.equal(materialAvailable(m),true);assert.equal(fs.readFileSync(m.filePath).subarray(0,5).toString(),'%PDF-');
 }
 const html=materialsPage();assert.equal((html.match(/data-material-id=/g)||[]).length,4);
 assert.equal((html.match(/disabled aria-label="발표자료 준비 중"/g)||[]).length,4);
 assert.match(html,/발표자료 준비 중/);assert.match(eventHome(),/href="#business"/);assert.match(eventHome(),/href="#materials"/);
 assert.doesNotMatch(html,/mock-only\.pdf|iframe|<embed|<object/);
});
test('ITS cards are data-driven, escaped, unbounded in count and pending without a file',()=>{
 const companies=Array.from({length:17},(_,i)=>({companyId:'its-'+i,companyType:'ITS',name:i===0?'<script>alert(1)</script>':'ITS '+i}));
 const html=materialCompanyCards('ITS',{companies,materials:[]});
 assert.equal((html.match(/data-material-company=/g)||[]).length,17);assert.equal((html.match(/disabled/g)||[]).length,17);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/href=/);
});
test('V4 editor migration adds only analytics table and is repeatable; it never creates a replacement DB',()=>{
 const h=createHarness(),book=h.context.SpreadsheetApp.openById(h.properties.get('SHEET_ID'));
 book.sheets=book.sheets.filter(s=>s.name!=='자료열람이력');
 const original=JSON.stringify(book.sheets.map(s=>s.data)),props=JSON.stringify([...h.properties]);
 assert.equal(h.context.migrateMaterialLibraryV4().created,true);
 h.sheet('materialViews').data.push(['existing']);assert.equal(h.context.migrateMaterialLibraryV4().created,false);
 assert.equal(h.sheet('materialViews').data.length,2);
 assert.equal(JSON.stringify(book.sheets.filter(s=>s.name!=='자료열람이력').map(s=>s.data)),original);
 assert.equal(JSON.stringify([...h.properties]),props);
 h.properties.delete('SHEET_ID');assert.throws(()=>h.context.migrateMaterialLibraryV4());assert.equal(h.created,1);
 for(const action of ['migrateMaterialLibraryV4','syncMaterialCatalog'])assert.equal(h.call(action).error.code,'UNKNOWN_ACTION');
});
test('material registry sync changes only its own sharded Properties and new IDs work without deployment',()=>{
 const h=setup(),secrets=[...h.properties].filter(([k])=>!k.startsWith('KNPU_MATERIAL'));
 const catalog=h.context.MATERIAL_CATALOG_SEED;
 for(let i=0;i<60;i++){catalog.companies.push({companyId:'future-'+i,companyType:'ITS',name:'확인된 테스트 기업 '+i});catalog.materials.push({materialId:'ITS-FUTURE-'+i,companyId:'future-'+i,companyType:'ITS',materialType:'presentation',title:'발표자료 '+i,filePath:null,available:false,publicApproved:false});}
 h.context.syncMaterialCatalog();assert.equal(h.context.materialCatalog_().materials.length,68);
 const current=JSON.parse(h.properties.get('KNPU_MATERIAL_REGISTRY_V4'));assert.ok(current.count>1);
 assert.equal([...h.properties].filter(([k])=>k.startsWith('KNPU_MATERIAL_')&&k!=='KNPU_MATERIAL_REGISTRY_V4').length,current.count);
 for(const [key,value]of secrets)assert.equal(h.properties.get(key),value);
 assert.equal(stats(h).materials.length,68);
});
test('missing/unknown/preparing materials and forged metadata never produce click records',()=>{
 const h=setup(),before=h.counters.batches;
 for(const id of ['NPU-DEEPX-PITCH','UNKNOWN','../private'])assert.equal(h.call('logMaterialView',click(id)).error.code,'MATERIAL_UNAVAILABLE');
 assert.equal(h.call('logMaterialView',{...click(),url:'https://evil.example/x.pdf'}).error.code,'VALIDATION');
 assert.equal(h.call('logMaterialView',{...click(),companyName:'private'}).error.code,'VALIDATION');
 assert.equal(h.call('logMaterialView',{...click(),sessionId:'email@example.com'}).error.code,'VALIDATION');
 assert.equal(h.call('logMaterialView',click(),'GET').error.code,'METHOD_NOT_ALLOWED');
 assert.equal(h.counters.batches,before);assert.equal(h.sheet('materialViews').data.length,1);
});
test('registered PDF clicks store server metadata/time and keyed session hashes in analytics only',()=>{
 const h=setup(),input=click(),revision=h.properties.get('KNPU_REVISIONS_V1');
 const before=JSON.stringify(['requests','history','capacities','providers'].map(t=>h.sheet(t).data));
 assert.equal(good(h,'logMaterialView',input).recorded,true);
 const row=h.sheet('materialViews').data[1];assert.equal(row[2],input.materialId);assert.equal(row[4],'딥엑스');assert.equal(row[6],'brochure');
 assert.ok(Number.isFinite(Date.parse(row[1])));assert.notEqual(row[0],input.clickId);assert.equal(row[9],input.clickId);
 assert.ok(row[8]);assert.equal(row.includes(input.sessionId),false);
 assert.equal(h.properties.get('KNPU_REVISIONS_V1'),revision);
 assert.equal(JSON.stringify(['requests','history','capacities','providers'].map(t=>h.sheet(t).data)),before);
 const response=stats(h);assert.equal(response.totalClicks,1);
 const serialized=JSON.stringify(response);for(const forbidden of [input.sessionId,input.clickId,row[0],row[8]])assert.equal(serialized.includes(forbidden),false);
});
test('click writes deduplicate lost replies, enforce bounded traffic and use the shared lock',()=>{
 const h=setup(),input=click();good(h,'logMaterialView',input);
 assert.equal(good(h,'logMaterialView',input).duplicate,true);assert.equal(h.sheet('materialViews').data.length,2);
 h.beforeNextBatch(()=>assert.equal(h.call('logMaterialView',click()).error.code,'BUSY'));
 good(h,'logMaterialView',click());
 for(let i=0;i<29;i++)good(h,'logMaterialView',click('NPU-DEEPX-BROCHURE',input.sessionId));
 assert.equal(h.call('logMaterialView',click('NPU-DEEPX-BROCHURE',input.sessionId)).error.code,'RATE_LIMITED');
 h.advance(60001);assert.equal(good(h,'logMaterialView',click('NPU-DEEPX-BROCHURE',input.sessionId)).recorded,true);
});
test('anonymous statistics are impossible: auth and method checks precede catalog/Sheet reads',()=>{
 const h=setup(),p=h.provider('deepx'),before={...h.counters};
 for(const token of [undefined,p,'fake'])assert.equal(h.call('getMaterialStatistics',{token}).ok,false);
 assert.equal(h.call('getMaterialStatistics',{},'GET').error.code,'METHOD_NOT_ALLOWED');
 assert.equal(h.counters.opens,before.opens);assert.equal(h.counters.batchGets,before.batchGets);
 const token=h.adminToken();good(h,'logout',{token});assert.equal(h.call('getMaterialStatistics',{token}).error.code,'UNAUTHORIZED');
});
test('mixed synthetic clicks aggregate by material/company/type/day and deduplicate sessions across rows',()=>{
 const h=setup(),one=randomUUID(),two=randomUUID();enableSyntheticPresentation(h);
 // Deterministic KST date boundary, without real Google I/O.
 const t=h.context.Date.now();h.advance(Date.parse('2026-10-14T14:59:59Z')-t);
 good(h,'logMaterialView',click('NPU-DEEPX-PITCH',one));good(h,'logMaterialView',click('NPU-DEEPX-BROCHURE',one));
 h.advance(2000);good(h,'logMaterialView',click('NPU-MOBILINT-BROCHURE',two));
 const result=stats(h);assert.equal(result.totalClicks,3);assert.equal(result.uniqueSessions,2);
 assert.deepEqual(result.types.map(r=>r.clicks),[1,2]);assert.deepEqual(result.daily.map(r=>[r.date,r.clicks]),[['2026-10-15',1],['2026-10-14',2]]);
 assert.equal(result.companies.find(c=>c.companyId==='deepx').uniqueSessions,1);
 assert.equal(stats(h,{from:'2026-10-14',to:'2026-10-14'}).totalClicks,2);
 assert.equal(stats(h,{materialType:'presentation'}).totalClicks,1);assert.equal(stats(h,{companyId:'mobilint'}).totalClicks,1);
 assert.equal(h.call('getMaterialStatistics',{token:h.adminToken(),from:'2026-02-30'}).error.code,'VALIDATION');
 assert.equal(stats(h,{from:'2030-01-01'}).totalClicks,0);
});
test('empty aggregates preserve unregistered materials and individual history is paginated without identifiers',()=>{
 const h=setup(),empty=stats(h);assert.equal(empty.totalClicks,0);assert.equal(empty.uniqueSessions,0);assert.deepEqual(empty.records,[]);
 assert.equal(empty.materials.filter(m=>!m.available).length,4);
 for(let i=0;i<105;i++)good(h,'logMaterialView',click());
 const first=stats(h),last=stats(h,{offset:100});assert.equal(first.records.length,100);assert.equal(last.records.length,5);assert.equal(last.totalRecords,105);
 assert.deepEqual(Object.keys(last.records[0]).sort(),['companyName','companyType','materialId','materialType','occurredAt','title']);
});
test('GAS adapter click and admin stats are simple POSTs; click failure never auto-retries',async()=>{
 const h=setup(),calls=[],url='https://script.google.com/macros/s/test/exec';
 const api=createGasApi({url,fetchImpl:async(u,o)=>{calls.push({u,o});return h.fetch(u,o);}});
 const input=click();await api.logMaterialView({...input,token:'never-send',url:'never-send'});
 const token=h.adminToken();assert.equal((await api.getMaterialStatistics({token})).totalClicks,1);
 for(const call of calls){assert.equal(new URL(call.u).search,'');assert.equal(call.o.method,'POST');assert.equal(call.o.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(call.o.mode,'cors');}
 assert.equal(JSON.parse(calls[0].o.body).token,undefined);assert.equal(JSON.parse(calls[0].o.body).url,undefined);
 let attempts=0;const broken=createGasApi({url,fetchImpl:async()=>{attempts++;throw Error('offline');},backoff:async()=>{}});
 await assert.rejects(broken.logMaterialView(input));assert.equal(attempts,1);
});
test('mock clicks start empty, stay separate from applications, require admin for stats and reset without fixtures',async()=>{
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 const {api}=await import('../assets/js/mock-api.js');await api.resetDemo();
 const token=await api.authenticateAdmin({id:'ITSKOREA9911',password:'ITSKOREA9911!'});
 assert.equal((await api.getMaterialStatistics({token})).totalClicks,0);
 const input=click();await api.logMaterialView(input);await api.logMaterialView(input);
 assert.equal((await api.getMaterialStatistics({token})).totalClicks,1);await assert.rejects(api.getMaterialStatistics({}));
 await assert.rejects(api.logMaterialView(click('NPU-DEEPX-PITCH')));
 assert.equal([...store].some(([k,v])=>k==='knpu-material-clicks-demo-v1'&&v.includes('demo1@example.com')),false);
 await api.resetDemo();const next=await api.authenticateAdmin({id:'ITSKOREA9911',password:'ITSKOREA9911!'});assert.equal((await api.getMaterialStatistics({token:next})).totalClicks,0);
 const sessionStore=new Map(),storage={getItem:k=>sessionStore.get(k),setItem:(k,v)=>sessionStore.set(k,v)};
 assert.equal(materialSessionId(storage),materialSessionId(storage));assert.equal(sessionStore.size,1);
});
