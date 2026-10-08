import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './gas-harness.mjs';
import {createGasApi} from '../assets/js/gas-api.js';
const good=(h,action,input={})=>h.value(h.call(action,input));
const state=h=>JSON.parse(h.properties.get('KNPU_REVISIONS_V1')||'null');
const revisions=h=>{const s=state(h);return {global:s.global,admin:s.admin,providers:s.providers,availability:s.availability};};

test('revision migration is lazy and preserves credentials, sessions and all four sheet schemas',()=>{
 const h=createHarness(),token=h.provider('deepx'),before=new Map(h.properties);
 h.properties.delete('KNPU_REVISIONS_V1');
 const schemas=['requests','capacities','history','providers'].map(type=>[...h.sheet(type).data[0]]);
 assert.deepEqual(good(h,'getProviderRevision',{token}),{revision:'0'});
 assert.equal(h.properties.has('KNPU_REVISIONS_V1'),false);
 good(h,'submitRequest',h.form());
 assert.notEqual(good(h,'getProviderRevision',{token}).revision,'0');
 for(const [key,value] of before) if(key!=='KNPU_REVISIONS_V1') assert.equal(h.properties.get(key),value,key);
 assert.deepEqual(['requests','capacities','history','providers'].map(type=>h.sheet(type).data[0]),schemas);
});

test('authenticated revision reads perform zero Sheet I/O and no locks, return only the owned version',()=>{
 const h=createHarness(),token=h.provider('deepx'),admin=h.adminToken();
 good(h,'submitRequest',h.form());
 const before={...h.counters};
 for(let i=0;i<12;i++){
   assert.deepEqual(good(h,'getProviderRevision',{token,providerId:'mobilint'}),{revision:state(h).providers.deepx});
   assert.deepEqual(good(h,'getAdminRevision',{token:admin}),{revision:state(h).admin});
   assert.deepEqual(good(h,'getAvailabilityRevision',{providerId:'deepx'}),{revision:state(h).availability.deepx});
 }
 assert.deepEqual(h.counters,before);
 assert.equal(h.call('getProviderRevision',{}).error.code,'UNAUTHORIZED');
 assert.equal(h.call('getAdminRevision',{token}).error.code,'FORBIDDEN');
 assert.equal(h.call('getProviderRevision',{token:admin}).error.code,'FORBIDDEN');
 assert.equal(h.call('getProviderRevision',{token},'GET').error.code,'METHOD_NOT_ALLOWED');
 assert.equal(h.call('getAvailabilityRevision',{providerId:'unknown'},'GET').error.code,'VALIDATION');
 assert.equal(h.call('getAvailabilityRevision',{providerId:'deepx'},'GET').ok,true);
 good(h,'logout',{token});assert.equal(h.call('getProviderRevision',{token}).error.code,'UNAUTHORIZED');
 h.advance(30*60*1000);assert.equal(h.call('getAdminRevision',{token:admin}).error.code,'UNAUTHORIZED');
});

test('successful events bump exactly the relevant provider/admin/availability revisions',()=>{
 const h=createHarness(),token=h.provider('deepx');
 function event(action,input,{provider='deepx',availability=false}={}){
   const before=revisions(h),row=good(h,action,input),after=revisions(h);
   assert.notEqual(after.global,before.global);assert.notEqual(after.admin,before.admin);
   assert.notEqual(after.providers[provider],before.providers[provider]);
   for(const id of ['deepx','mobilint','furiosa','rebellions']) if(id!==provider){
     assert.equal(after.providers[id],before.providers[id]);assert.equal(after.availability[id],before.availability[id]);
   }
   if(availability)assert.notEqual(after.availability[provider],before.availability[provider]);
   else assert.equal(after.availability[provider],before.availability[provider]);
   return row;
 }
 const a=event('submitRequest',h.form());
 event('submitRequest',h.form({providerId:'mobilint'}),{provider:'mobilint'});
 event('decideRequest',{token,id:a.id,decision:'매칭확정'},{availability:true});
 event('cancelRequest',{id:a.id,email:a.email},{availability:true});
 const b=event('submitRequest',h.form({email:'reject@example.com'}));
 event('decideRequest',{token,id:b.id,decision:'매칭거절',rejectionReason:'기존 회귀 검사용 사유'});
 const c=event('submitRequest',h.form({email:'cancel@example.com'}));
 event('cancelRequest',{id:c.id,email:c.email});
 event('updateProviderCapacity',{token,time:h.time,capacity:1},{availability:true});
});

