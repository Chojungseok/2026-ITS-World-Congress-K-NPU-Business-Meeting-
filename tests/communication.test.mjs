import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
import {API_VERSION,BUILD_VERSION} from '../assets/js/build-version.js';
const url='https://script.google.com/macros/s/test/exec';
const reply=(data,extra={})=>new Response(JSON.stringify({ok:true,data,meta:{apiVersion:API_VERSION},...extra}),{headers:{'Content-Type':'application/json'}});
const failure=(code)=>reply(null,{ok:false,error:{code,message:'일시적 실패'}});
const code=(expected,uncertain)=>e=>e.code===expected&&(uncertain===undefined||!!e.uncertain===uncertain);

test('API version guard precedes method, auth, Sheet reads, locks and all writes',()=>{
 const h=createHarness(),before={...h.counters};
 for(const apiVersion of [undefined,'2026-10-v3.0','next-version'])for(const action of ['authenticateProvider','authenticateAdmin','submitRequest','getAdminOverview'])for(const method of ['GET','POST']){
  const r=h.call(action,{apiVersion},method);assert.equal(r.error.code,'API_VERSION_MISMATCH');assert.equal(r.meta.apiVersion,API_VERSION);
 }
 assert.equal(h.counters.locks,before.locks);assert.equal(h.counters.batchGets,before.batchGets);assert.equal(h.counters.batches,before.batches);
 for(const action of ['authenticateProvider','authenticateAdmin','submitRequest','getAdminOverview'])assert.equal(h.call(action,{},'GET').error.code,'METHOD_NOT_ALLOWED');
 assert.equal(h.counters.locks,before.locks);
 assert.equal(JSON.parse(h.context.doPost({postData:{contents:'broken-json'}}).text).meta.apiVersion,API_VERSION);
});

test('submit snapshot reads precisely five validation columns in one batch and preserves atomic lock/write',()=>{
 const h=createHarness(),original=h.context.Sheets.Spreadsheets.Values.batchGet,ranges=[];
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,opts)=>{ranges.push(...opts.ranges);return original(id,opts);};
 const before={...h.counters};const r=h.value(h.call('submitRequest',h.form()));
 assert.deepEqual(ranges.filter(s=>s.startsWith("'상담신청'!")),["'상담신청'!A1:Q1","'상담신청'!C2:C","'상담신청'!F2:F","'상담신청'!G2:G","'상담신청'!I2:I","'상담신청'!L2:L"]);
 assert.equal(h.counters.batchGets-before.batchGets,1);assert.equal(h.counters.batches-before.batches,1);assert.equal(h.counters.locks-before.locks,1);
 assert.equal(h.sheet('requests').data.length,2);assert.equal(h.sheet('history').data.length,2);assert.match(r.id,/^KN-/);
 assert.equal(h.call('submitRequest',h.form()).error.code,'DUPLICATE');
});

test('combined provider login returns only its data after auth lock release and retains opt-out string token',()=>{
 const h=createHarness();h.value(h.call('submitRequest',h.form()));h.value(h.call('submitRequest',h.form({providerId:'mobilint'})));
 const original=h.context.Sheets.Spreadsheets.Values.batchGet,locked=[];
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,o)=>{locked.push(h.locked);return original(id,o);};
 const data=h.value(h.call('authenticateProvider',{providerId:'deepx',approvalCode:h.credentials.deepx,includeInitialData:true}));
 assert.deepEqual(locked,[true,false]);assert.equal(data.providerId,'deepx');assert.ok(data.snapshot.requests.every(r=>r.providerId==='deepx'));assert.equal(data.snapshot.requests.length,1);assert.ok(data.snapshot.config);assert.ok(data.snapshot.revision);
 assert.equal(typeof h.provider('mobilint'),'string');
 assert.equal(h.call('getAdminOverview',{token:data.token}).error.code,'FORBIDDEN');
 assert.equal(h.call('authenticateProvider',{providerId:'deepx',approvalCode:'wrong',includeInitialData:true}).error.code,'INVALID_CREDENTIALS');
});

