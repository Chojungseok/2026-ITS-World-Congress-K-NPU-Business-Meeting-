import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGasApi} from '../assets/js/gas-api.js';
import {createHarness} from './gas-harness.mjs';
const url='https://script.google.com/macros/s/test/exec';
const reply=data=>new Response(JSON.stringify({ok:true,data}));
const config=capacity=>({providers:[{id:'deepx',capacities:{'16:50 – 17:00':capacity}}],times:['16:50 – 17:00'],privacy:{version:'v1'}});
const good=(h,action,input={})=>h.value(h.call(action,input));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('config concurrent callers share one promise/network call, then cache expires at 30 seconds',async()=>{
 let clock=0,calls=0;const pending=deferred();
 const api=createGasApi({url,now:()=>clock,fetchImpl:async()=>{calls++;if(calls===1)await pending.promise;return reply(config(calls));}});
 const a=api.getConfig(),b=api.getConfig();assert.equal(a,b);assert.equal(calls,1);
 pending.resolve();const data=await a;await b;data.providers[0].id='changed';
 assert.equal((await api.getConfig()).providers[0].id,'deepx');
 clock=29999;await api.getConfig();assert.equal(calls,1);
 clock=30000;await api.getConfig();assert.equal(calls,2);
});
test('failed config requests are not cached and can be retried',async()=>{
 let calls=0;const api=createGasApi({url,fetchImpl:async()=>{if(++calls===1)throw Error('offline');return reply(config(5));}});
 await assert.rejects(api.getConfig(),{code:'NETWORK_ERROR'});
 assert.equal((await api.getConfig()).providers[0].capacities['16:50 – 17:00'],5);assert.equal(calls,2);
});
test('capacity mutation invalidates client config both after success and after a lost response',async()=>{
 let calls=0,capacity=5,fail=false;
 const api=createGasApi({url,fetchImpl:async(target,options)=>{
   if(options.method==='GET'){calls++;return reply(config(capacity));}
   capacity=7;if(fail)throw Error('response lost');return reply({capacity});
 }});
 await api.getConfig();await api.updateProviderCapacity({capacity:7});await api.getConfig();assert.equal(calls,2);
 fail=true;await assert.rejects(api.updateProviderCapacity({capacity:7}));await api.getConfig();assert.equal(calls,3);
});
test('a delayed pre-invalidation response cannot repopulate the client cache',async()=>{
 let calls=0;const pending=deferred();
 const api=createGasApi({url,fetchImpl:async()=>{const number=++calls;if(number===1)await pending.promise;return reply(config(number));}});
 const old=api.getConfig();api.invalidateConfig();
 const current=await api.getConfig();assert.equal(current.providers[0].capacities['16:50 – 17:00'],2);
 pending.resolve();assert.deepEqual(await old,current);assert.deepEqual(await api.getConfig(),current);assert.equal(calls,2);
});
test('provider/admin responses prime only public config; legacy array response remains compatible',async()=>{
 const h=createHarness();let calls=0;
 const api=createGasApi({url,fetchImpl:async(...args)=>{calls++;return h.fetch(...args);}});
 const rows=await api.getProviderRequests(h.provider('deepx'));assert.ok(Array.isArray(rows));
 await api.getConfig();assert.equal(calls,1);
 await api.getAdminOverview(h.adminToken());await api.getConfig();assert.equal(calls,2);
 const legacy=createGasApi({url,fetchImpl:async()=>reply([{id:'legacy'}])});
 assert.deepEqual(await legacy.getProviderRequests('token'),[{id:'legacy'}]);
});
test('public reads do not acquire or wait for the writer lock; coherent admin snapshot still does',()=>{
 const h=createHarness(),token=h.provider('deepx'),admin=h.adminToken();
 const row=good(h,'submitRequest',h.form());
 h.beforeNextBatch(()=>{
   const before=h.counters.locks;
   assert.equal(h.call('getConfig').ok,true);
   assert.equal(h.call('getAvailability',{providerId:'deepx'}).ok,true);
   assert.equal(h.call('getProviderRequests',{token}).ok,true);
   assert.equal(h.counters.locks,before);
   assert.equal(h.call('getAdminOverview',{token:admin}).error.code,'BUSY');
 });
 good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
 const overview=good(h,'getAdminOverview',{token:admin});
 assert.equal(overview.requests[0].status,'매칭확정');
 assert.equal(overview.history[0].action,'승인');
});
test('each normal API snapshot uses one batch read; public availability reads only three request columns',()=>{
 const h=createHarness(),provider=h.provider('deepx'),admin=h.adminToken();
 good(h,'submitRequest',h.form());
 const original=h.context.Sheets.Spreadsheets.Values.batchGet, captured=[];
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,options)=>{captured.push([...options.ranges]);return original(id,options);};
 for(const [action,input] of [
   ['getAvailability',{providerId:'deepx'}],['getProviderRequests',{token:provider,includeConfig:true}],
   ['getAdminOverview',{token:admin}]
 ]) {
   const before={...h.counters};good(h,action,input);
   assert.equal(h.counters.batchGets-before.batchGets,1,action);
   assert.equal(h.counters.rangeReads-before.rangeReads,0,action);
   assert.equal(h.counters.opens-before.opens,0,action);
 }
 assert.deepEqual(captured[0].filter(r=>r.startsWith("'상담신청'")),["'상담신청'!A1:Q1","'상담신청'!G2:G","'상담신청'!I2:I","'상담신청'!L2:L"]);
 assert.equal(new Set(captured[2]).size,4);
 const db=h.context.database_(['providers','capacities']),before=h.counters.batchGets;
 h.context.provider_(db,'deepx',true);h.context.slot_(db,'deepx',h.time);h.context.config_(db);
 assert.equal(h.counters.batchGets,before);
});
test('all four data mutations retain the common lock, one fresh batch snapshot, and atomic audit commit',()=>{
 const h=createHarness(),token=h.provider('deepx');
 function check(action,input){
   const before={...h.counters},row=good(h,action,input);
   assert.equal(h.counters.locks-before.locks,1,action);
   assert.equal(h.counters.batchGets-before.batchGets,1,action);
   assert.equal(h.counters.batches-before.batches,1,action);
   assert.ok(h.counters.headerReads-before.headerReads<=1,action+' repeats headers');
   return row;
 }
 const row=check('submitRequest',h.form());
 check('decideRequest',{token,id:row.id,decision:'매칭확정'});
 check('cancelRequest',{id:row.id,email:row.email});
 check('updateProviderCapacity',{token,time:h.time,capacity:2});
});
test('server public config cache expires, capacity invalidates, and in-progress stale fill is abandoned',()=>{
 const h=createHarness(),token=h.provider('deepx');
 let before=h.counters.batchGets;
 good(h,'getConfig');good(h,'getConfig');assert.equal(h.counters.batchGets-before,1);
 h.advance(30001);good(h,'getConfig');assert.equal(h.counters.batchGets-before,2);
 h.beforeNextBatch(()=>assert.equal(good(h,'getConfig').providers[0].capacities[h.time],5));
 good(h,'updateProviderCapacity',{token,time:h.time,capacity:9});
 assert.equal(good(h,'getConfig').providers[0].capacities[h.time],9);
});
test('manual provider/operating edits invalidate with refreshPublicConfig; notice edits bypass cached notice',()=>{
 const h=createHarness();good(h,'getConfig');
 h.sheet('providers').data[1][1]='설정 변경 기업';h.sheet('capacities').data[1][4]=false;
 h.context.refreshPublicConfig();
 const fresh=good(h,'getConfig');assert.equal(fresh.providers[0].name,'설정 변경 기업');
 assert.equal(fresh.providers[0].enabled[h.time],false);
 h.properties.set('PRIVACY_NOTICE_VERSION','updated-notice');
 h.properties.set('PRIVACY_RETENTION_TEXT','운영기관 확정 문구');
 assert.equal(good(h,'getConfig').privacy.version,'updated-notice');
 assert.equal(good(h,'getConfig').privacy.retentionText,'운영기관 확정 문구');
});
test('stale public caches cannot authorize a full, closed, or inactive slot and cannot bypass header validation',()=>{
 const h=createHarness(),token=h.provider('deepx');good(h,'getConfig');
 h.sheet('capacities').data[1][3]=0;
 assert.equal(h.call('submitRequest',h.form()).error.code,'CAPACITY_FULL');
 h.sheet('capacities').data[1][3]=5;h.sheet('providers').data[1][3]=false;
 assert.equal(h.call('submitRequest',h.form()).error.code,'VALIDATION');
 assert.equal(h.call('getProviderRequests',{token}).error.code,'VALIDATION');
 h.sheet('providers').data[0][0]='잘못된 헤더';h.context.refreshPublicConfig();
 assert.equal(h.call('getConfig').error.code,'SETUP_REQUIRED');
});
test('CacheService failure is an optimization miss, not a request failure',()=>{
 const h=createHarness(),cache=h.context.CacheService.getScriptCache;
 h.context.CacheService.getScriptCache=()=>({get(){throw Error('cache offline');},put(){throw Error('cache offline');},remove(){}});
 assert.ok(good(h,'getConfig').providers.length);
 h.context.CacheService.getScriptCache=cache;
});