test('validation failures and idempotent retries never change revisions',()=>{
 const h=createHarness(),token=h.provider('deepx'),row=good(h,'submitRequest',h.form());
 let before=state(h);
 assert.equal(h.call('submitRequest',h.form()).error.code,'DUPLICATE');assert.deepEqual(state(h),before);
 assert.equal(h.call('decideRequest',{token,id:row.id,decision:'invalid'}).error.code,'VALIDATION');assert.deepEqual(state(h),before);
 good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});
 before=state(h);
 good(h,'decideRequest',{token,id:row.id,decision:'매칭확정'});assert.deepEqual(state(h),before);
 assert.equal(h.call('updateProviderCapacity',{token,time:h.time,capacity:0}).error.code,'CAPACITY_TOO_SMALL');assert.deepEqual(state(h),before);
 good(h,'updateProviderCapacity',{token,time:h.time,capacity:2});assert.deepEqual(state(h),before);
 good(h,'cancelRequest',{id:row.id,email:row.email});before=state(h);
 good(h,'cancelRequest',{id:row.id,email:row.email});assert.deepEqual(state(h),before);
 assert.equal(h.call('decideRequest',{token,id:row.id,decision:'매칭확정'}).error.code,'INVALID_STATE');assert.deepEqual(state(h),before);
});

test('revision is published only after atomic data/audit commit and before unlocking',()=>{
 const h=createHarness(),before=revisions(h);
 h.beforeNextBatch(()=>{
   assert.equal(h.locked,true);assert.deepEqual(revisions(h),before);
   assert.equal(h.sheet('requests').data.length,1);assert.equal(state(h).pending,true);
 });
 const properties=h.context.PropertiesService.getScriptProperties(),set=properties.setProperty;
 let published=false;
 properties.setProperty=(key,value)=>{
   if(key==='KNPU_REVISIONS_V1'&&!JSON.parse(value).pending){
     assert.equal(h.locked,true);assert.equal(h.sheet('requests').data.length,2);
     assert.equal(h.sheet('history').data.length,2);published=true;
   }
   return set(key,value);
 };
 good(h,'submitRequest',h.form());assert.equal(published,true);assert.equal(h.locked,false);
});

test('ambiguous Sheet failure never publishes a new revision; pending signal makes clients reconcile',()=>{
 const h=createHarness(),before=revisions(h),token=h.provider('deepx');
 h.failNextBatch();assert.equal(h.call('submitRequest',h.form()).error.code,'INTERNAL');
 assert.deepEqual(revisions(h),before);assert.equal(h.sheet('requests').data.length,1);
 const counters={...h.counters};
 assert.equal(h.call('getProviderRevision',{token}).error.code,'REVISION_PENDING');
 assert.deepEqual(h.counters,counters);
 assert.equal(good(h,'getProviderRequests',{token,includeConfig:true}).revision,null);
 // A later successful writer repairs notification state, without a setup/auth reset.
 good(h,'submitRequest',h.form());assert.equal(state(h).pending,false);
 assert.notEqual(good(h,'getProviderRevision',{token}).revision,before.providers.deepx);
});