test('combined admin login releases auth lock before one coherent read lock; data failure preserves valid token',()=>{
 const h=createHarness(),lock=h.context.LockService.getScriptLock,events=[];
 h.context.LockService.getScriptLock=()=>{const l=lock();return {tryLock:()=>{const ok=l.tryLock();events.push('acquire');return ok;},releaseLock:()=>{events.push('release');l.releaseLock();}};};
 const r=h.value(h.call('authenticateAdmin',{...h.admin,includeOverview:true}));
 assert.deepEqual(events,['acquire','release','acquire','release']);assert.ok(r.overview.config);assert.ok(r.overview.revision);
 const original=h.context.Sheets.Spreadsheets.Values.batchGet;
 h.context.Sheets.Spreadsheets.Values.batchGet=()=>{throw Error('secret private failure');};
 const fallback=h.value(h.call('authenticateAdmin',{...h.admin,includeOverview:true}));
 assert.ok(fallback.token);assert.equal(fallback.initialDataError.code,'INTERNAL');assert.doesNotMatch(JSON.stringify(fallback.initialDataError),/secret|stack/);
 h.context.Sheets.Spreadsheets.Values.batchGet=original;
 assert.ok(h.call('getAdminOverview',{token:fallback.token}).ok);
});

test('diagnostics contain only safe stages/action/method/version and are disabled by default',()=>{
 const h=createHarness(),logs=[];h.context.console.log=s=>logs.push(s);
 assert.equal(h.call('getConfig',{},'GET').meta.timing,undefined);
 h.properties.set('PERFORMANCE_DIAGNOSTICS','true');
 const raw=h.context.Sheets.Spreadsheets.Values.batchGet;
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,o)=>{h.advance(12);return raw(id,o);};
 const r=h.call('submitRequest',h.form({itsCompany:'PRIVATE COMPANY',contactName:'PRIVATE NAME',email:'private@example.com',details:'PRIVATE DETAILS'}));
 assert.equal(r.meta.timing.snapshotMs,12);assert.equal(r.meta.timing.elapsedMs,12);assert.equal(r.meta.timing.action,'submitRequest');assert.equal(h.context.performanceContext_,null);
 h.call('PRIVATE UNKNOWN',{apiVersion:'PRIVATE VERSION',token:'PRIVATE TOKEN',password:'PRIVATE PASSWORD'});
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE|@|KN-|Spreadsheet|\.gs/);assert.equal(logs.length,2);
 assert.deepEqual(Object.keys(r.meta.timing).sort(),['action','method','clientVersion','lockWaitMs','lockHeldMs','snapshotMs','writeMs','elapsedMs','businessMs'].sort());
});

test('session index avoids hot full property scan and retains 200 session limit, expiry and logout',()=>{
 const h=createHarness();const first=h.adminToken(),scans=h.counters.propertyScans;
 for(let i=1;i<200;i++)h.adminToken();
 assert.equal(h.counters.propertyScans,scans);assert.ok(Buffer.byteLength(h.properties.get('KNPU_SESSION_INDEX_V1'))<=9000);
 assert.equal(h.call('authenticateAdmin',h.admin).error.code,'BUSY');
 h.value(h.call('logout',{token:first}));assert.equal(h.call('getAdminRevision',{token:first}).error.code,'UNAUTHORIZED');
 const fresh=h.adminToken();h.advance(30*60*1000+1);
 assert.equal(h.call('getAdminRevision',{token:fresh}).error.code,'UNAUTHORIZED');
 const keysBefore=[...h.properties.keys()].filter(k=>k.startsWith('SESSION_')).length;
 h.adminToken();const keysAfter=[...h.properties.keys()].filter(k=>k.startsWith('SESSION_')).length;
 assert.equal(keysBefore-keysAfter,9); // Ten expired removals and one newly issued session.
});