test('Properties publish failure after Sheet commit is visible and editor refresh repairs versions without Sheet I/O',()=>{
 const h=createHarness(),token=h.provider('deepx'),properties=h.context.PropertiesService.getScriptProperties();
 const set=properties.setProperty,before=revisions(h);
 properties.setProperty=(key,value)=>{
   if(key==='KNPU_REVISIONS_V1'&&!JSON.parse(value).pending)throw Error('simulated property publication outage');
   return set(key,value);
 };
 assert.equal(h.call('submitRequest',h.form()).error.code,'INTERNAL');
 assert.equal(h.sheet('requests').data.length,2);assert.equal(h.sheet('history').data.length,2);
 assert.deepEqual(revisions(h),before);assert.equal(h.call('getProviderRevision',{token}).error.code,'REVISION_PENDING');
 properties.setProperty=set;
 const reads=h.counters.batchGets;h.context.refreshPublicConfig();
 assert.equal(h.counters.batchGets,reads);assert.equal(state(h).pending,false);
 assert.notEqual(good(h,'getProviderRevision',{token}).revision,before.providers.deepx);
});

test('provider full response carries pre-read revision so a concurrent commit cannot be missed',()=>{
 const h=createHarness(),token=h.provider('deepx'),admin=h.adminToken();
 const before=good(h,'getProviderRevision',{token}).revision;
 const batch=h.context.Sheets.Spreadsheets.Values.batchGet;
 let changed=false;
 h.context.Sheets.Spreadsheets.Values.batchGet=(id,options)=>{
   const response=batch(id,options);
   if(!changed&&options.ranges.includes("'상담신청'!A:Q")){
     changed=true;good(h,'submitRequest',h.form());
   }
   return response;
 };
 const snapshot=good(h,'getProviderRequests',{token,includeConfig:true});
 assert.equal(snapshot.requests.length,0);assert.equal(snapshot.revision,before);
 assert.notEqual(good(h,'getProviderRevision',{token}).revision,snapshot.revision);
 assert.equal(good(h,'getProviderRequests',{token,includeConfig:true}).requests.length,1);
 const overview=good(h,'getAdminOverview',{token:admin});
 assert.equal(overview.revision,good(h,'getAdminRevision',{token:admin}).revision);
});

test('adapter keeps array contract, exposes snapshot revision, uses POST for protected probes and GET for public counts',async()=>{
 const h=createHarness(),provider=h.provider('deepx'),admin=h.adminToken(),calls=[];
 const api=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:async(url,options)=>{
   calls.push({url,options});return h.fetch(url,options);
 }});
 assert.ok(Array.isArray(await api.getProviderRequests(provider)));
 const snapshot=await api.getProviderSnapshot(provider);
 assert.equal(snapshot.revision,(await api.getProviderRevision({token:provider})).revision);
 assert.deepEqual(await api.getAdminRevision({token:admin}),{revision:state(h).admin});
 assert.deepEqual(await api.getAvailabilityRevision('deepx'),{revision:state(h).availability.deepx});
 assert.equal(calls.at(-1).options.method,'GET');
 for(const call of calls.slice(0,-1)){assert.equal(call.options.method,'POST');assert.ok(!call.url.includes(provider));}
 const old=createGasApi({url:'https://script.google.com/macros/s/test/exec',fetchImpl:async()=>new Response(JSON.stringify({ok:true,data:[{id:'legacy'}]}))});
 assert.deepEqual(await old.getProviderSnapshot(provider),{requests:[{id:'legacy'}]});
});

test('30-minute synthetic comparison: 360 probes and 5 changes require 5 full reads after initial load',()=>{
 const h=createHarness(),token=h.provider('deepx'),before=h.counters.batchGets;
 let revision=good(h,'getProviderRequests',{token,includeConfig:true}).revision,full=1;
 const sample=good(h,'getProviderRevision',{token});
 for(let i=1;i<=360;i++){
   if(i%60===0&&i<=300)good(h,'submitRequest',h.form({email:'change-'+i+'@example.com'}));
   const seen=good(h,'getProviderRevision',{token}).revision;
   if(seen!==revision){revision=good(h,'getProviderRequests',{token,includeConfig:true}).revision;full++;}
 }
 assert.equal(full,6);assert.equal(h.counters.batchGets-before,11); // 6 reads + 5 writes' snapshots.
 assert.ok(Buffer.byteLength(JSON.stringify({ok:true,data:sample}),'utf8')<100);
});