test('corrupt or interrupted derived session index rebuilds from authoritative sessions',()=>{
 const h=createHarness(),token=h.adminToken(),jti=JSON.parse(Buffer.from(token.split('.')[0],'base64url')).jti;
 h.properties.set('KNPU_SESSION_INDEX_V1',jti.replaceAll('-','')+':abc,');
 const scans=h.counters.propertyScans;h.adminToken();assert.equal(h.counters.propertyScans,scans+1);
 const props=h.context.PropertiesService.getScriptProperties(),set=props.setProperty;
 props.setProperty=(key,value)=>{if(key==='KNPU_SESSION_INDEX_V1')throw Error('simulated property outage');return set(key,value);};
 assert.equal(h.call('authenticateAdmin',h.admin).error.code,'INTERNAL');assert.equal(h.properties.has('KNPU_SESSION_INDEX_V1'),false);
 props.setProperty=set;h.adminToken();assert.ok(h.properties.has('KNPU_SESSION_INDEX_V1'));
 assert.ok(h.call('getAdminRevision',{token}).ok);
 h.configure();assert.equal(h.call('getAdminRevision',{token}).error.code,'UNAUTHORIZED');assert.equal(h.properties.has('KNPU_SESSION_INDEX_V1'),false);
});

for(const kind of ['fetch','502','503','busy'])test('safe reads recover with one retry: '+kind,async()=>{
 let calls=0,waits=[];
 const api=createGasApi({url,backoff:async ms=>waits.push(ms),fetchImpl:async()=>{
  if(++calls===1){if(kind==='fetch')throw TypeError('secret fetch failure');if(kind==='busy')return failure('BUSY');return new Response('',{status:Number(kind)});}return reply([]);
 }});
 assert.deepEqual(await api.getAvailability('deepx'),[]);assert.equal(calls,2);assert.equal(waits.length,1);assert.ok(waits[0]>=250&&waits[0]<=500);
});

test('safe reads stop after one retry and diagnostics never carry payload or transport exception',async()=>{
 let calls=0;const timings=[];
 const api=createGasApi({url,backoff:async()=>{},onTiming:t=>timings.push(t),fetchImpl:async()=>{calls++;throw TypeError('PRIVATE TOKEN PASSWORD');}});
 await assert.rejects(api.getAdminOverview('PRIVATE TOKEN'),code('NETWORK_FETCH_FAILED'));assert.equal(calls,2);
 assert.doesNotMatch(JSON.stringify(timings),/PRIVATE|TOKEN|PASSWORD/);assert.deepEqual(timings.map(t=>t.attempt),[1,2]);
});

for(const [name,run] of [
 ['submitRequest',a=>a.submitRequest({})],['decideRequest',a=>a.decideRequest({})],['cancelRequest',a=>a.cancelRequest({id:'id',email:'a@b.com'})],['extendSchedule',a=>a.extendSchedule({token:'private',expectedLastTime:'time'})],['updateProviderCapacity',a=>a.updateProviderCapacity({})],
 ['authenticateProvider',a=>a.authenticateProvider({})],['authenticateAdmin',a=>a.authenticateAdmin({})],['findRequest',a=>a.findRequest({id:'id',email:'a@b.com'})],['findRequestIds',a=>a.findRequestIds({})]
])test(name+' is never automatically re-executed after lost response',async()=>{
 let calls=0;const api=createGasApi({url,backoff:async()=>{},fetchImpl:async()=>{calls++;throw TypeError('lost');}});
 const isWrite=['submitRequest','decideRequest','cancelRequest','extendSchedule','updateProviderCapacity'].includes(name);
 await assert.rejects(run(api),e=>e.code==='NETWORK_FETCH_FAILED'&&(!isWrite||e.uncertain&&/확인/.test(e.message)));
 assert.equal(calls,1);
});

test('timeout is distinct, bounded and not retried; JSON/HTTP/envelope failures are distinct',async()=>{
 let calls=0;const timeout=createGasApi({url,timeoutMs:15,fetchImpl:async(_,o)=>{calls++;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Abort','AbortError'))));}});
 await assert.rejects(timeout.getConfig(),code('NETWORK_TIMEOUT'));assert.equal(calls,1);
 for(const [response,expected] of [[new Response('<html>'), 'INVALID_RESPONSE'],[new Response('{}'),'INVALID_RESPONSE'],[new Response('',{status:500}),'HTTP_ERROR']]){
  calls=0;const a=createGasApi({url,fetchImpl:async()=>{calls++;return response;}});await assert.rejects(a.getConfig(),code(expected));assert.equal(calls,1);
 }
});

test('server failure after a possible commit is uncertain and never retried',async()=>{
 let calls=0;const api=createGasApi({url,fetchImpl:async()=>{calls++;return failure('INTERNAL');}});
 await assert.rejects(api.decideRequest({}),code('INTERNAL',true));assert.equal(calls,1);
});

test('version refusal never retries writes; missing server metadata treats write result as uncertain',async()=>{
 let calls=0;
 const a=createGasApi({url,fetchImpl:async()=>{calls++;return failure('API_VERSION_MISMATCH');}});
 await assert.rejects(a.submitRequest({}),code('API_VERSION_MISMATCH',false));assert.equal(calls,1);
 for(const meta of [undefined,{apiVersion:'next'}]){
  const b=createGasApi({url,fetchImpl:async()=>new Response(JSON.stringify({ok:true,data:{id:'not-logged'},meta}))});
  await assert.rejects(b.submitRequest({}),code('API_VERSION_MISMATCH',true));
 }
});

test('all requests carry version, sensitive operations use POST and ContentService redirects follow',async()=>{
 const h=createHarness(),seen=[];const api=createGasApi({url,fetchImpl:async(u,o)=>{seen.push({u,o});return h.fetch(u,o);}});
 await api.getAvailability('deepx');const p=await api.authenticateProvider({providerId:'deepx',approvalCode:h.credentials.deepx,includeInitialData:true});
 const a=await api.authenticateAdmin({...h.admin,includeOverview:true});await api.submitRequest(h.form());await api.getAdminOverview(a.token);
 assert.ok(p.snapshot.config);assert.ok(a.overview.config);
 for(const {u,o}of seen){assert.equal(o.redirect,'follow');assert.equal(o.mode,'cors');assert.equal(o.credentials,'omit');assert.equal(o.cache,'no-store');if(o.method==='GET')assert.equal(new URL(u).searchParams.get('apiVersion'),API_VERSION);else{assert.equal(JSON.parse(o.body).apiVersion,API_VERSION);assert.equal(o.headers['Content-Type'],'text/plain;charset=utf-8');assert.equal(new URL(u).search,'');}}
 assert.deepEqual(seen.map(s=>s.o.method),['GET','POST','POST','POST','POST']);
});

test('asset map versions every transitive JS module and CSS from a single build source; no PDF preload',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),map=JSON.parse(html.match(/id="asset-importmap">([\s\S]*?)<\/script>/)[1]);
 const files=fs.readdirSync(new URL('../assets/js/',import.meta.url)).filter(s=>s.endsWith('.js'));
 for(const file of files)assert.equal(map.imports['./assets/js/'+file],'./assets/js/'+file+'?v='+BUILD_VERSION);
 assert.ok(html.includes('styles.css?v='+BUILD_VERSION));assert.ok(html.includes('bootstrap.js?v='+BUILD_VERSION));assert.doesNotMatch(html,/<link[^>]+(?:preload|prefetch)[^>]+\.pdf/i);
 assert.ok(html.indexOf('type="importmap"')<html.indexOf('src="./assets/js/bootstrap'));
});
